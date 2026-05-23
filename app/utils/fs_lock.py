# -*- coding: utf-8 -*-
"""协程安全型原子文件系统锁 —— 替代原 threading.RLock 方案"""
import json
import os
import asyncio
from typing import Any, Dict
from app.utils.logging import logger


class AsyncFileLockRegistry:
    """文件级 asyncio 锁注册表，确保同一时间只有一个协程操作特定文件"""

    def __init__(self):
        self._locks: Dict[str, asyncio.Lock] = {}
        self._global_lock = asyncio.Lock()

    async def get_lock(self, filepath: str) -> asyncio.Lock:
        abs_path = os.path.abspath(filepath)
        async with self._global_lock:
            if abs_path not in self._locks:
                self._locks[abs_path] = asyncio.Lock()
            return self._locks[abs_path]


lock_registry = AsyncFileLockRegistry()


def _sync_safe_read(filepath: str, default_val: Any) -> Any:
    """内部物理读取逻辑（在独立线程池中执行）"""
    if not os.path.exists(filepath):
        return default_val
    content = ""
    try:
        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                content = f.read()
        except UnicodeDecodeError:
            with open(filepath, 'r', encoding='gbk') as f:
                content = f.read()
    except Exception as e:
        logger.error(f"文件读取失败: {filepath} — {e}")
        return default_val

    if not content.strip():
        return default_val

    try:
        return json.loads(content)
    except json.JSONDecodeError:
        import time
        corrupted_path = f"{filepath}.corrupted_{int(time.time())}"
        os.rename(filepath, corrupted_path)
        logger.warning(f"检测到损坏数据，已隔离: {filepath}")
        return default_val


def _sync_atomic_write(filepath: str, data: Any):
    """内部原子写入逻辑（在独立线程池中执行）"""
    tmp_path = filepath + ".tmp"
    with open(tmp_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    if os.path.exists(tmp_path):
        os.replace(tmp_path, filepath)


def _sync_text_read(filepath: str) -> str:
    """同步文本文件读取"""
    if not os.path.exists(filepath):
        return ""
    with open(filepath, 'r', encoding='utf-8') as f:
        return f.read()


def _sync_text_write(filepath: str, content: str):
    """同步文本文件写入"""
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)


def _sync_text_append(filepath: str, content: str):
    """同步文本文件追加"""
    with open(filepath, 'a', encoding='utf-8') as f:
        f.write(content)


def _sync_binary_read(filepath: str) -> bytes:
    """同步二进制文件读取"""
    with open(filepath, 'rb') as f:
        return f.read()


def _sync_binary_write(filepath: str, data: bytes):
    """同步二进制文件写入"""
    with open(filepath, 'wb') as f:
        f.write(data)


# ============================================================================
# 公开异步接口
# ============================================================================

async def safe_json_read(filepath: str, default_val: Any) -> Any:
    """高并发非阻塞 JSON 安全读取"""
    file_lock = await lock_registry.get_lock(filepath)
    async with file_lock:
        return await asyncio.to_thread(_sync_safe_read, filepath, default_val)


async def atomic_json_write(filepath: str, data: Any):
    """高并发非阻塞原子级 JSON 写入"""
    file_lock = await lock_registry.get_lock(filepath)
    async with file_lock:
        await asyncio.to_thread(_sync_atomic_write, filepath, data)


async def safe_text_read(filepath: str) -> str:
    """高并发非阻塞文本文件读取"""
    file_lock = await lock_registry.get_lock(filepath)
    async with file_lock:
        return await asyncio.to_thread(_sync_text_read, filepath)


async def safe_text_write(filepath: str, content: str):
    """高并发非阻塞文本文件写入"""
    file_lock = await lock_registry.get_lock(filepath)
    async with file_lock:
        await asyncio.to_thread(_sync_text_write, filepath, content)


async def safe_text_append(filepath: str, content: str):
    """高并发非阻塞文本文件追加"""
    file_lock = await lock_registry.get_lock(filepath)
    async with file_lock:
        await asyncio.to_thread(_sync_text_append, filepath, content)


async def safe_binary_read(filepath: str) -> bytes:
    """高并发非阻塞二进制文件读取"""
    return await asyncio.to_thread(_sync_binary_read, filepath)


async def safe_binary_write(filepath: str, data: bytes):
    """高并发非阻塞二进制文件写入"""
    file_lock = await lock_registry.get_lock(filepath)
    async with file_lock:
        await asyncio.to_thread(_sync_binary_write, filepath, data)
