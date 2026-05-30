# -*- coding: utf-8 -*-
"""记忆引擎 —— 艾宾浩斯衰减 + 自动摘要 + 主动消息 + 死信重试队列"""
import os
import re
import time
import json
import asyncio
import uuid

from app.core.config import (
    state, MEM_DIR, CONFIG_DIR, AGENT_PROFILE_DIR, USER_PROFILE_DIR,
    USER_PORTRAIT_DIR, MEMORY_RETRY_DIR, get_decay_score, get_now
)
from app.core.constants import (
    CHAT_HISTORY_FILE, MEMORY_SUMMARY_FILE, USER_PORTRAIT_FILE, AGENT_PROFILE_FILE,
    CHAT_SUMMARY_TRIGGER, CHAT_SUMMARY_SLICE, USER_PORTRAIT_CONTEXT_CHARS,
    MEMORY_DECAY_EVICT, MEMORY_REINFORCE_MIN_LEN,
    DEAD_LETTER_RETRY_INTERVAL, DEAD_LETTER_MAX_RETRIES,
    MEMORY_DECAY_INTERVAL, PROACTIVE_CHECK_INTERVAL,
    EMPTY_PROFILE_THRESHOLD, EMPTY_VALUE_MARKERS,
)
from app.utils.fs_lock import safe_json_read, atomic_json_write, safe_text_read, safe_text_write, safe_text_append
from app.core.llm_engine import call_llm_with_circuit_breaker
from app.utils.logging import logger

# 后台任务引用（由 lifespan 管理）
_bg_tasks: list = []


def extract_clean_json(text: str) -> dict:
    """从 LLM 返回的混合文本中强行提取并解析 JSON 对象（100% 保留原算法）"""
    if not text:
        return {}
    match = re.search(r'```(?:json)?\s*([\s\S]*?)```', text)
    if match:
        text = match.group(1)
    start = text.find('{')
    if start == -1:
        return {}
    depth = 0
    end = start
    for i in range(start, len(text)):
        if text[i] == '{':
            depth += 1
        elif text[i] == '}':
            depth -= 1
            if depth == 0:
                end = i + 1
                break
    if depth != 0:
        return {}
    json_str = text[start:end]
    try:
        clean_str = re.sub(r'[\x00-\x1F]+', ' ', json_str)
        clean_str = re.sub(r',\s*([\]}])', r'\1', clean_str)
        return json.loads(clean_str)
    except (json.JSONDecodeError, ValueError):
        return {}


def _sanitize_text(t: str) -> str:
    if not t:
        return t
    t = str(t)
    t = re.sub(r'[\U0001F300-\U0001F9FF☀-➿⭐✂-➰‍️]', '', t)
    t = t.replace('\\n', '\n')
    t = re.sub(r'\n{3,}', '\n\n', t)
    return t.strip()


