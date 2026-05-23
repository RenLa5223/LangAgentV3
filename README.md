# LangAgentV3

本地运行的 AI Agent 桌面应用，Tauri + FastAPI + React 混合架构。支持 OpenAI / Anthropic 协议 API，动态端口分配，长短期记忆，RAG 检索，主动消息。

## 技术栈

| 层 | 技术 | 说明 |
|---|---|---|
| 桌面壳 | Tauri 1.7 (Rust) | 动态端口分配、环境变量注入、IPC 暴露端口、系统托盘常驻、单实例锁、Alt+Space 全局快捷键 |
| 后端 | Python FastAPI + Uvicorn | 异步 API 服务，优先读取 `LANGAGENT_PORT` 环境变量，默认 5622，绑定 `127.0.0.1` |
| 前端 | React 19 + Vite 8 | SPA 界面，智能检测 Tauri/Web 环境切换动态 Base URL |
| 样式 | TailwindCSS 3 | 新拟态 (Neumorphism) 设计风格 |
| 状态管理 | Zustand 5 | 轻量响应式状态 |
| 打包 | PyInstaller + Cargo | 后端 pyinstaller → exe，前端 vite build → 静态资源，Tauri 壳一体封装 |

## 架构亮点

- **动态端口** — Rust `TcpListener::bind("127.0.0.1:0")` 随机分配，通过 `LANGAGENT_PORT` 环境变量注入 Python 侧车，前端通过 `get_server_port` IPC 获取。彻底消除端口冲突。
- **全局常量池** — `app/core/constants.py` 集中管理 40+ 个文件名、阈值、超时参数，14 个文件引用统一。
- **启动屏障** — React `App.jsx` 在端口就绪前显示加载画面，确保首次 API 调用不会失败。
- **测试零污染** — 7 处隔离点（临时目录重定向、备份还原、mock），55 项测试全部通过且不触碰真实数据。
- **一键打包** — `cargo tauri build` 自动串联 `npm run build` → `PyInstaller` → `Cargo bundle`。

## 功能

- **多模型兼容** — OpenAI 和 Anthropic 两种 API 格式，可探测远端模型列表
- **长短期记忆** — 短期对话上下文 + 艾宾浩斯遗忘曲线评分 + 长期记忆摘要压缩
- **RAG 检索** — Bi-gram 倒排索引 + BM25 算法，对话自动归档并注入 LLM 上下文
- **用户画像** — AI 自动提取用户事实，对话中持续累积观察情报
- **人物系统** — Agent 档案、用户档案，可编辑与管理
- **主动消息** — 可配置时间窗口和间隔的自动触发消息
- **图片对话** — 支持粘贴/上传图片
- **语音输入** — 基于 Web Speech API 的浏览器端语音识别
- **电路熔断** — 连续失败计数 + 自动冷却，防止 API 频繁错误重试
- **安全令牌** — 运行时动态 Session Token，HMAC 常量时间比较
- **系统诊断** — 6 节点全链路健康检查面板，含日志流预览

## 文件树

```
LangAgentV3/
├── main.py                          # Uvicorn 启动器 (动态端口 + 单实例锁)
├── index.html                       # Vite 开发入口
├── package.json                     # 前端依赖与脚本
├── requirements.txt                 # Python 依赖
├── vite.config.js                   # Vite 构建配置 (dev: base /, build: base /static/)
├── tailwind.config.js               # TailwindCSS 主题
├── postcss.config.js                # PostCSS 配置
│
├── app/                             # Python 后端
│   ├── main.py                      # FastAPI 应用工厂 (CORS / 生命周期 / 路由 / 静态挂载)
│   ├── api/
│   │   ├── chat.py                  # 聊天与轮询接口
│   │   ├── config_endpoints.py      # 配置读写 / 模型探测 / 重置
│   │   ├── deps.py                  # 配置依赖注入 / Token 验证
│   │   ├── files.py                 # 头像上传 / 临时图片
│   │   ├── router.py                # 路由聚合
│   │   └── system.py                # 健康检查 / 状态 / 版本 / 日志
│   ├── core/
│   │   ├── config.py                # Pydantic Settings (HOST/PORT 环境变量) / 路径常量 / 艾宾浩斯算法
│   │   ├── constants.py             # 全局常量池 (文件名 / 阈值 / 超时 / BM25 参数)
│   │   ├── llm_engine.py            # LLM 引擎 + 电路熔断 + 上下文构建 + 签名生成
│   │   ├── memory_engine.py         # 记忆引擎 (摘要 / 用户画像 / 主动消息 / 死信重试)
│   │   ├── rag_engine.py            # Bi-gram 倒排索引 + BM25 检索
│   │   └── security.py              # Session Token / 重置令牌 / 服务器密钥
│   ├── services/
│   │   ├── chat_service.py          # 聊天 Pipeline 与回复分条
│   │   ├── config_service.py        # 文件读写 / 系统重置
│   │   └── rag_service.py           # RAG 索引队列消费者
│   └── utils/
│       ├── constants.py             # 文件夹白名单与错误标记
│       ├── fs_lock.py               # 协程安全文件锁与原子读写
│       └── logging.py               # Loguru 日志 (轮转保留 30 天)
│
├── src/                             # React 前端
│   ├── main.jsx                     # 入口
│   ├── App.jsx                      # 根组件 (动态端口屏障 / 路由 / 初始化)
│   ├── api/
│   │   ├── index.js                 # 导出
│   │   └── request.js              # 统一请求层 (动态 baseUrl + Token 注入)
│   ├── assets/
│   │   └── tailwind.css
│   ├── components/
│   │   ├── ToastContainer.jsx
│   │   ├── chat/
│   │   │   ├── ChatHeader.jsx       # 签名 / 状态 / 模型配置
│   │   │   ├── ChatInput.jsx        # 输入框 (发送后自动聚焦)
│   │   │   └── MessageList.jsx      # 消息列表 + 默认头像占位
│   │   ├── manage/
│   │   │   ├── EditorPanel.jsx      # 档案 / 用户画像 / 记忆 / 设置
│   │   │   └── Sidebar.jsx
│   │   └── modals/
│   │       ├── HealthModal.jsx      # 6 节点终端诊断
│   │       ├── ModelConfigModal.jsx # 模型配置 (含超时)
│   │       ├── ResetModal.jsx
│   │       └── WizardModal.jsx      # 新手引导
│   ├── stores/
│   │   ├── useAppStore.js           # serverBaseUrl / portReady / initServerPort / 模态 / Toast
│   │   ├── useChatStore.js          # 消息 / 轮询 / 流式
│   │   └── useConfigStore.js        # 模型 / 主动消息 / 同步
│   └── views/
│       ├── ChatView.jsx             # /
│       └── ManageView.jsx           # /manage
│
├── src-tauri/                       # Tauri 桌面壳
│   ├── Cargo.toml
│   ├── build.rs
│   ├── tauri.conf.json              # 窗口 / Sidecar / 打包 / 一键流水线
│   ├── icons/                       # 5 尺寸应用图标
│   └── src/
│       └── main.rs                  # 动态端口 + IPC + Sidecar 管理 + 托盘
│
├── scripts/
│   ├── build_engine.py              # PyInstaller 打包 (不含 Data/)
│   └── generate_icons.py
│
├── tests/
│   ├── test_api.py                  # API 端点测试 (20 项)
│   └── test_core.py                 # 核心引擎测试 (35 项，含 RAG / 记忆 / 熔断)
│
└── Data/                            # 运行时自动创建 (git 忽略)
    ├── agent_profile/
    ├── avatars/
    ├── config/
    ├── user_portrait/               # AI 自动提取的用户画像
    ├── logs/
    ├── memory_archive/              # archive_db + inverted_index
    ├── memory_core/                 # chat_history + memory_summary
    ├── memory_retry/
    ├── temp_images/
    └── user_profile/
```

