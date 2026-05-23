# -*- coding: utf-8 -*-
"""系统健康/状态 API 端点"""
import os
import platform
import subprocess
from fastapi import APIRouter
from app.core.config import settings, state, DATA_DIR
from app.utils.logging import logger, get_log_stream
router = APIRouter(prefix="/api", tags=["system"])


@router.get("/health")
async def health_check():
    """全链路健康诊断"""
    health_data = {
        "status": "ok",
        "core_server": "online",
        "config_fs": "offline"
    }
    config_path = os.path.join(DATA_DIR, "config", "config.json")
    if os.path.exists(config_path):
        health_data["config_fs"] = "online"

    return health_data


@router.get("/status")
async def get_status():
    """获取连接状态"""
    s = await state.conn_status
    return {"status": s}


@router.get("/version")
async def get_version():
    """获取应用版本"""
    return {"version": settings.APP_VERSION}


@router.get("/show")
async def show_window():
    """恢复窗口（桌面模式下由 pywebview 处理）"""
    return {"status": "ok"}


@router.get("/logs/stream")
async def logs_stream():
    """获取实时日志流（最近 20000 字符）"""
    content = get_log_stream()
    from fastapi.responses import PlainTextResponse
    return PlainTextResponse(content=content, media_type="text/plain; charset=utf-8")


@router.get("/logs/open_folder")
async def open_logs_folder():
    """打开日志文件夹"""
    log_dir = os.path.join(DATA_DIR, "logs")
    os.makedirs(log_dir, exist_ok=True)
    try:
        if platform.system() == "Windows":
            subprocess.Popen(['explorer', os.path.normpath(log_dir)])
        elif platform.system() == "Darwin":
            subprocess.Popen(["open", log_dir])
        else:
            subprocess.Popen(["xdg-open", log_dir])
        return {"status": "ok"}
    except Exception:
        return {"status": "error"}
