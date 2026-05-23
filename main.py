# -*- coding: utf-8 -*-
"""LangAgentV3 入口 —— Uvicorn 服务启动器"""
import sys
import os
import socket
import webbrowser

# Windows 终端 UTF-8 兼容
try:
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass

# 确保项目根目录在 sys.path 中
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))


def _check_single_instance(port: int) -> bool:
    """单实例锁：防止重复启动"""
    lock_sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        lock_sock.bind(('127.0.0.1', port + 1))
        return True
    except OSError:
        # 已有实例在运行
        import urllib.request
        try:
            urllib.request.urlopen(f'http://localhost:{port}/api/show', timeout=2)
        except Exception:
            pass
        try:
            webbrowser.open(f'http://localhost:{port}')
        except Exception:
            pass
        return False


def main():
    port = 5622

    # 单实例检查
    if not _check_single_instance(port):
        print(f"LangAgentV3 已在端口 {port} 运行中，已尝试恢复窗口。")
        sys.exit(0)

    print("=" * 60)
    print(f"[START] LangAgentV3 Headless 后端启动中...")
    print(f"[PORT] 监听端口: {port}")
    print(f"[DOCS] API 文档: http://localhost:{port}/docs")
    print("=" * 60)

    import uvicorn
    uvicorn.run(
        "app.main:app",
        host="localhost",
        port=port,
        log_level="info",
        log_config=None,
    )


if __name__ == '__main__':
    main()
