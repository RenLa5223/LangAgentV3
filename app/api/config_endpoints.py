# -*- coding: utf-8 -*-
"""配置/数据读写 API 端点"""
import os
import json
import urllib.parse
from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel

from app.core.config import CONFIG_DIR, DATA_DIR
from app.api.deps import get_config, verify_session_dependency
from app.services.config_service import read_data_file, save_data_file, reset_system
from app.utils.logging import logger

router = APIRouter(prefix="/api", tags=["config"])


class SaveRequest(BaseModel):
    folder: str
    filename: str
    content: str


class GetModelsRequest(BaseModel):
    url: str = ""
    key: str = ""
    model: str = ""
    format: str = "openai"


@router.get("/read/{folder}/{filename}")
async def read_file(folder: str, filename: str):
    """读取 Data 目录下的文件"""
    decoded_folder = urllib.parse.unquote(folder)
    decoded_filename = urllib.parse.unquote(filename)
    safe_name = os.path.basename(decoded_filename)

    try:
        content = await read_data_file(decoded_folder, safe_name)
        return PlainTextResponse(content=content, media_type="text/plain; charset=utf-8")
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="文件不存在")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/save")
async def save_file(req: SaveRequest):
    """写入 Data 目录下的文件"""
    safe_name = os.path.basename(req.filename or 'config.json')
    try:
        await save_data_file(req.folder, safe_name, req.content)
        return {"status": "success"}
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/reset")
async def reset_system_endpoint(req: dict):
    """系统全量重置"""
    from app.core.config import CONFIG_DIR
    logger.warning(f"[RESET] 即将删除配置目录: {CONFIG_DIR}")
    await reset_system()
    logger.warning(f"[RESET] 重置完成, config已删除: {not os.path.exists(os.path.join(CONFIG_DIR, 'config.json'))}")
    return {"status": "reset_success"}


@router.post("/get_models")
async def get_models(req: GetModelsRequest):
    """探测可用模型列表"""
    import urllib.request
    import urllib.error
    import asyncio

    def _sync_probe():
        url = req.url
        key = req.key
        model_names = []
        status = "ok"
        api_format = req.format

        base = url.rstrip('/')
        strip_suffixes = ['/v1/messages', '/anthropic/v1/messages',
                          '/chat/completions', '/models', '/v1/models']
        for suffix in strip_suffixes:
            if base.endswith(suffix):
                base = base[:-len(suffix)]
                break

        endpoints = ['/models', '/v1/models', '/api/tags']
        for ep in endpoints:
            if model_names:
                break
            try:
                models_url = base.rstrip('/') + ep
                http_req = urllib.request.Request(models_url, method='GET')
                if key.strip():
                    if api_format == 'anthropic':
                        http_req.add_header('x-api-key', key)
                    else:
                        http_req.add_header('Authorization', f'Bearer {key}')
                resp = urllib.request.urlopen(http_req, timeout=5)
                data = json.loads(resp.read().decode('utf-8'))
                if 'models' in data:
                    model_names = [m.get('name', m.get('id', '')) for m in data.get('models', [])]
                else:
                    model_names = [m.get('id', m.get('name', '')) for m in data.get('data', [])]
                model_names = [n for n in model_names if n]
            except Exception:
                pass

        if not model_names:
            manual = req.model.strip()
            if manual:
                model_names = [manual]
                status = "fallback"
        if not model_names:
            model_names = ["（未能探测，请手动输入模型名）"]
            status = "fallback"
        return {"models": model_names, "status": status}

    result = await asyncio.to_thread(_sync_probe)
    return result
