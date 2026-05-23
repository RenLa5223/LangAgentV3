# -*- coding: utf-8 -*-
"""大模型调用引擎 —— 断路器模式 + 上下文构建 + 消息组装（100% 算法保留）"""
import json
import time
import asyncio
import urllib.request
import urllib.error
import os

from app.core.config import (
    state, MEM_DIR, CONFIG_DIR, AGENT_PROFILE_DIR, USER_PROFILE_DIR, USER_PORTRAIT_DIR,
    _strip_think, get_now
)
from app.core.constants import (
    CHAT_HISTORY_FILE, MEMORY_SUMMARY_FILE, DAILY_SIGNATURE_FILE,
    AGENT_PROFILE_FILE, USER_PROFILE_FILE,
    MODEL_TIMEOUT_DEFAULT, CIRCUIT_BREAKER_TRIP_COUNT, CIRCUIT_BREAKER_COOLDOWN,
    LLM_RETRY_ATTEMPTS, LLM_RETRY_DELAY,
    API_FORMAT_OPENAI, API_FORMAT_ANTHROPIC,
    ANTHROPIC_MAX_TOKENS, RAG_CONTEXT_TRUNCATE, EMPTY_PROFILE_THRESHOLD,
)
from app.utils.constants import _MODEL_ERR
from app.utils.fs_lock import safe_json_read, atomic_json_write
from app.utils.logging import logger


# ============================================================================
# 上下文构建
# ============================================================================
async def build_chat_context(cfg: dict) -> tuple:
    """构建聊天上下文（人设 + 档案 + 记忆 + 历史）"""
    ai_name = cfg.get("ai_name", "AI")
    user_name = cfg.get("user_name", "用户")
    system_prompt = f"你是{ai_name}。请严格遵循人设与我聊天，永远不要承认自己是AI程序，保持自然的情感。\n\n【基础档案】\n"

    profile_path = os.path.join(AGENT_PROFILE_DIR, AGENT_PROFILE_FILE)
    if os.path.exists(profile_path):
        from app.utils.fs_lock import safe_text_read
        txt = await safe_text_read(profile_path)
        system_prompt += txt + "\n"

    user_profile_path = os.path.join(USER_PROFILE_DIR, USER_PROFILE_FILE)
    if os.path.exists(user_profile_path):
        from app.utils.fs_lock import safe_text_read
        u_info = (await safe_text_read(user_profile_path)).strip()
        if u_info:
            system_prompt += f"\n【{user_name}（我）的档案】\n{u_info}\n"

    summary_file = os.path.join(MEM_DIR, MEMORY_SUMMARY_FILE)
    mem_summary = await safe_json_read(summary_file, {})
    if mem_summary.get('items'):
        system_prompt += "\n【长期记忆日记】\n"
        for m in mem_summary['items']:
            system_prompt += f"- [{m['time']}] {m['content']}\n"

    history_file = os.path.join(MEM_DIR, CHAT_HISTORY_FILE)
    chat_history = await safe_json_read(history_file, [])

    system_prompt += """
\n# 信息来源处理规则
当你在对话中看到以下标记时，请将其映射为人类的自然感官：
- 看到 [图片识别结果]... 时：这是你亲眼看到的画面。直接发表看后的感受、评论或疑问，不要说"根据图片识别结果"这类话。
- 看到 [联网实时搜索结果]... 时：这是你刚刚了解到的新信息。用"我刚看到"、"听说"、"原来"这类自然口吻表达，不要列举条目或说"搜索结果显示"。
- 牢记：你是有感官的人类，不是读取数据的机器。"""

    return system_prompt, chat_history, history_file


async def build_llm_messages(system_prompt: str, chat_history: list, current_user_msg) -> list:
    """构建符合标准 OpenAI API 规范的消息数组"""
    # RAG 历史区块检索注入
    query_text = current_user_msg if isinstance(current_user_msg, str) else current_user_msg[0].get("text", "")
    try:
        from app.core.rag_engine import search as rag_search
        rag_results = await rag_search(query_text)
        if rag_results:
            rag_context = "\n\n【历史记忆检索】（与当前话题相关的过往记录片段，若相关请参考）\n"
            for res in rag_results:
                rag_context += f"-[{res['time']}] {res['content'][:RAG_CONTEXT_TRUNCATE]}...\n"
            system_prompt += rag_context
    except Exception:
        pass

    messages = []

    if system_prompt:
        messages.append({"role": "system", "content": system_prompt})

    for msg in chat_history:
        role = "assistant" if msg.get("role") == "agent" else msg.get("role", "user")
        messages.append({"role": role, "content": msg.get("content", "")})

    if current_user_msg:
        messages.append({"role": "user", "content": current_user_msg})

    return messages


# ============================================================================
# LLM 调用核心（带断路器）—— 100% 保留原逻辑
# ============================================================================
async def call_llm_with_circuit_breaker(cfg: dict, messages: list, use_fallback: bool = True) -> str:
    """调用 LLM API，带断路器模式"""

    # 检查冷却期
    cooldown = await state.api_cooldown_until
    if time.time() < cooldown:
        return f"{_MODEL_ERR}|触发断路保护(冷却中)" if use_fallback else None

    # 将同步 HTTP 调用包装为线程池异步
    result = await asyncio.to_thread(_sync_llm_call, cfg, messages, use_fallback)

    # 在线程池返回后，在主事件循环中更新状态
    if result and result.startswith(_MODEL_ERR):
        fail_count = await state.inc_failures()
        if fail_count >= CIRCUIT_BREAKER_TRIP_COUNT:
            await state.set_api_cooldown(time.time() + CIRCUIT_BREAKER_COOLDOWN)
        await state.set_conn_status("offline")
    else:
        await state.reset_failures()
        await state.set_conn_status("online")

    return result


