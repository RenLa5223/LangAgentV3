# -*- coding: utf-8 -*-
"""全局配置模块 —— Pydantic Settings + 路径常量 + 状态机 + 核心算法"""
import sys
import os
import re
import time
import json
import asyncio
from pydantic_settings import BaseSettings
from pydantic import Field


def _resolve_version() -> str:
    """
    从 tauri.conf.json 读取版本号（单一事实来源）。
    打包后找不到该文件时回退到 "1.0.2"。
    """
    # 寻找项目根目录（从 app/core/config.py → app/core → app → project root）
    candidates = []
    try:
        if getattr(sys, 'frozen', False):
            candidates.append(os.path.join(os.path.dirname(sys.executable), "src-tauri", "tauri.conf.json"))
        else:
            root = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
            candidates.append(os.path.join(root, "src-tauri", "tauri.conf.json"))
    except Exception:
        pass

    for path in candidates:
        try:
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
            version = data.get("package", {}).get("version", "1.0.2")
            return version
        except Exception:
            continue
    return "1.0.2"


# ============================================================================
# Pydantic Settings
# ============================================================================
class Settings(BaseSettings):
    HOST: str = "127.0.0.1"
    PORT: int = 5622
    APP_VERSION: str = _resolve_version()

    @property
    def DATA_DIR(self) -> str:
        if getattr(sys, 'frozen', False):
            appdata = os.getenv("APPDATA")
            if appdata:
                return os.path.join(appdata, "LangAgentV3", "Data")
            return os.path.join(os.path.dirname(sys.executable), "Data")
        return os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "..", "Data")

    model_config = dict(env_prefix="LANGAGENT_", extra="allow")


settings = Settings()

# ============================================================================
# 路径常量（兼容 PyInstaller 冻结模式）
# ============================================================================
if getattr(sys, 'frozen', False):
    _appdata = os.getenv("APPDATA")
    if _appdata:
        _DATA_DIR = os.path.join(_appdata, "LangAgentV3", "Data")
    else:
        _DATA_DIR = os.path.join(os.path.dirname(sys.executable), "Data")
else:
    _DATA_DIR = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "Data"))
DATA_DIR = _DATA_DIR  # 公开别名，供外部模块导入

MEM_DIR = os.path.join(_DATA_DIR, "memory_core")
CONFIG_DIR = os.path.join(_DATA_DIR, "config")
AGENT_AVATAR_DIR = os.path.join(_DATA_DIR, "avatars", "agent")
USER_AVATAR_DIR = os.path.join(_DATA_DIR, "avatars", "user")
AGENT_PROFILE_DIR = os.path.join(_DATA_DIR, "agent_profile")
USER_PROFILE_DIR = os.path.join(_DATA_DIR, "user_profile")
USER_PORTRAIT_DIR = os.path.join(_DATA_DIR, "user_portrait")
ARCHIVE_DIR = os.path.join(_DATA_DIR, "memory_archive")
TEMP_IMG_DIR = os.path.join(_DATA_DIR, "temp_images")
MEMORY_RETRY_DIR = os.path.join(_DATA_DIR, "memory_retry")
MUSIC_DIR = os.path.join(_DATA_DIR, "music")

# 确保所有目录存在
for _d in [_DATA_DIR, MEM_DIR, CONFIG_DIR, AGENT_AVATAR_DIR, USER_AVATAR_DIR,
           AGENT_PROFILE_DIR, USER_PROFILE_DIR, USER_PORTRAIT_DIR,
           ARCHIVE_DIR, TEMP_IMG_DIR, MEMORY_RETRY_DIR, MUSIC_DIR]:
    os.makedirs(_d, exist_ok=True)


# ============================================================================
# 高并发安全状态机（替代原 threading.RLock + AppState）
# ============================================================================
class AppState:
    """跨模块共享的可变状态容器 —— 内部使用 asyncio.Lock 保护"""

    def __init__(self):
        self._lock = asyncio.Lock()
        self._last_external_user_id = ""
        self._api_cooldown_until = 0.0
        self._consecutive_failures = 0
        self._last_interaction_time = 0.0
        self._next_proactive_delay = 120.0 * 60
        self._conn_status = "connecting"

    # --- 连接状态 ---
    @property
    async def conn_status(self) -> str:
        async with self._lock:
            return self._conn_status

    async def set_conn_status(self, s: str):
        async with self._lock:
            if self._conn_status != s:
                self._conn_status = s
                from app.utils.logging import logger
                now = time.strftime("%H:%M:%S")
                logger.info(f"[状态] {s}")

    # --- API 冷却 ---
    @property
    async def api_cooldown_until(self) -> float:
        async with self._lock:
            return self._api_cooldown_until

    async def set_api_cooldown(self, until: float):
        async with self._lock:
            self._api_cooldown_until = until

    # --- 失败计数 ---
    async def inc_failures(self) -> int:
        async with self._lock:
            self._consecutive_failures += 1
            return self._consecutive_failures

    async def reset_failures(self):
        async with self._lock:
            self._consecutive_failures = 0

    @property
    async def consecutive_failures(self) -> int:
        async with self._lock:
            return self._consecutive_failures

    # --- 交互时间 ---
    @property
    async def last_interaction_time(self) -> float:
        async with self._lock:
            return self._last_interaction_time

    async def update_interaction_time(self, cfg: dict):
        import random as _random
        async with self._lock:
            self._last_interaction_time = time.time()
            self._next_proactive_delay = _random.uniform(
                int(cfg.get("proactive_min", 120)),
                int(cfg.get("proactive_max", 240))
            ) * 60

    @property
    async def next_proactive_delay(self) -> float:
        async with self._lock:
            return self._next_proactive_delay

    @property
    async def last_external_user_id(self) -> str:
        async with self._lock:
            return self._last_external_user_id

    async def set_last_external_user_id(self, uid: str):
        async with self._lock:
            self._last_external_user_id = uid


state = AppState()


# ============================================================================
# 艾宾浩斯遗忘曲线算法（100% 保留原公式）
# ============================================================================
def get_decay_score(item: dict) -> float:
    """计算记忆条目的衰减分数"""
    from datetime import datetime as _dt
    imp = max(1, min(10, float(item.get('importance', 5))))
    try:
        dt = _dt.strptime(item.get('time', ''), "%Y-%m-%d %H:%M:%S")
        hours_elapsed = (_dt.now() - dt).total_seconds() / 3600.0
    except Exception:
        hours_elapsed = 0
    half_life = 24.0 * (2.0 ** ((imp - 1.0) / 2.0))
    return round(imp * (2.0 ** (-hours_elapsed / half_life)), 2)


# ============================================================================
# 工具函数
# ============================================================================
def _strip_think(text: str) -> str:
    """去除 LLM 输出中的思考标签"""
    if not text:
        return ""
    text = re.sub(r'<(think|thinking|response|reasoning)>.*?</\1>', '', text, flags=re.DOTALL | re.IGNORECASE)
    text = re.sub(r'</(think|thinking|response|reasoning)>', '', text, flags=re.IGNORECASE)
    text = re.sub(r'<(think|thinking|response|reasoning)>.*$', '', text, flags=re.DOTALL | re.IGNORECASE)
    return text.strip()


def get_now() -> str:
    return time.strftime("%Y-%m-%d %H:%M:%S")
