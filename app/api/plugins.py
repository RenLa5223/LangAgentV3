# -*- coding: utf-8 -*-
"""插件管理 API —— 列表、启停、静态资源服务"""
import os
import subprocess
import platform

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel

from app.core.config import PLUGIN_DIR
from app.core.plugin_manager import plugin_manager
from app.utils.fs_lock import safe_json_read, atomic_json_write
from app.utils.logging import logger

router = APIRouter(prefix="/api/plugins", tags=["plugins"])


class ToggleRequest(BaseModel):
    plugin_id: str
    enabled: bool = None
    blocked: bool = None


@router.get("/list")
async def list_plugins():
    """获取所有插件的 manifest 摘要列表"""
    return {"plugins": plugin_manager.list_plugins()}


@router.post("/reload")
async def reload_plugins():
    """热插拔硬刷新：清空内存缓存，从磁盘重新扫描全部插件"""
    plugin_manager.reload_plugins()
    return {"success": True, "plugins": plugin_manager.list_plugins()}


@router.post("/toggle")
async def toggle_plugin(req: ToggleRequest):
    """修改插件的启用/屏蔽状态"""
    ok = plugin_manager.toggle_plugin(req.plugin_id, req.enabled, req.blocked)
    if not ok:
        raise HTTPException(status_code=404, detail="插件不存在")
    return {"success": True}


@router.get("/static/{plugin_id}/{filename:path}")
async def serve_plugin_static(plugin_id: str, filename: str):
    """提供插件自带前端页面的静态资源（iframe 沙盒加载）"""
    plugin_info = plugin_manager._plugins.get(plugin_id)
    if not plugin_info:
        raise HTTPException(status_code=404, detail="插件不存在")

    if plugin_info.get("blocked"):
        raise HTTPException(status_code=403, detail="插件已被屏蔽")

    file_path = os.path.normpath(os.path.join(plugin_info["_plugin_dir"], "static", filename))
    # 安全检查：防止路径穿越
    allowed_root = os.path.normpath(os.path.join(plugin_info["_plugin_dir"], "static"))
    if not file_path.startswith(allowed_root):
        raise HTTPException(status_code=403, detail="路径越权")

    if not os.path.isfile(file_path):
        raise HTTPException(status_code=404, detail="文件不存在")

    return FileResponse(file_path)


@router.get("/settings/{plugin_id}")
async def get_plugin_settings(plugin_id: str):
    """读取插件的 settings.json"""
    plugin_info = plugin_manager._plugins.get(plugin_id)
    if not plugin_info:
        raise HTTPException(status_code=404, detail="插件不存在")

    settings_path = os.path.join(plugin_info["_plugin_dir"], "settings.json")
    if not os.path.isfile(settings_path):
        return {"settings": {}}

    data = await safe_json_read(settings_path, {})
    return {"settings": data}


class SettingsSaveRequest(BaseModel):
    settings: dict


@router.post("/settings/{plugin_id}")
async def save_plugin_settings(plugin_id: str, req: SettingsSaveRequest):
    """保存插件的 settings.json"""
    plugin_info = plugin_manager._plugins.get(plugin_id)
    if not plugin_info:
        raise HTTPException(status_code=404, detail="插件不存在")

    settings_path = os.path.join(plugin_info["_plugin_dir"], "settings.json")
    await atomic_json_write(settings_path, req.settings)
    return {"success": True}


@router.get("/status/{plugin_id}")
async def get_plugin_status(plugin_id: str):
    """读取插件的动态运行状态 (status.json)"""
    plugin_info = plugin_manager._plugins.get(plugin_id)
    if not plugin_info:
        return {"status": {}}

    status_path = os.path.join(plugin_info["_plugin_dir"], "status.json")
    if not os.path.isfile(status_path):
        return {"status": {}}

    data = await safe_json_read(status_path, {})
    return {"status": data}


@router.get("/open_folder")
async def open_plugins_folder():
    """在系统文件管理器中打开插件目录"""
    os.makedirs(PLUGIN_DIR, exist_ok=True)
    try:
        if platform.system() == "Windows":
            subprocess.Popen(["explorer", os.path.normpath(PLUGIN_DIR)])
        elif platform.system() == "Darwin":
            subprocess.Popen(["open", PLUGIN_DIR])
        else:
            subprocess.Popen(["xdg-open", PLUGIN_DIR])
        return {"status": "ok"}
    except Exception:
        return {"status": "error"}