def _sync_llm_call(cfg: dict, messages: list, use_fallback: bool) -> str:
    """同步 LLM 调用核心（在线程池中执行）"""
    timeout = int(cfg.get('model_timeout', MODEL_TIMEOUT_DEFAULT))
    api_format = cfg.get("api_format", API_FORMAT_OPENAI)

    # 构建请求体
    if api_format == API_FORMAT_ANTHROPIC:
        system_text = None
        anthropic_msgs = []
        for m in messages:
            if m["role"] == "system":
                system_text = m.get("content", "")
            else:
                role = "assistant" if m.get("role") == "agent" else m.get("role", "user")
                anthropic_msgs.append({"role": role, "content": m.get("content", "")})
        payload = {"model": cfg['model'], "messages": anthropic_msgs, "max_tokens": ANTHROPIC_MAX_TOKENS, "stream": False}
        if system_text:
            payload["system"] = system_text
    else:
        payload = {"model": cfg['model'], "messages": messages, "stream": False}

    last_err_msg = "Unknown Error"
    for attempt in range(LLM_RETRY_ATTEMPTS):
        has_image = False
        for m in messages:
            if isinstance(m.get("content"), list):
                for c in m["content"]:
                    if isinstance(c, dict) and c.get("type") == "image_url":
                        has_image = True
                        break

        if attempt > 0:
            if api_format == API_FORMAT_ANTHROPIC:
                payload = {"model": cfg['model'], "messages": anthropic_msgs, "max_tokens": ANTHROPIC_MAX_TOKENS, "stream": False}
                if system_text:
                    payload["system"] = system_text
            else:
                payload = {"model": cfg['model'], "messages": messages, "stream": False}

        try:
            req = urllib.request.Request(cfg['url'], data=json.dumps(payload).encode('utf-8'), method='POST')
            req.add_header('Content-Type', 'application/json')
            if cfg['key'].strip():
                if api_format == API_FORMAT_ANTHROPIC:
                    req.add_header('x-api-key', cfg['key'])
                else:
                    req.add_header('Authorization', f"Bearer {cfg['key']}")

            resp = urllib.request.urlopen(req, timeout=timeout)
            if resp.getcode() != 200:
                raise Exception("HTTP Error")
            resp_data = json.loads(resp.read().decode('utf-8'))

            api_err = resp_data.get('error')
            if api_err:
                err_msg = api_err.get('message', '') if isinstance(api_err, dict) else str(api_err)
                if not err_msg:
                    err_msg = str(api_err)[:200]
                raise Exception(f"API Error: {err_msg}")

            # 提取回复文本
            if api_format == API_FORMAT_ANTHROPIC:
                reply = "".join([b.get("text", "") for b in resp_data.get("content", [])])
            else:
                reply = (resp_data.get('choices', [{}])[0].get('message', {}).get('content', '')
                         or resp_data.get('response', '')
                         or resp_data.get('message', {}).get('content', ''))
            if reply:
                reply = _strip_think(reply)

            return reply

        except urllib.error.HTTPError as e:
            last_err_msg = str(e)
            time.sleep(LLM_RETRY_DELAY)
        except Exception as e:
            last_err_msg = str(e)
            time.sleep(LLM_RETRY_DELAY)

    # 2 次都失败
    return f"{_MODEL_ERR}|{last_err_msg}" if use_fallback else None


# ============================================================================
# 签名生成
# ============================================================================
async def get_or_generate_signature(cfg: dict) -> str:
    """获取今天的签名，没有则调用模型生成"""
    try:
        sig_file = os.path.join(MEM_DIR, DAILY_SIGNATURE_FILE)
        today_str = time.strftime("%Y-%m-%d")

        sig_data = await safe_json_read(sig_file, {})

        if sig_data.get("date") == today_str and sig_data.get("signature"):
            return sig_data["signature"]

        # 读取人设档案和最新记忆
        profile_text = ""
        profile_path = os.path.join(AGENT_PROFILE_DIR, AGENT_PROFILE_FILE)
        if os.path.exists(profile_path):
            from app.utils.fs_lock import safe_text_read
            profile_text = (await safe_text_read(profile_path)).strip()

        latest_memory = ""
        summary_file = os.path.join(MEM_DIR, MEMORY_SUMMARY_FILE)
        mem_data = await safe_json_read(summary_file, {"items": []})
        items = mem_data.get("items", [])
        if items:
            latest_memory = items[-1].get("content", "")

        fallback_hint = ""
        if not latest_memory and len(profile_text) < EMPTY_PROFILE_THRESHOLD:
            fallback_hint = "当前系统内容较为精简，用户可能尚在测试阶段。请以通用的社交风格生成签名。"

        sys_prompt = (f"你是{cfg.get('ai_name', 'AI')}。"
                      f"【人设】{profile_text}"
                      f"{'【近期关键记忆】' + latest_memory if latest_memory else ''}"
                      f"请编写一句十五字以内的社交平台个性签名。"
                      f"要求：口语化第一人称，体现人设气质或当前状态。{fallback_hint}"
                      f"仅返回签名文本，无需解释或引号。")

        ai_reply = await call_llm_with_circuit_breaker(
            cfg,
            [{"role": "user", "content": sys_prompt}],
            use_fallback=False
        )
        if ai_reply:
            new_sig = ai_reply.strip(' "\'\n')
            await atomic_json_write(sig_file, {"date": today_str, "signature": new_sig})
            return new_sig
        return sig_data.get("signature", "")

    except Exception:
        return ""
