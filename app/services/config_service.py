# -*- coding: utf-8 -*-
"""配置读写业务服务层"""
import os
import json
from app.core.config import (
    DATA_DIR, CONFIG_DIR, AGENT_PROFILE_DIR, USER_PROFILE_DIR,
    USER_PORTRAIT_DIR, MEM_DIR, AGENT_AVATAR_DIR, USER_AVATAR_DIR,
    ARCHIVE_DIR, MEMORY_RETRY_DIR, TEMP_IMG_DIR,
)
from app.core.constants import (
    CONFIG_FILE, AGENT_PROFILE_FILE, USER_PROFILE_FILE, USER_PORTRAIT_FILE,
    CHAT_HISTORY_FILE, MEMORY_SUMMARY_FILE, DAILY_SIGNATURE_FILE,
)
from app.utils.fs_lock import safe_json_read, atomic_json_write, safe_text_read, safe_text_write
from app.utils.constants import ALLOWED_FOLDERS as AF
from app.utils.logging import logger


async def read_data_file(folder: str, filename: str) -> str:
    """读取 Data 目录下指定文件内容"""
    if folder not in AF:
        raise PermissionError("拒绝访问：不允许的文件夹")
    if not filename.lower().endswith(('.txt', '.json')):
        raise PermissionError("拒绝访问：仅允许 txt/json 文件")

    file_path = os.path.join(DATA_DIR, folder, filename)
    if not os.path.exists(file_path):
        raise FileNotFoundError("文件不存在")

    if filename.lower().endswith('.json'):
        data = await safe_json_read(file_path, None)
        if data is None:
            return ""
        return json.dumps(data, ensure_ascii=False, indent=2)
    else:
        return await safe_text_read(file_path)


async def save_data_file(folder: str, filename: str, content: str):
    """写入 Data 目录下指定文件"""
    if folder not in AF:
        raise PermissionError("拒绝访问：不允许的文件夹")

    target_path = os.path.join(DATA_DIR, folder, filename)

    if filename == 'config.json' and folder == 'config':
        existing = await safe_json_read(target_path, {})
        try:
            incoming = json.loads(content)
        except Exception:
            incoming = {}
        existing.update(incoming)
        await atomic_json_write(target_path, existing)
    else:
        await safe_text_write(target_path, content)

        # RAG 索引自愈：存档文件被修改后发送队列信号（异步单线程消费）
        if folder == 'memory_archive' and filename == 'archive_db.json':
            try:
                from app.services.rag_service import signal_rebuild_index
                signal_rebuild_index()
            except Exception as e:
                logger.error(f"[RAG] 索引重建信号发送异常: {e}")


async def reset_system():
    """系统全量重置"""
    cfg_path = os.path.join(CONFIG_DIR, CONFIG_FILE)
    if os.path.exists(cfg_path):
        os.remove(cfg_path)

    # 人物档案 / 用户画像
    for p in [
        os.path.join(AGENT_PROFILE_DIR, AGENT_PROFILE_FILE),
        os.path.join(USER_PROFILE_DIR, USER_PROFILE_FILE),
        os.path.join(USER_PORTRAIT_DIR, USER_PORTRAIT_FILE),
    ]:
        if os.path.exists(p):
            os.remove(p)

    # 短期记忆
    await atomic_json_write(os.path.join(MEM_DIR, CHAT_HISTORY_FILE), [])
    await atomic_json_write(os.path.join(MEM_DIR, MEMORY_SUMMARY_FILE), {"items": []})

    # 签名
    sig_file = os.path.join(MEM_DIR, DAILY_SIGNATURE_FILE)
    if os.path.exists(sig_file):
        os.remove(sig_file)

    # RAG 归档
    archive_db = os.path.join(ARCHIVE_DIR, "archive_db.json")
    inverted_idx = os.path.join(ARCHIVE_DIR, "inverted_index.json")
    for f in [archive_db, inverted_idx]:
        if os.path.exists(f):
            os.remove(f)

    # 死信重试队列
    for fname in os.listdir(MEMORY_RETRY_DIR):
        fp = os.path.join(MEMORY_RETRY_DIR, fname)
        if os.path.isfile(fp):
            os.remove(fp)

    # 临时图片
    for fname in os.listdir(TEMP_IMG_DIR):
        fp = os.path.join(TEMP_IMG_DIR, fname)
        if os.path.isfile(fp):
            os.remove(fp)

    # 头像
    for d in [AGENT_AVATAR_DIR, USER_AVATAR_DIR]:
        for filename in os.listdir(d):
            file_path = os.path.join(d, filename)
            if os.path.isfile(file_path):
                os.remove(file_path)

    logger.warning("[WARN] 系统已完全重置")
