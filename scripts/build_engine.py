# -*- coding: utf-8 -*-
"""
LangAgentV3 — Python Sidecar 打包脚本
使用 PyInstaller 将 FastAPI 后端打包为独立可执行程序，
输出到 src-tauri/bin/ 以匹配 Tauri Sidecar 规范。
"""
import os
import sys
import subprocess
import shutil
import platform


def get_project_root():
    return os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))


def get_target_triple():
    """返回 Tauri Sidecar 目标三元组"""
    system = platform.system().lower()
    machine = platform.machine().lower()

    triple_map = {
        ("windows", "amd64"): "x86_64-pc-windows-msvc",
        ("windows", "x86_64"): "x86_64-pc-windows-msvc",
        ("linux", "x86_64"): "x86_64-unknown-linux-gnu",
        ("darwin", "arm64"): "aarch64-apple-darwin",
        ("darwin", "x86_64"): "x86_64-apple-darwin",
    }
    return triple_map.get((system, machine), f"{machine}-{system}")


def check_pyinstaller():
    try:
        subprocess.run([sys.executable, "-m", "PyInstaller", "--version"], capture_output=True, check=True)
        return True
    except (subprocess.CalledProcessError, FileNotFoundError):
        print("[ERROR] PyInstaller 未安装。请运行: pip install pyinstaller")
        return False


def main():
    root = get_project_root()
    os.chdir(root)

    target_triple = get_target_triple()
    bin_name = f"core-engine-{target_triple}"
    bin_dir = os.path.join(root, "src-tauri", "bin")
    os.makedirs(bin_dir, exist_ok=True)

    print("=" * 60)
    print(f"LangAgentV3 PyInstaller 打包脚本")
    print(f"项目根目录: {root}")
    print(f"目标三元组: {target_triple}")
    print(f"输出文件:   {bin_name}.exe" if sys.platform == "win32" else f"输出文件:   {bin_name}")
    print("=" * 60)

    if not check_pyinstaller():
        sys.exit(1)

    # ---- 构建 PyInstaller 命令 ----
    # 数据目录映射（使用绝对路径，防止 PyInstaller 解析相对路径时错位）
    sep = ";" if sys.platform == "win32" else ":"
    templates_abs = os.path.join(root, "templates")
    static_abs = os.path.join(root, "static")

    add_data_args = [
        "--add-data", f"{templates_abs}{sep}templates",
        "--add-data", f"{static_abs}{sep}static",
    ]

    # 隐藏导入（PyInstaller 自动检测不到的动态导入模块）
    hidden_imports = [
        "uvicorn", "uvicorn.loops", "uvicorn.loops.auto",
        "uvicorn.protocols", "uvicorn.protocols.http",
        "uvicorn.protocols.http.auto",
        "fastapi", "fastapi.middleware", "fastapi.middleware.cors",
        "loguru", "loguru._handler",
        "pydantic", "pydantic_settings",
        "aiofiles",
        "app", "app.main", "app.api", "app.core", "app.services", "app.utils",
        "app.api.router", "app.api.chat", "app.api.config_endpoints",
        "app.api.system", "app.api.files", "app.api.deps",
        "app.core.config", "app.core.llm_engine", "app.core.memory_engine",
        "app.core.rag_engine", "app.core.security",
        "app.services.chat_service", "app.services.config_service",
        "app.services.rag_service",
        "app.utils.fs_lock", "app.utils.logging", "app.utils.constants",
        "asyncio",
        "urllib.request", "urllib.error",
        "json", "re", "hashlib", "hmac", "uuid", "secrets",
        "mimetypes", "base64", "platform",
    ]

    hidden_import_args = []
    for mod in hidden_imports:
        hidden_import_args.extend(["--hidden-import", mod])

    # 输出路径
    output_args = [
        "--distpath", bin_dir,
        "--workpath", os.path.join(root, "build", "pyinstaller"),
        "--specpath", os.path.join(root, "build"),
        "--name", bin_name,
    ]

    cmd = [
        sys.executable, "-m", "PyInstaller",
        "--onefile",
        "--noconsole",
        "--clean",
        *output_args,
        *add_data_args,
        *hidden_import_args,
        os.path.join(root, "main.py"),
    ]

    print("\n执行命令:")
    print(" ".join(cmd))
    print()

    result = subprocess.run(cmd, cwd=root)
    if result.returncode != 0:
        print("\n[ERROR] PyInstaller 打包失败!")
        sys.exit(1)

    # ---- 校验输出 ----
    exe_ext = ".exe" if sys.platform == "win32" else ""
    output_exe = os.path.join(bin_dir, f"{bin_name}{exe_ext}")
    if os.path.exists(output_exe):
        size_mb = os.path.getsize(output_exe) / (1024 * 1024)
        print(f"\n[SUCCESS] Sidecar 引擎打包成功!")
        print(f"文件: {output_exe}")
        print(f"大小: {size_mb:.1f} MB")

        # Tauri release 模式加载 core-engine.exe（不带目标三元组）
        release_dir = os.path.join(root, "src-tauri", "target", "release")
        dest = os.path.join(release_dir, f"core-engine{exe_ext}")
        try:
            os.makedirs(release_dir, exist_ok=True)
            shutil.copy2(output_exe, dest)
            print(f"[SYNC] → {dest}  ({os.path.getsize(dest) / (1024*1024):.1f} MB)")
        except Exception as e:
            print(f"[WARN] 同步失败: {dest} — {e}")
    else:
        print(f"\n[ERROR] 输出文件未找到: {output_exe}")
        # 尝试查找
        for f in os.listdir(bin_dir):
            print(f"  bin目录内容: {f}")
        sys.exit(1)


if __name__ == "__main__":
    main()