# ============================================================================
# 记忆自动摘要（100% 保留原算法）
# ============================================================================
async def auto_summarize_memory(cfg: dict, recent_history: list, is_retry: bool = False) -> bool:
    """从最近对话中提取关键事件，生成私密日记和用户画像"""
    if not is_retry:
        try:
            from app.core.rag_engine import add_to_archive
            await add_to_archive(recent_history)
        except Exception as e:
            logger.error(f"[Memory Engine] RAG 归档异常: {e}")

    try:
        user_portrait_path = os.path.join(USER_PORTRAIT_DIR, USER_PORTRAIT_FILE)
        current_user_portrait = await safe_text_read(user_portrait_path)

        ai_name = cfg.get("ai_name", "AI")
        user_name = cfg.get("user_name", "用户")

        sys_prompt = f"""你是{ai_name}。请阅读以下你和{user_name}的近期对话。

# 提取规则
1. 用 {ai_name} 的第一人称写一段 50 字以内的私密日记。若对话含图片识别结果（以"[图片]"或"[img:"开头的消息），将其视为{user_name}分享的照片事实来记，如"他拍了XXX给我看"，不要写"他发了一张图片"。
2. 提取关于{user_name}的新客观事实（饮食偏好、近期状态、习惯等）。若情报在【已有情报】中已存在则跳过。只写新发现，不推测。
3. 若对话是之前话题的延续且你十分确定，设置 "reinforce" 为 10 字以内的核心短语。不确定则不设此字段。

# 约束
- 绝对不要把 {ai_name} 自己的特征、习惯、行为写进 new_user_profile。
- 只返回纯 JSON，不要包含 ```json 标记。

# 已有情报参考（避免重复）
<existing_profile>
{current_user_portrait[-USER_PORTRAIT_CONTEXT_CHARS:]}
</existing_profile>

# 输出格式
{{"content": "今天他跟我说...（50字以内）", "importance": 整数1-10, "reinforce": "核心短语（可选）", "new_user_profile": "标签化事实，多条用\\n分隔（可选）"}}

【重要度参考】：1-3=日常闲聊, 4-6=有信息量的交流, 7-8=情感波动或重要约定, 9-10=改变关系的重大事件"""

        def _clean_msg(msg):
            content = msg.get('content', '')
            role = ai_name if msg['role'] == 'agent' else user_name
            if re.match(r'^\[img:(?:[a-f0-9]+\.(?:jpg|png)|none)\]$', content):
                return None
            cleaned = re.sub(r'\[img:(?:[a-f0-9]+\.(?:jpg|png)|none)\]', '', content).strip()
            if not cleaned:
                return None
            return f"{role}: {cleaned}"

        lines = []
        for msg in recent_history:
            line = _clean_msg(msg)
            if line:
                lines.append(line)
        chat_text = "\n".join(lines)

        reply = await call_llm_with_circuit_breaker(
            cfg,
            [{"role": "user", "content": sys_prompt + "\n\n[对话记录]：\n" + chat_text}],
            use_fallback=False
        )
        if not reply:
            logger.warning("[WARN] 记忆自动摘要中止：大模型无响应或触发熔断，已加入重试队列。")
            await _enqueue_retry(cfg, recent_history)
            return False

        new_mem = extract_clean_json(reply)
        if not new_mem:
            logger.warning(f"[WARN] LLM返回无法解析的JSON格式，已拦截并加入重试队列。原始回复前100字: {reply[:100]}")
            await _enqueue_retry(cfg, recent_history)
            return False

        if new_mem.get("content"):
            new_mem["content"] = _sanitize_text(new_mem["content"])
        if new_mem.get("new_user_profile"):
            new_mem["new_user_profile"] = _sanitize_text(new_mem["new_user_profile"])

        # 写入长期记忆
        summary_file = os.path.join(MEM_DIR, MEMORY_SUMMARY_FILE)
        mem_data = await safe_json_read(summary_file, {"items": []})
        reinforced = False
        reinforce_kw = str(new_mem.get("reinforce", "")).strip()
        reinforce_kw = _sanitize_text(reinforce_kw)

        if len(reinforce_kw) >= MEMORY_REINFORCE_MIN_LEN and reinforce_kw.lower() not in EMPTY_VALUE_MARKERS:
            items = mem_data.get("items", [])
            for old in items:
                old_content = old.get("content", "")
                if reinforce_kw in old_content:
                    old["time"] = get_now()
                    old["importance"] = min(10, int(old.get("importance", 5)) + 1)
                    reinforced = True
                    logger.info(f"[记忆强化] 刷新 +1: {reinforce_kw[:30]}")
                    break

        if not reinforced and new_mem.get("content"):
            new_mem['time'] = get_now()
            mem_data['items'].append(new_mem)

        await atomic_json_write(summary_file, mem_data)

        # 写入用户画像
        new_facts = new_mem.get("new_user_profile", "")
        if new_facts and str(new_facts).strip().lower() not in EMPTY_VALUE_MARKERS:
            entry = f"\n\n【{get_now()}】\n{new_facts}"
            await safe_text_append(user_portrait_path, entry)

        logger.info("[记忆引擎] 时间衰减机制刷新完毕，画像提取成功！")
        return True

    except Exception as e:
        logger.error(f"[Memory Engine] 自动摘要任务异常: {e}")
        await _enqueue_retry(cfg, recent_history)
        return False


async def _enqueue_retry(cfg: dict, recent_history: list):
    """将失败的摘要任务写入死信队列"""
    retry_file = os.path.join(MEMORY_RETRY_DIR, f"retry_{uuid.uuid4().hex}.json")
    payload = {
        "cfg": {k: v for k, v in cfg.items() if k in ("ai_name", "user_name", "url", "key", "model")},
        "history": recent_history,
        "created": get_now(),
        "attempts": 0
    }
    await atomic_json_write(retry_file, payload)
    logger.info(f"[死信队列] 摘要任务已暂存: {os.path.basename(retry_file)}")


