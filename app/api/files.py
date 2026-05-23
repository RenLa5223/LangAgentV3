# -*- coding: utf-8 -*-
"""文件/媒体 API 端点"""
import os
import base64
import mimetypes
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from app.core.config import (
    AGENT_AVATAR_DIR, USER_AVATAR_DIR, TEMP_IMG_DIR
)
from app.core.constants import MAX_AVATAR_SIZE, AVATAR_FILE
from app.utils.fs_lock import lock_registry

router = APIRouter(prefix="/api", tags=["files"])


# ============================================================================
# 头像
# ============================================================================
@router.get("/avatar/{role}")
async def get_avatar(role: str):
    """获取 Agent 或用户头像"""
    if role not in ("agent", "user"):
        raise HTTPException(status_code=400, detail="无效的角色")

    target_dir = AGENT_AVATAR_DIR if role == "agent" else USER_AVATAR_DIR
    avatar_path = None
    for filename in os.listdir(target_dir):
        if filename.lower().endswith(('.png', '.jpg', '.jpeg', '.gif', '.webp')):
            avatar_path = os.path.join(target_dir, filename)
            break

    if avatar_path and os.path.exists(avatar_path):
        mime_type, _ = mimetypes.guess_type(avatar_path)
        return FileResponse(avatar_path, media_type=mime_type or 'image/png')

    raise HTTPException(status_code=404, detail="头像未设置")


@router.post("/upload_avatar")
async def upload_avatar(req: dict):
    """上传头像"""
    role = req.get('role')
    img_b64 = req.get('image')

    if role not in ['agent', 'user'] or not img_b64:
        raise HTTPException(status_code=400, detail="参数无效")

    if len(img_b64) > MAX_AVATAR_SIZE:
        raise HTTPException(status_code=413, detail="图片过大")

    if ',' in img_b64:
        img_b64 = img_b64.split(',')[1]
    img_data = base64.b64decode(img_b64)

    target_dir = AGENT_AVATAR_DIR if role == "agent" else USER_AVATAR_DIR

    import asyncio

    lock = await lock_registry.get_lock(target_dir)
    async with lock:
        for filename in os.listdir(target_dir):
            file_path = os.path.join(target_dir, filename)
            if os.path.isfile(file_path):
                os.remove(file_path)

        def _write():
            with open(os.path.join(target_dir, AVATAR_FILE), "wb") as f:
                f.write(img_data)

        await asyncio.to_thread(_write)

    return {"status": "success"}



@router.get("/temp_image/{filename}")
async def temp_image(filename: str):
    """获取临时图片"""
    safe_name = os.path.basename(filename)
    file_path = os.path.join(TEMP_IMG_DIR, safe_name)
    if os.path.exists(file_path):
        ext = safe_name.rsplit('.', 1)[-1].lower()
        mime = 'image/png' if ext == 'png' else 'image/jpeg'
        return FileResponse(file_path, media_type=mime)
    raise HTTPException(status_code=404, detail="图片不存在")
