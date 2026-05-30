# -*- coding: utf-8 -*-
"""外部通道协议 —— 供微信机器人等外部大脑调用的全链路对话 API"""
import os
import hmac

from fastapi import APIRouter, HTTPException, Header, Depends
from pydantic import BaseModel
from typing import Optional

from app.core.config import CONFIG_DIR, state
from app.core.constants import CONFIG_FILE
from app.core.llm_engine import get_or_generate_signature
from app.utils.fs_lock import safe_json_read
from app.utils.logging import logger
from app.services.chat_service import handle_send_message

router = APIRouter(prefix="/api/v1", tags=["webhook"])


class SyncInvokeRequest(BaseModel):
    user_text: str = ""
    image_base64: Optional[str] = None


async def _verify_external_api_key(x_api_key: str = Header(default="", alias="X-API-Key")) -> str:
    """独立于前端 Session 的 API KEY 鉴权"""
    config_path = os.path.join(CONFIG_DIR, CONFIG_FILE)
    cfg = await safe_json_read(config_path, {})
    expected_key = cfg.get("external_api_key", "")

    if not expected_key:
        return x_api_key

    if not x_api_key or not hmac.compare_digest(x_api_key, expected_key):
        logger.warning("[Webhook] 外部 API KEY 验证失败")
        raise HTTPException(status_code=403, detail="无效的外部 API KEY")

    return x_api_key


@router.post("/chat/sync_invoke")
async def sync_invoke(
    req: SyncInvokeRequest,
    x_api_key: str = Depends(_verify_external_api_key)
):
    """同步对话调用：完全复用 chat_service 管线，直接返回 JSON 结果"""
    config_path = os.path.join(CONFIG_DIR, CONFIG_FILE)
    cfg = await safe_json_read(config_path, {})

    await state.update_interaction_time(cfg)

    import asyncio
    asyncio.create_task(get_or_generate_signature(cfg))

    result = await handle_send_message(cfg, req.user_text, req.image_base64)

    if "error" in result:
        return result

    return {
        "reply_parts": result.get("reply_parts", []),
        "audio_url": result.get("audio_url"),
    }
