# -*- coding: utf-8 -*-
"""文件/媒体 API 端点"""
import os
import base64
import mimetypes
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import FileResponse, StreamingResponse

from app.core.config import (
    AGENT_AVATAR_DIR, USER_AVATAR_DIR, TEMP_IMG_DIR, MUSIC_DIR
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


# ============================================================================
# 【音乐播放器】
# ============================================================================
@router.get("/music/stream/{filename}")
async def stream_music(filename: str, request: Request):
    """支持 206 Partial Content 的音频流代理端点"""
    safe_name = os.path.basename(filename)
    file_path = os.path.join(MUSIC_DIR, safe_name)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="音频文件不存在")

    file_size = os.path.getsize(file_path)
    range_header = request.headers.get("Range")

    if range_header:
        byte_range = range_header.replace("bytes=", "").split("-")
        start = int(byte_range[0])
        end = int(byte_range[1]) if byte_range[1] else file_size - 1

        chunk_size = end - start + 1

        def iterfile():
            with open(file_path, "rb") as f:
                f.seek(start)
                yield f.read(chunk_size)

        headers = {
            "Content-Range": f"bytes {start}-{end}/{file_size}",
            "Accept-Ranges": "bytes",
            "Content-Length": str(chunk_size),
        }
        mime_type, _ = mimetypes.guess_type(file_path)
        return StreamingResponse(
            iterfile(), status_code=206, headers=headers,
            media_type=mime_type or "audio/mpeg"
        )
    else:
        return FileResponse(file_path)


@router.get("/music/list")
async def list_music():
    """列出音乐库中所有音频文件"""
    if not os.path.exists(MUSIC_DIR):
        return {"files": []}
    files = []
    for f in os.listdir(MUSIC_DIR):
        if f.lower().endswith(('.mp3', '.wav', '.flac', '.ogg', '.aac', '.m4a', '.wma')):
            file_path = os.path.join(MUSIC_DIR, f)
            files.append({
                "name": f,
                "size": os.path.getsize(file_path),
                "url": f"/api/music/stream/{f}"
            })
    files.sort(key=lambda x: x["name"])
    return {"files": files}


@router.post("/music/upload")
async def upload_music(req: dict):
    """上传音乐文件（base64 编码）"""
    filename = req.get("filename", "")
    data_b64 = req.get("data", "")

    if not filename or not data_b64:
        raise HTTPException(status_code=400, detail="缺少文件名或数据")

    safe_name = os.path.basename(filename)
    if not safe_name.lower().endswith(('.mp3', '.wav', '.flac', '.ogg', '.aac', '.m4a', '.wma')):
        raise HTTPException(status_code=400, detail="不支持的音频格式")

    if ',' in data_b64:
        data_b64 = data_b64.split(',')[1]
    try:
        file_data = base64.b64decode(data_b64)
    except Exception:
        raise HTTPException(status_code=400, detail="Base64 解码失败")

    dest_path = os.path.join(MUSIC_DIR, safe_name)
    with open(dest_path, "wb") as f:
        f.write(file_data)

    return {"status": "success", "filename": safe_name}


@router.delete("/music/{filename}")
async def delete_music(filename: str):
    """删除指定音乐文件"""
    safe_name = os.path.basename(filename)
    file_path = os.path.join(MUSIC_DIR, safe_name)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="文件不存在")
    os.remove(file_path)
    return {"status": "success"}
