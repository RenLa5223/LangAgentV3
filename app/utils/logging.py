# -*- coding: utf-8 -*-
"""Loguru 日志系统，支持异步追踪与自动轮转"""
import sys
import os
from contextvars import ContextVar
from loguru import logger

trace_id_ctx: ContextVar[str] = ContextVar("trace_id", default="SYS_BOOT")
_log_dir: str = ""


def init_logger(data_dir: str):
    """初始化日志系统：物理轮转，异步安全"""
    global _log_dir
    log_dir = os.path.join(data_dir, "logs")
    _log_dir = log_dir
    os.makedirs(log_dir, exist_ok=True)

    # Windows 终端 GBK 编码兼容：强制 stdout 使用 UTF-8
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass

    logger.remove()

    # 不含 emoji 的 ASCII 安全格式（Windows 兼容）
    log_format = (
        "<green>{time:YYYY-MM-DD HH:mm:ss.SSS}</green> | "
        "<level>{level: <8}</level> | "
        "<cyan>[{extra[trace_id]}]</cyan> <cyan>{name}</cyan>:<cyan>{function}</cyan>:<cyan>{line}</cyan> - "
        "<level>{message}</level>"
    )

    # 终端输出使用 ASCII-safe 编码
    logger.add(
        sys.stdout,
        format=log_format,
        level="INFO",
        enqueue=True,
        colorize=True
    )

    log_file_path = os.path.join(log_dir, "agent_{time:YYYY-MM-DD}.log")
    logger.add(
        log_file_path,
        format=log_format,
        level="DEBUG",
        rotation="00:00",
        retention="30 days",
        compression="zip",
        encoding="utf-8",
        enqueue=True
    )


# 注入动态 trace_id 上下文
logger.configure(
    patcher=lambda record: record["extra"].update(trace_id=trace_id_ctx.get())
)


def get_log_stream() -> str:
    """返回最近日志内存快照（供前端实时日志流轮询使用）"""
    import datetime
    today = datetime.date.today().strftime("%Y-%m-%d")
    log_file = os.path.join(_log_dir, f"agent_{today}.log") if _log_dir else ""
    try:
        with open(log_file, "r", encoding="utf-8") as f:
            content = f.read()
        return content[-20000:] if len(content) > 20000 else content
    except Exception:
        return ""
