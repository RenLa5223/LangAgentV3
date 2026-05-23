# -*- coding: utf-8 -*-
"""聊天业务服务层"""
import os
import re
import asyncio
import uuid
import base64
import time

from app.core.config import MEM_DIR, TEMP_IMG_DIR, get_now
from app.core.constants import CHAT_HISTORY_FILE, CHAT_SUMMARY_TRIGGER, CHAT_SUMMARY_SLICE
from app.core.llm_engine import (
    call_llm_with_circuit_breaker,
    build_chat_context,
    build_llm_messages,
    get_or_generate_signature
)
from app.utils.fs_lock import safe_json_read, atomic_json_write
from app.utils.constants import _MODEL_ERR
from app.utils.logging import logger


async def process_ai_response(cfg: dict, ai_reply: str, user_texts: list, history_file: str) -> list:
    """统一处理 AI 回复分条、聊天历史落库与长时记忆摘要触发"""
    parts = [p.strip() for p in re.split(r'(?<=[。！？!?\n])', ai_reply) if p.strip()]
    if not parts:
        parts = [ai_reply if ai_reply else "模型无响应"]

    start_summary = False
    to_summarize = []
    safe_chat = await safe_json_read(history_file, [])
    for t in user_texts:
        safe_chat.append({"role": "user", "content": t, "time": get_now()})
    for p in parts:
        safe_chat.append({"role": "agent", "content": p, "time": get_now()})

    if len(safe_chat) >= CHAT_SUMMARY_TRIGGER:
        to_summarize = safe_chat[:CHAT_SUMMARY_SLICE]
        safe_chat = safe_chat[CHAT_SUMMARY_SLICE:]
        start_summary = True
    await atomic_json_write(history_file, safe_chat)

    if start_summary:
        for msg in to_summarize:
            content = msg.get("content", "")
            m = re.search(r'\[img:([a-f0-9]+\.(?:jpg|png))\]', content)
            if m:
                try:
                    os.remove(os.path.join(TEMP_IMG_DIR, m.group(1)))
                except Exception:
                    pass
        from app.core.memory_engine import auto_summarize_memory
        asyncio.create_task(auto_summarize_memory(cfg, to_summarize))

    return parts


async def handle_send_message(cfg: dict, user_text: str, image_base64: str = None) -> dict:
    """处理用户消息 —— 完整的 Chat Pipeline"""
    history_file = os.path.join(MEM_DIR, "chat_history.json")

    # 图片处理逻辑
    temp_img_filename = None

    if image_base64:
        try:
            header, b64 = image_base64.split(",", 1)
            ext = "png" if "png" in header else "jpg"
            temp_img_filename = f"{uuid.uuid4().hex}.{ext}"
            img_path = os.path.join(TEMP_IMG_DIR, temp_img_filename)
            import asyncio as _asyncio

            def _save_img():
                with open(img_path, "wb") as f:
                    f.write(base64.b64decode(b64))

            await _asyncio.to_thread(_save_img)
        except Exception:
            temp_img_filename = None

        user_msg = [
            {"type": "text", "text": user_text if user_text else "请看一下这张图片。"},
            {"type": "image_url", "image_url": {"url": image_base64}}
        ]
    else:
        user_msg = user_text

    # 构建上下文 + 调用 LLM
    system_prompt, chat_history, _ = await build_chat_context(cfg)
    llm_messages = await build_llm_messages(system_prompt, chat_history, user_msg)

    ai_reply = await call_llm_with_circuit_breaker(cfg, llm_messages, use_fallback=True)

    _model_failed = ai_reply and ai_reply.strip().startswith(_MODEL_ERR)
    if _model_failed:
        err_detail = ai_reply.split('|')[1] if '|' in ai_reply else "模型无响应"
        return {"error": "api_error", "message": f"模型调用失败: {err_detail}"}

    # 构建聊天记录文本
    if user_text and temp_img_filename:
        fallback_text = user_text + "\n[img:" + temp_img_filename + "]"
    elif temp_img_filename:
        fallback_text = "[img:" + temp_img_filename + "]"
    elif user_text:
        fallback_text = user_text
    else:
        fallback_text = "[img:none]"

    parts = await process_ai_response(cfg, ai_reply, [fallback_text], history_file)

    response_payload = {"reply_parts": parts}

    if cfg.get("audio_url"):
        response_payload["audio_url"] = cfg["audio_url"]

    return response_payload
