# -*- coding: utf-8 -*-
"""FastAPI 应用工厂"""
import sys
import os
import uuid
import time
import asyncio

# 确保项目路径在 Python 搜索路径中（兼容 PyInstaller 冻结模式）
if getattr(sys, 'frozen', False):
    _project_root = sys._MEIPASS
else:
    _project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _project_root not in sys.path:
    sys.path.insert(0, _project_root)

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from contextlib import asynccontextmanager

from app.core.config import settings, _DATA_DIR, MEM_DIR, CONFIG_DIR
from app.core.constants import CHAT_HISTORY_FILE, MEMORY_SUMMARY_FILE
from app.utils.logging import init_logger, logger, trace_id_ctx
from app.api.router import api_router
from app.utils.fs_lock import atomic_json_write

# 后台任务句柄（用于 shutdown 时取消）
_background_tasks: list = []


@asynccontextmanager
async def lifespan(app: FastAPI):
    """生命周期管理"""
    global _background_tasks

    # ====== Startup ======
    init_logger(_DATA_DIR)
    logger.info("=" * 60)
    logger.info("[START] LangAgentV3 Headless 后端总线初始化")
    logger.info(f"[DATA] 数据目录: {_DATA_DIR}")
    logger.info("=" * 60)

    # 1. 生成动态 Session Token
    from app.core.security import init_session_token, SESSION_TOKEN
    init_session_token()
    app.state.session_token = SESSION_TOKEN

    # 2. 初始化必要数据文件
    if not os.path.exists(os.path.join(MEM_DIR, CHAT_HISTORY_FILE)):
        await atomic_json_write(os.path.join(MEM_DIR, CHAT_HISTORY_FILE), [])
    if not os.path.exists(os.path.join(MEM_DIR, MEMORY_SUMMARY_FILE)):
        await atomic_json_write(os.path.join(MEM_DIR, MEMORY_SUMMARY_FILE), {"items": []})

    # 3. 启动记忆引擎后台守护 (memory_engine 内部 asyncio.create_task)
    from app.core.memory_engine import start_background_tasks
    start_background_tasks()

    # 4. 启动 RAG 索引队列消费者
    from app.services.rag_service import start_rag_worker
    rag_task = asyncio.create_task(start_rag_worker())
    _background_tasks.append(rag_task)

    # 5. 初始化插件管理器
    from app.core.plugin_manager import plugin_manager
    plugin_manager.load_plugins()

    yield

    # ====== Shutdown ======
    logger.info("[SHUTDOWN] 正在终止后台任务...")

    # 取消 RAG 队列消费者
    for t in _background_tasks:
        if not t.done():
            t.cancel()
    # 等待取消完成
    for t in _background_tasks:
        try:
            await t
        except asyncio.CancelledError:
            pass
    _background_tasks.clear()

    # 停止记忆引擎
    from app.core.memory_engine import stop_background_tasks
    await stop_background_tasks()

    logger.info("[SHUTDOWN] 后端总线安全下线")


app = FastAPI(
    title="LangAgentV3-Core",
    version=settings.APP_VERSION,
    lifespan=lifespan
)

# CORS 全源跨域适配
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# 全局中间件：全链路追踪 ID 注入与耗时审计
@app.middleware("http")
async def trace_delivery_middleware(request: Request, call_next):
    req_id = f"req_{uuid.uuid4().hex[:8]}"
    trace_id_ctx.set(req_id)

    start_time = time.time()
    logger.info(f"[HTTP IN] {request.method} {request.url.path}")

    response = await call_next(request)

    process_time = (time.time() - start_time) * 1000
    logger.info(
        f"[HTTP OUT] {request.method} {request.url.path} "
        f"- 状态码: {response.status_code} - 耗时: {process_time:.2f}ms"
    )

    response.headers["X-Trace-ID"] = req_id
    return response


# 挂载聚合路由器
app.include_router(api_router)

# 挂载静态资源目录
_static_dir = os.path.join(_project_root, "static")
if os.path.exists(_static_dir):
    app.mount("/static", StaticFiles(directory=_static_dir), name="static")


# 根路由返回 index.html（注入动态 Session Token）
@app.get("/")
async def root():
    from fastapi.responses import HTMLResponse
    index_path = os.path.join(_project_root, "templates", "index.html")
    if os.path.exists(index_path):
        with open(index_path, "r", encoding="utf-8") as f:
            html = f.read()
        # 在 </head> 前注入 Session Token
        token = getattr(app.state, "session_token", "")
        if token:
            meta_tag = f'<meta name="api-token" content="{token}">'
            html = html.replace("</head>", f"  {meta_tag}\n</head>")
        return HTMLResponse(content=html)
    return HTMLResponse(content="<h1>LangAgentV3 API Server Running</h1>")
