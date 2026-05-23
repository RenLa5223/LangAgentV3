# -*- coding: utf-8 -*-
"""RAG 索引异步队列服务 —— 单线程消费者消灭竞态条件"""
import asyncio
from app.utils.logging import logger

# 全局队列：任何需要重建 RAG 索引的操作只需往里放入信号
_rag_task_queue: asyncio.Queue = asyncio.Queue(maxsize=10)
_rag_worker_ready = False


def signal_rebuild_index():
    """
    非阻塞信号：通知后台消费者重建索引。
    由 API 端点或业务服务在修改 archive_db.json 后调用。
    如果队列已满（表明已有待处理的重建任务），则跳过。
    """
    try:
        _rag_task_queue.put_nowait("REBUILD")
    except asyncio.QueueFull:
        # 已有待处理的重建信号在排队，无需重复积压
        pass


async def start_rag_worker():
    """
    启动 RAG 索引后台消费者。
    在独家协程中串行执行所有重建请求，彻底消灭并发踩踏。
    由 app/main.py 的 lifespan startup 调用。
    """
    global _rag_worker_ready
    _rag_worker_ready = True
    logger.info("[RAG Worker] 索引队列消费者已就绪")

    while True:
        try:
            signal = await _rag_task_queue.get()
            logger.info(f"[RAG Worker] 收到索引重建信号...")

            # 在独立的线程池中执行 CPU 密集的词法分析 + 倒排索引构建
            from app.core.rag_engine import _sync_rebuild_index
            await asyncio.to_thread(_sync_rebuild_index)

            _rag_task_queue.task_done()
            logger.info("[RAG Worker] 索引重建完成")

        except asyncio.CancelledError:
            logger.info("[RAG Worker] 收到取消信号，正在退出...")
            break
        except Exception as e:
            logger.error(f"[RAG Worker] 索引重建异常: {e}")
            _rag_task_queue.task_done()


async def shutdown_rag_worker():
    """关闭 RAG 消费者"""
    global _rag_worker_ready
    _rag_worker_ready = False
    # 等待队列中剩余的任务完成
    try:
        await asyncio.wait_for(_rag_task_queue.join(), timeout=10.0)
    except asyncio.TimeoutError:
        logger.warning("[RAG Worker] 超时等待队列清空，强制退出")