# ============================================================================
# 后台工作线程（asyncio task 替代 threading.Thread）
# ============================================================================
async def _memory_retry_worker():
    """后台：定期扫描死信队列，系统上线后重试失败的摘要任务"""
    while True:
        await asyncio.sleep(DEAD_LETTER_RETRY_INTERVAL)
        try:
            conn_status = await state.conn_status
            if conn_status != "online":
                continue

            retry_files = sorted(
                [f for f in os.listdir(MEMORY_RETRY_DIR) if f.endswith('.json')],
                key=lambda f: os.path.getmtime(os.path.join(MEMORY_RETRY_DIR, f))
            )
            if not retry_files:
                continue

            fname = retry_files[0]
            fpath = os.path.join(MEMORY_RETRY_DIR, fname)
            task_data = await safe_json_read(fpath, {})

            if not task_data or not task_data.get("history"):
                try:
                    os.remove(fpath)
                except Exception:
                    pass
                continue

            cfg = task_data.get("cfg", {})
            cfg_path = os.path.join(CONFIG_DIR, "config.json")
            full_cfg = await safe_json_read(cfg_path, {})
            if full_cfg:
                cfg = {**cfg, **{k: v for k, v in full_cfg.items() if k not in cfg}}

            attempts = task_data.get("attempts", 0) + 1
            logger.info(f"[死信队列] 正在重试: {fname} (第{attempts}次)")

            success = await auto_summarize_memory(cfg, task_data["history"], is_retry=True)
            if success:
                try:
                    os.remove(fpath)
                except Exception:
                    pass
                logger.info(f"[死信队列] 重试成功，已清理: {fname}")
            elif attempts >= DEAD_LETTER_MAX_RETRIES:
                try:
                    os.remove(fpath)
                except Exception:
                    pass
                logger.info(f"[死信队列] 超过最大重试次数，已丢弃: {fname}")
            else:
                task_data["attempts"] = attempts
                await atomic_json_write(fpath, task_data)

        except Exception as e:
            logger.error(f"[Memory Engine] 重试队列异常: {e}")


async def _memory_decay_cleaner():
    """后台：每30分钟对所有长期记忆做一次衰减评分，剔除已归零的记忆"""
    while True:
        await asyncio.sleep(MEMORY_DECAY_INTERVAL)
        try:
            summary_file = os.path.join(MEM_DIR, MEMORY_SUMMARY_FILE)
            mem_data = await safe_json_read(summary_file, {"items": []})
            items = mem_data.get('items', [])
            if not items:
                continue
            before = len(items)
            items = [m for m in items if get_decay_score(m) >= MEMORY_DECAY_EVICT]
            if len(items) < before:
                mem_data['items'] = items
                await atomic_json_write(summary_file, mem_data)
                logger.info(f"[记忆清理] 衰减剔除 {before - len(items)} 条，剩余 {len(items)} 条")
        except Exception as e:
            logger.error(f"[Memory Engine] 记忆衰减任务异常: {e}")


