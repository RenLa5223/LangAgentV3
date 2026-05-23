# -*- coding: utf-8 -*-
"""聊天相关 API 端点"""
import os
import asyncio
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional

from app.core.config import MEM_DIR
from app.core.llm_engine import get_or_generate_signature
from app.utils.fs_lock import safe_json_read
from app.utils.logging import logger
from app.api.deps import get_config
from app.services.chat_service import handle_send_message

router = APIRouter(prefix="/api", tags=["chat"])


# --- 请求体模型 ---
class ChatRequest(BaseModel):
    message: str = ""
    image: Optional[str] = None


# --- 内存缓存（减少每秒轮询的磁盘 I/O）---
_poll_cache = {"mtime": 0, "data": []}


@router.get("/poll")
async def poll_messages(count: int = 0):
    """轮询新消息（带内存缓存）"""
    history_file = os.path.join(MEM_DIR, "chat_history.json")
    try:
        cur_mtime = os.path.getmtime(history_file)
    except Exception:
        cur_mtime = 0

    global _poll_cache
    if cur_mtime != _poll_cache["mtime"]:
        _poll_cache["data"] = await safe_json_read(history_file, [])
        _poll_cache["mtime"] = cur_mtime

    history = _poll_cache["data"]
    new_msgs = history[count:] if len(history) > count else []
    return {"new_messages": new_msgs}


@router.post("/chat")
async def send_chat_message(req: ChatRequest, cfg: dict = Depends(get_config)):
    """发送聊天消息 —— 核心 LLM Pipeline"""
    # 更新交互时间
    from app.core.config import state
    await state.update_interaction_time(cfg)

    # 后台异步生成签名
    asyncio.create_task(get_or_generate_signature(cfg))

    result = await handle_send_message(cfg, req.message, req.image)

    if "error" in result:
        return result

    return result


@router.get("/signature")
async def get_signature(cfg: dict = Depends(get_config)):
    """获取今日签名"""
    if not cfg.get("ai_name"):
        raise HTTPException(status_code=400, detail="Agent 名称未配置")
    sig = await get_or_generate_signature(cfg)
    return {"signature": sig}
