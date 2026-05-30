# -*- coding: utf-8 -*-
"""API 路由聚合器"""
from fastapi import APIRouter
from app.api.chat import router as chat_router
from app.api.config_endpoints import router as config_router
from app.api.system import router as system_router
from app.api.files import router as files_router
from app.api.memory_endpoints import router as memory_router
from app.api.webhook import router as webhook_router
from app.api.plugins import router as plugins_router

api_router = APIRouter()

api_router.include_router(chat_router)
api_router.include_router(config_router)
api_router.include_router(system_router)
api_router.include_router(files_router)
api_router.include_router(memory_router)
api_router.include_router(webhook_router)
api_router.include_router(plugins_router)