async def _proactive_worker():
    """后台：空闲时主动发消息关怀用户"""
    while True:
        await asyncio.sleep(PROACTIVE_CHECK_INTERVAL)
        try:
            cfg_path = os.path.join(CONFIG_DIR, "config.json")
            cfg = await safe_json_read(cfg_path, {})
            if not cfg.get("proactive_enabled", False):
                continue

            now = time.strftime("%H:%M")
            start_str = cfg.get("proactive_start", "00:00")
            end_str = cfg.get("proactive_end", "23:59")

            if start_str <= end_str:
                if not (start_str <= now <= end_str):
                    continue
            else:
                if not (now >= start_str or now <= end_str):
                    continue

            last_time = await state.last_interaction_time
            target_delay = await state.next_proactive_delay
            passed_time = time.time() - last_time

            if passed_time <= target_delay:
                continue

            ai_name = cfg.get("ai_name", "AI")
            user_name = cfg.get("user_name", "用户")
            history_file = os.path.join(MEM_DIR, CHAT_HISTORY_FILE)

            history = await safe_json_read(history_file, [])

            # 主动消息熔断：末尾连续 agent 消息数达阈值则跳过
            max_continuous = int(cfg.get("proactive_max_continuous", 5))
            if len(history) >= max_continuous:
                tail_agent_count = 0
                for msg in reversed(history):
                    if msg.get("role") == "agent":
                        tail_agent_count += 1
                    else:
                        break
                if tail_agent_count >= max_continuous:
                    continue

            recent = history[-6:]

            context_str = ""
            if recent:
                lines = []
                for m in recent:
                    role = ai_name if m['role'] == 'agent' else user_name
                    lines.append(f"{role}: {m['content']}")
                context_str = "\n".join(lines)

            profile_text = ""
            profile_path = os.path.join(AGENT_PROFILE_DIR, AGENT_PROFILE_FILE)
            if os.path.exists(profile_path):
                profile_text = (await safe_text_read(profile_path)).strip()

            # 读取最新一条长期记忆
            latest_memory = ""
            summary_file = os.path.join(MEM_DIR, MEMORY_SUMMARY_FILE)
            mem_data = await safe_json_read(summary_file, {"items": []})
            items = mem_data.get("items", [])
            if items:
                latest = items[-1]
                latest_memory = latest.get("content", "")

            # 保底机制：无记忆内容 且 档案不足 20 字时触发
            fallback_hint = ""
            if not latest_memory and len(profile_text) < EMPTY_PROFILE_THRESHOLD:
                fallback_hint = "\n当前系统内容较为精简，用户可能尚在测试或尚未完善配置。请以自然随和的方式简单开启对话，无需过度依赖背景设定。"
            elif latest_memory:
                latest_memory = f"\n【近期关键记忆】\n{latest_memory}"

            prompt = f"""你是{ai_name}。
【人设】{profile_text}{latest_memory}

以下是你们最近的对话：

{context_str}

{user_name}已经有一段时间未回复。请结合你的人设与上述对话，自然延续话题发出消息。若有未竟之事可表示关心，若对话中断可尝试接续。{fallback_hint}
要求：不超过20字，使用口语化第一人称，仅输出对话内容本身，无需任何前缀或解释。"""

            snap_time = await state.last_interaction_time
            reply = await call_llm_with_circuit_breaker(cfg, [{"role": "user", "content": prompt}], use_fallback=False)

            if reply:
                # 再次检查用户是否已抢先回复
                if await state.last_interaction_time != snap_time:
                    logger.info("[主动消息] 用户抢先发言，丢弃")
                    continue

                parts = [p.strip() for p in re.split(r'(?<=[。！？!?\n])', reply) if p.strip()]
                if not parts:
                    parts = [reply]

                history = await safe_json_read(history_file, [])
                for p in parts:
                    history.append({"role": "agent", "content": p, "time": get_now()})

                start_summary = False
                to_summarize = []
                if len(history) >= CHAT_SUMMARY_TRIGGER:
                    to_summarize = history[:CHAT_SUMMARY_SLICE]
                    history = history[CHAT_SUMMARY_SLICE:]
                    start_summary = True

                await atomic_json_write(history_file, history)

                if start_summary:
                    asyncio.create_task(auto_summarize_memory(cfg, to_summarize))

                await state.update_interaction_time(cfg)
                logger.info("[主动消息] 已推入时间流")

        except Exception as e:
            logger.error(f"[Memory Engine] 主动消息任务异常: {e}")


def start_background_tasks():
    """启动所有后台异步任务（由 lifespan 调用）"""
    global _bg_tasks
    _bg_tasks = [
        asyncio.create_task(_memory_decay_cleaner()),
        asyncio.create_task(_proactive_worker()),
        asyncio.create_task(_memory_retry_worker()),
    ]
    logger.info("记忆引擎后台守护已就绪 (3 workers)")


async def stop_background_tasks():
    """停止所有后台任务"""
    global _bg_tasks
    for t in _bg_tasks:
        if not t.done():
            t.cancel()
    # 等待所有任务确认取消
    for t in _bg_tasks:
        try:
            await t
        except asyncio.CancelledError:
            pass
        except Exception:
            pass
    _bg_tasks = []
    logger.info("记忆引擎后台守护已安全下线")
