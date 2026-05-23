# -*- coding: utf-8 -*-
"""FastAPI 共享依赖项"""
import os
import hmac
from fastapi import Header, HTTPException, Depends, Request
from app.core.config import CONFIG_DIR, settings
from app.utils.fs_lock import safe_json_read, lock_registry
from app.utils.logging import trace_id_ctx, logger


async def get_config() -> dict:
    """获取当前配置（每次请求读取最新值）"""
    config_path = os.path.join(CONFIG_DIR, "config.json")
    cfg = {
        "url": "", "key": "", "model": "",
        "ai_name": "", "user_name": "", "api_format": "openai"
    }
    loaded = await safe_json_read(config_path, {})
    cfg.update(loaded)
    return cfg


async def get_file_lock(filepath: str):
    """获取文件专用的 asyncio lock"""
    return await lock_registry.get_lock(filepath)


def get_trace_id() -> str:
    """获取当前请求的追踪 ID"""
    return trace_id_ctx.get()


async def verify_session_dependency(
    request: Request,
    x_api_token: str = Header(default="", alias="X-API-Token")
):
    """
    FastAPI 依赖：验证 API Token。
    仅从 Header X-API-Token 读取，决不消费请求体（否则后续路由无法读取 body）。
    """
    expected = getattr(request.app.state, "session_token", "")
    if not expected or not x_api_token or not hmac.compare_digest(x_api_token, expected):
        logger.warning(f"[SECURITY] Token 验证失败 - {request.method} {request.url.path}")
        raise HTTPException(status_code=403, detail="无效的安全令牌，请刷新页面重试")

    return x_api_token