## 启动方式

### 环境要求

- Python 3.10+
- Node.js 18+
- Rust 1.70+ (仅桌面模式)

### 克隆后开始

```bash
git clone https://github.com/RenLa5223/LangAgentV3.git
cd LangAgentV3
pip install -r requirements.txt
npm install
npm run build        # 构建前端并复制到 templates/ + static/
```

仓库不包含以下内容（`.gitignore` 排除）：

| 缺失内容 | 恢复方式 |
|---|---|
| `node_modules/` | `npm install` |
| `templates/` `static/` | `npm run build` |
| `Data/` | 首次启动自动创建，API 配置需手动填写 |
| `dist/` `build/` `target/` | `npm run build` / `cargo tauri build` |

### 开发模式

```bash
python main.py        # 终端 1：后端 http://127.0.0.1:5622
npm run dev           # 终端 2：前端 http://localhost:5173
```

浏览器访问 `http://localhost:5173`，Vite 自动代理 `/api` 到后端。

### 自定义端口

```bash
# 环境变量指定
LANGAGENT_PORT=8888 python main.py

# Tauri 模式自动分配随机端口，无需手动指定
```

### Tauri 桌面模式

```bash
cargo tauri dev        # 开发模式 (动态端口，Vite HMR)
cargo tauri build      # 一键生产打包 → .msi + .exe
```

`beforeBuildCommand` 已串联 `npm run build && python scripts/build_engine.py`，一步完成全量构建。

## API 端点

| 端点 | 方法 | 说明 |
|---|---|---|
| `/api/health` | GET | 全链路健康诊断 |
| `/api/status` | GET | Agent 连接状态 |
| `/api/version` | GET | 版本号 |
| `/api/chat` | POST | 发送聊天消息 |
| `/api/poll` | GET | 轮询新消息 |
| `/api/signature` | GET | 每日签名 |
| `/api/read/{folder}/{filename}` | GET | 读取数据文件 |
| `/api/save` | POST | 写入数据文件 |
| `/api/get_models` | POST | 探测远端模型列表 |
| `/api/avatar/{role}` | GET | 获取头像 |
| `/api/upload_avatar` | POST | 上传头像 |
| `/api/temp_image/{filename}` | GET | 获取临时图片 |
| `/api/reset` | POST | 系统重置 |
| `/api/logs/stream` | GET | 实时日志流 |
| `/api/logs/open_folder` | GET | 打开日志文件夹 |
| `/api/show` | GET | 恢复窗口 |
| `/` | GET | 前端页面 (注入 Session Token) |

## 配置

首次启动后点击「模型配置」，填入 API 地址、密钥和模型名称。支持 OpenAI 格式 (URL 含 `/chat/completions`) 和 Anthropic 格式 (URL 含 `/messages`)。超时可在模型配置中调整（分钟单位，后端自动转换为秒）。

所有运行时数据存储在 `Data/`，配置在 `Data/config/config.json`。

## 测试

```bash
python -m pytest tests/ -v   # 55 项测试，零污染隔离
```
