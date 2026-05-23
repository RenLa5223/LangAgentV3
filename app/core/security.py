# -*- coding: utf-8 -*-
"""安全校验层 —— 运行时动态 Session Token 替代硬编码明文"""
import os
import uuid
import hashlib
import hmac
import time
import secrets
from app.core.config import CONFIG_DIR
from app.utils.fs_lock import safe_json_read, atomic_json_write
from app.utils.logging import logger

# 内存态会话令牌（每次启动时重新生成）
SESSION_TOKEN: str = ""
# 持久态服务器密钥（用于跨重启验证等场景）
_server_secret: str = ""


def _get_machine_seed() -> str:
    try:
        import platform as _p
        node = uuid.getnode()
        return f"{_p.node()}-{node}"
    except Exception:
        return "LangAgentV3-Default-Seed"


def _derive_secret() -> bytes:
    seed = _get_machine_seed().encode('utf-8')
    return hashlib.sha256(seed).digest()


async def get_or_create_server_secret() -> str:
    global _server_secret
    if _server_secret:
        return _server_secret
    secret_file = os.path.join(CONFIG_DIR, ".server_secret")
    existing = await safe_json_read(secret_file, None)
    if existing and existing.get("secret"):
        _server_secret = existing["secret"]
        return _server_secret
    new_secret = secrets.token_hex(32)
    await atomic_json_write(secret_file, {"secret": new_secret, "created": time.strftime("%Y-%m-%d %H:%M:%S")})
    _server_secret = new_secret
    return _server_secret


def generate_session_token() -> str:
    """启动时生成随机 Session Token（纯内存，不落地磁盘）"""
    return secrets.token_urlsafe(32)


def verify_session_token(token: str) -> bool:
    """常量时间比较，防时序攻击"""
    if not SESSION_TOKEN or not token:
        return False
    return hmac.compare_digest(token, SESSION_TOKEN)


def generate_reset_token(server_secret: str) -> str:
    """基于时间的 HMAC 重置令牌（有效期 5 分钟）"""
    window = int(time.time() // 300)
    msg = f"reset-{window}".encode('utf-8')
    key = server_secret.encode('utf-8')
    sig = hmac.new(key, msg, hashlib.sha256).hexdigest()[:16]
    return sig


def verify_reset_token(token: str, server_secret: str) -> bool:
    if not token:
        return False
    expected = generate_reset_token(server_secret)
    prev_window = int(time.time() // 300) - 1
    key = server_secret.encode('utf-8')
    prev_msg = f"reset-{prev_window}".encode('utf-8')
    prev_sig = hmac.new(key, prev_msg, hashlib.sha256).hexdigest()[:16]
    return hmac.compare_digest(token, expected) or hmac.compare_digest(token, prev_sig)


def init_session_token():
    """在 FastAPI 启动时调用一次，生成会话令牌"""
    global SESSION_TOKEN
    SESSION_TOKEN = generate_session_token()
    logger.info(f"[SECURITY] Session Token 已生成 (signature: {SESSION_TOKEN[:8]}...)")
