# -*- coding: utf-8 -*-
"""API 路由聚合器"""
from fastapi import APIRouter
from app.api.chat import router as chat_router
from app.api.config_endpoints import router as config_router
from app.api.system import router as system_router
from app.api.files import router as files_router

api_router = APIRouter()

api_router.include_router(chat_router)
api_router.include_router(config_router)
api_router.include_router(system_router)
api_router.include_router(files_router)
