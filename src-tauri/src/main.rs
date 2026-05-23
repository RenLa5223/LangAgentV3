// ================================================================
// LangAgent — Tauri Sidecar 进程管理器
// 单实例 → Sidecar 生命周期 → 托盘常驻
// ================================================================

#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{
    api::process::Command as TauriCommand,
    AppHandle, CustomMenuItem, Manager, RunEvent, SystemTray, SystemTrayEvent,
    SystemTrayMenu, SystemTrayMenuItem, GlobalShortcutManager,
};

/// ====== Rust IPC 指令：零拷贝硬件感知 ======
#[tauri::command]
fn get_system_hardware_info() -> String {
    let cpu = std::thread::available_parallelism()
        .map(|n| n.get()).unwrap_or(0);
    format!("OS: {} | CPU logical cores: {}", std::env::consts::OS, cpu)
}


/// Python Sidecar 进程句柄
struct SidecarState {
    child: Arc<Mutex<Option<tauri::api::process::CommandChild>>>,
}

// ============================================================================
// 端口探测
// ============================================================================
fn wait_for_port(host: &str, port: u16, timeout_secs: u64) -> bool {
    use std::net::TcpStream;
    let deadline = std::time::Instant::now() + Duration::from_secs(timeout_secs);
    loop {
        let addr = format!("{}:{}", host, port);
        match TcpStream::connect_timeout(&addr.parse().unwrap(), Duration::from_millis(300)) {
            Ok(_) => return true,
            Err(_) => {
                if std::time::Instant::now() > deadline {
                    return false;
                }
                std::thread::sleep(Duration::from_millis(200));
            }
        }
    }
}

// ============================================================================
// 启动 Python Sidecar
// ============================================================================
fn start_sidecar(_app: &AppHandle) -> Result<tauri::api::process::CommandChild, String> {
    let (mut rx, child) = TauriCommand::new_sidecar("core-engine")
        .map_err(|e| format!("无法创建 sidecar 命令: {}", e))?
        .spawn()
        .map_err(|e| format!("无法启动 sidecar: {}", e))?;

    tauri::async_runtime::spawn(async move {
        use tauri::api::process::CommandEvent;
        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(line) => println!("[core-engine] {}", line),
                CommandEvent::Stderr(line) => eprintln!("[core-engine-err] {}", line),
                CommandEvent::Terminated(status) => {
                    println!("[core-engine] 进程退出, code: {:?}", status.code);
                }
                _ => {}
            }
        }
    });

    Ok(child)
}

// ============================================================================
// 安全销毁 Python Sidecar 进程
// ============================================================================
fn kill_sidecar(child: &Arc<Mutex<Option<tauri::api::process::CommandChild>>>) {
    if let Ok(mut guard) = child.lock() {
        if let Some(c) = guard.take() {
            println!("[Tauri] 正在终止 Sidecar 引擎...");
            let _ = c.kill();
            std::thread::sleep(Duration::from_millis(500));
            println!("[Tauri] Sidecar 引擎已终止");
        }
    }
}

// ============================================================================
// 主入口
// ============================================================================
fn main() {
    // ----- 系统托盘菜单 -----
    let show_item = CustomMenuItem::new("show".to_string(), "显示主界面");
    let quit_item = CustomMenuItem::new("quit".to_string(), "彻底退出");
    let tray_menu = SystemTrayMenu::new()
        .add_item(show_item)
        .add_native_item(SystemTrayMenuItem::Separator)
        .add_item(quit_item);
    let system_tray = SystemTray::new().with_menu(tray_menu);

    // Sidecar 句柄
    let sidecar_child: Arc<Mutex<Option<tauri::api::process::CommandChild>>> =
        Arc::new(Mutex::new(None));
    let sidecar_child_clone = sidecar_child.clone();
    let sidecar_child_tray = sidecar_child.clone();

    tauri::Builder::default()
        // ----- 单实例防多开 -----
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            if let Some(window) = app.get_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        // ----- 注册 Rust IPC 指令 -----
        .invoke_handler(tauri::generate_handler![get_system_hardware_info])
        // ----- 系统托盘 -----
        .system_tray(system_tray)
        .manage(SidecarState {
            child: sidecar_child.clone(),
        })
        // ----- 启动阶段 -----
        .setup(move |app| {
            println!("[Tauri] 正在启动 Sidecar 引擎...");

            match start_sidecar(&app.handle()) {
                Ok(child) => {
                    *sidecar_child_clone.lock().unwrap() = Some(child);
                    println!("[Tauri] Sidecar 引擎已启动");
                }
                Err(e) => {
                    eprintln!("[Tauri] Sidecar 启动失败: {}", e);
                }
            }

            // 等待端口就绪后导航并显示窗口
            let target_url = "http://127.0.0.1:5622";
            println!("[Tauri] 等待引擎端口就绪 (127.0.0.1:5622)...");
            let window = app.get_window("main").unwrap();

            if wait_for_port("127.0.0.1", 5622, 15) {
                println!("[Tauri] 引擎端口已就绪");
                let js = format!("window.location.replace('{}')", target_url);
                let _ = window.eval(&js);
            } else {
                eprintln!("[Tauri] 警告: 引擎端口在 15 秒内未就绪");
            }
            let _ = window.show();

            // 注册全局快捷键 Alt+Space 切换窗口显隐
            let window_handle = app.get_window("main").unwrap();
            app.global_shortcut_manager()
                .register("Alt+Space", move || {
                    if window_handle.is_visible().unwrap_or(false) {
                        let _ = window_handle.hide();
                    } else {
                        let _ = window_handle.show();
                        let _ = window_handle.set_focus();
                    }
                })
                .ok();

            Ok(())
        })
        // ----- 托盘事件 -----
        .on_system_tray_event(move |app, event| match event {
            SystemTrayEvent::MenuItemClick { id, .. } => match id.as_str() {
                "show" => {
                    if let Some(window) = app.get_window("main") {
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                }
                "quit" => {
                    kill_sidecar(&sidecar_child_tray);
                    std::process::exit(0);
                }
                _ => {}
            },
            SystemTrayEvent::LeftClick { .. } => {
                if let Some(window) = app.get_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
            _ => {}
        })
        // ----- 关闭窗口 → 隐藏到托盘 -----
        .on_window_event(|event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event.event() {
                let _ = event.window().hide();
                api.prevent_close();
            }
        })
        // ----- 构建 & 运行 -----
        .build(tauri::generate_context!())
        .expect("Tauri 应用构建失败")
        .run(|app_handle, event| match event {
            RunEvent::ExitRequested { .. } => {
                kill_sidecar(&app_handle.state::<SidecarState>().child);
            }
            _ => {}
        });
}
