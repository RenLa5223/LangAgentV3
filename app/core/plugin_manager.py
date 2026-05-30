# -*- coding: utf-8 -*-
"""
插件总线架构 —— 单例 PluginManager
提供三种 Hook 分发机制：modifier（透传修改）、override（责任链劫持）、event（异步广播）
"""
import os
import json
import importlib.util
import asyncio
from typing import Any, Callable

from app.core.config import PLUGIN_DIR
from app.utils.logging import logger


class PluginManager:
    """单例插件管理器，无侵入式挂载外部扩展"""

    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._initialized = False
        return cls._instance

    def __init__(self):
        if self._initialized:
            return
        self._initialized = True
        self._plugins: dict[str, dict] = {}          # plugin_id -> manifest
        self._hook_subscribers: dict[str, list[dict]] = {}  # hook_name -> [plugin_info]

    # ========================================================================
    # 加载机制
    # ========================================================================
    def load_plugins(self):
        """扫描 PLUGIN_DIR，读取 manifest.json，动态导入启用的插件"""
        if not os.path.isdir(PLUGIN_DIR):
            os.makedirs(PLUGIN_DIR, exist_ok=True)
            logger.info("[PluginManager] 插件目录已创建，无可用插件")
            return

        for entry in sorted(os.listdir(PLUGIN_DIR)):
            plugin_dir = os.path.join(PLUGIN_DIR, entry)
            if not os.path.isdir(plugin_dir):
                continue

            manifest_path = os.path.join(plugin_dir, "manifest.json")
            if not os.path.isfile(manifest_path):
                logger.warning(f"[PluginManager] {entry} 缺少 manifest.json，跳过")
                continue

            try:
                with open(manifest_path, "r", encoding="utf-8") as f:
                    manifest = json.load(f)
            except json.JSONDecodeError as e:
                logger.warning(f"[PluginManager] {entry}/manifest.json 解析失败: {e}")
                continue

            # 校验必填字段
            name = manifest.get("name", "")
            version = manifest.get("version", "")
            enabled = manifest.get("enabled", False)
            hooks = manifest.get("hooks", [])

            if not name or not version:
                logger.warning(f"[PluginManager] {entry} manifest 缺少 name/version，跳过")
                continue

            plugin_id = manifest.get("id", entry)
            manifest["_plugin_dir"] = plugin_dir
            manifest["_plugin_id"] = plugin_id
            self._plugins[plugin_id] = manifest

            if not enabled:
                logger.info(f"[PluginManager] 插件 [{name}] 已禁用，跳过加载")
                continue

            # 动态导入 main.py
            main_py = os.path.join(plugin_dir, "main.py")
            if not os.path.isfile(main_py):
                logger.warning(f"[PluginManager] {entry} 缺少 main.py，跳过")
                manifest["loaded"] = False
                continue

            manifest["loaded"] = False

            # 第一步：隔离导入模块
            mod = None
            try:
                spec = importlib.util.spec_from_file_location(
                    f"plugin_{plugin_id}", main_py
                )
                mod = importlib.util.module_from_spec(spec)
                spec.loader.exec_module(mod)
            except Exception as e:
                logger.error(f"[Plugin Error] 插件 [{name}] 模块导入失败: {e}")
                continue

            # 第二步：依赖注入上下文，调用 register
            if hasattr(mod, "register"):
                context = {
                    "logger": logger,
                    "plugin_dir": plugin_dir,
                    "dispatch_event": self.dispatch_event,
                }
                try:
                    mod.register(context)
                except Exception as e:
                    logger.error(f"[Plugin Error] 插件 [{name}] register() 执行失败: {e}")
                    continue

            manifest["_module"] = mod
            manifest["loaded"] = True

            # 注册 hook 订阅
            for hook_name in hooks:
                self._hook_subscribers.setdefault(hook_name, []).append(manifest)

            logger.info(f"[PluginManager] 插件 [{name}] v{version} 已加载，订阅 hooks: {hooks}")

    def reload_plugins(self):
        """清空内存状态并重新扫描磁盘（热插拔硬刷新）"""
        self._plugins.clear()
        self._hook_subscribers.clear()
        self.load_plugins()
        logger.info("[PluginManager] 插件列表已从磁盘重新扫描")

    # ========================================================================
    # Hook 分发机制
    # ========================================================================
    async def dispatch_modifier(self, hook_name: str, payload: Any) -> Any:
        """透传修改模式：依次调用订阅者，每个插件修改 payload 并返回"""
        subscribers = self._hook_subscribers.get(hook_name, [])
        for p_info in subscribers:
            mod = p_info.get("_module")
            if mod is None:
                continue
            handler = getattr(mod, f"on_{hook_name.lower()}", None)
            if handler is None:
                continue
            try:
                if asyncio.iscoroutinefunction(handler):
                    payload = await handler(payload)
                else:
                    payload = handler(payload)
            except Exception as e:
                logger.error(f"[PluginManager] {p_info.get('name')} modifier hook {hook_name} 异常: {e}")
        return payload

    async def dispatch_override(self, hook_name: str, **kwargs) -> Any:
        """能力劫持模式：责任链，首个返回非 None 的插件结果立刻短路"""
        subscribers = self._hook_subscribers.get(hook_name, [])
        for p_info in subscribers:
            mod = p_info.get("_module")
            if mod is None:
                continue
            handler = getattr(mod, f"on_{hook_name.lower()}", None)
            if handler is None:
                continue
            try:
                if asyncio.iscoroutinefunction(handler):
                    result = await handler(**kwargs)
                else:
                    result = handler(**kwargs)
                if result is not None:
                    logger.info(f"[PluginManager] {p_info.get('name')} 劫持 {hook_name}")
                    return result
            except Exception as e:
                logger.error(f"[PluginManager] {p_info.get('name')} override hook {hook_name} 异常: {e}")
        return None

    async def dispatch_event(self, hook_name: str, payload: Any = None):
        """异步广播模式：不阻塞主流程，通知所有订阅者"""
        subscribers = self._hook_subscribers.get(hook_name, [])
        for p_info in subscribers:
            mod = p_info.get("_module")
            if mod is None:
                continue
            handler = getattr(mod, f"on_{hook_name.lower()}", None)
            if handler is None:
                continue

            async def _fire(h, pl_name):
                try:
                    if asyncio.iscoroutinefunction(h):
                        await h(payload)
                    else:
                        h(payload)
                except Exception as e:
                    logger.error(f"[PluginManager] {pl_name} event hook {hook_name} 异常: {e}")

            asyncio.create_task(_fire(handler, p_info.get("name", "unknown")))

    # ========================================================================
    # Tool Call 工具注册与调度
    # ========================================================================
    def get_tool_schemas(self) -> list:
        """收集所有已加载且已启用插件的 tool_schema，包装为 OpenAI Function Calling 格式"""
        schemas = []
        for pid, p_info in self._plugins.items():
            if not p_info.get("loaded") or not p_info.get("enabled"):
                continue
            tool_schema = p_info.get("tool_schema")
            if not tool_schema or not isinstance(tool_schema, dict):
                continue
            schemas.append({"type": "function", "function": tool_schema})
        return schemas

    async def dispatch_tool_call(self, tool_name: str, arguments: dict) -> str:
        """根据工具名找到对应插件并执行 execute_tool，返回结果字符串"""
        for pid, p_info in self._plugins.items():
            if not p_info.get("loaded") or not p_info.get("enabled"):
                continue
            schema = p_info.get("tool_schema")
            if not schema or schema.get("name") != tool_name:
                continue
            mod = p_info.get("_module")
            if mod is None:
                continue
            handler = getattr(mod, "execute_tool", None)
            if handler is None:
                continue
            try:
                if asyncio.iscoroutinefunction(handler):
                    result = await handler(arguments)
                else:
                    result = handler(arguments)
                return str(result) if result is not None else ""
            except Exception as e:
                logger.error(f"[PluginManager] 工具 {tool_name} 执行失败: {e}")
                return f"工具 {tool_name} 执行失败: {e}"
        return f"未找到已启用的工具: {tool_name}"

    # ========================================================================
    # 管理接口
    # ========================================================================
    def list_plugins(self) -> list[dict]:
        """返回所有插件的清单（供 API 使用）"""
        result = []
        for pid, p_info in self._plugins.items():
            result.append({
                "id": pid,
                "name": p_info.get("name", ""),
                "version": p_info.get("version", ""),
                "description": p_info.get("description", ""),
                "icon": p_info.get("icon", ""),
                "enabled": p_info.get("enabled", False),
                "hooks": p_info.get("hooks", []),
                "blocked": p_info.get("blocked", False),
                "ui_schema": p_info.get("ui_schema", []),
                "tool_schema": p_info.get("tool_schema") is not None,
                "loaded": p_info.get("loaded", False),
            })
        return result

    def toggle_plugin(self, plugin_id: str, enabled: bool = None, blocked: bool = None) -> bool:
        """修改插件的启用/屏蔽状态（写入 manifest.json）"""
        p_info = self._plugins.get(plugin_id)
        if not p_info:
            return False

        manifest_path = os.path.join(p_info["_plugin_dir"], "manifest.json")
        try:
            with open(manifest_path, "r", encoding="utf-8") as f:
                manifest = json.load(f)

            if enabled is not None:
                manifest["enabled"] = enabled
                p_info["enabled"] = enabled
            if blocked is not None:
                manifest["blocked"] = blocked
                p_info["blocked"] = blocked

            with open(manifest_path, "w", encoding="utf-8") as f:
                json.dump(manifest, f, ensure_ascii=False, indent=2)

            return True
        except Exception as e:
            logger.error(f"[PluginManager] 切换插件状态失败: {e}")
            return False


# 全局单例
plugin_manager = PluginManager()
