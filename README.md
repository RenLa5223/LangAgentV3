# LangAgentV3

本地运行的 AI Agent 桌面应用，Tauri + FastAPI + React 混合架构。支持 OpenAI / Anthropic 协议 API，动态端口分配，长短期记忆，RAG 检索，主动消息。

## 安装

从 [Releases](https://github.com/RenLa5223/LangAgentV3/releases) 下载最新 `LangAgentV3_x.x.x_x64-setup.exe`，双击安装即可。首次启动后点击「模型配置」填入 API 地址和密钥。

> 数据存储在 `%APPDATA%\LangAgentV3\Data\`，重装/升级不会丢失。

## 技术栈

| 层 | 技术 | 说明 |
|---|---|---|
| 桌面壳 | Tauri 1.7 (Rust) | 动态端口分配、环境变量注入、IPC、系统托盘、单实例锁、Alt+Space 全局快捷键 |
| 后端 | Python FastAPI + Uvicorn | 异步 API，`LANGAGENT_PORT` 环境变量优先，默认 5622，绑定 `127.0.0.1` |
| 前端 | React 19 + Vite 8 | SPA，智能检测 Tauri/Web 切换动态 Base URL |
| 样式 | TailwindCSS 3 | 新拟态 (Neumorphism) 设计 |
| 状态管理 | Zustand 5 | 轻量响应式 |
| 打包 | PyInstaller + Cargo | `cargo tauri build` 一键完成全量构建 |

## 架构亮点

- **动态端口** — `TcpListener::bind("127.0.0.1:0")` 随机分配，通过 `LANGAGENT_PORT` 注入 Python sidecar，前端 IPC 获取。彻底消除端口冲突。
- **APPDATA 标准化** — 生产环境数据写入 `%APPDATA%\LangAgentV3\Data\`，安装目录干净，卸载不留残留，重装保留全部数据。
- **全局常量池** — `app/core/constants.py` 集中管理 40+ 个文件名、阈值、超时参数。
- **前端启动屏障** — 端口就绪前显示加载画面，确保首次 API 调用不失败。
- **测试零污染** — 7 处隔离点（临时目录重定向、备份还原、mock），55 项测试不触碰真实数据。
- **系统重置** — 支持一键恢复出厂状态，清除全部配置、记忆、归档、头像，前端需输入「确认重置」防误触。

## 功能

- **多模型兼容** — OpenAI 和 Anthropic 两种 API 格式，可探测远端模型列表
- **长短期记忆** — 短期对话上下文 + 艾宾浩斯遗忘曲线评分 + 长期记忆摘要压缩
- **RAG 检索** — Bi-gram 倒排索引 + BM25 算法，对话自动归档并注入 LLM 上下文
- **用户画像** — AI 自动提取并累积用户特征、偏好、习惯
- **人物系统** — Agent 档案、用户档案，可编辑与管理
- **主动消息** — 可配置时间窗口和间隔的自动触发
- **图片对话** — 支持粘贴/上传图片
- **语音输入** — Web Speech API 浏览器端语音识别
- **电路熔断** — 连续失败计数 + 自动冷却，防 API 频繁重试
- **安全令牌** — 运行时动态 Session Token，HMAC 常量时间比较
- **系统诊断** — 6 节点全链路健康检查，含日志流预览

## 文件树

```
LangAgentV3/
├── main.py                          # Uvicorn 启动器 (动态端口 + 单实例锁)
├── index.html                       # Vite 开发入口
├── package.json                     # 前端依赖与脚本
├── requirements.txt                 # Python 依赖
├── vite.config.js                   # Vite 构建 (dev: base /, build: base /static/)
├── tailwind.config.js
├── postcss.config.js
│
├── app/                             # Python 后端
│   ├── main.py                      # FastAPI 应用工厂
│   ├── api/
│   │   ├── chat.py                  # 聊天与轮询
│   │   ├── config_endpoints.py      # 配置读写 / 模型探测 / 重置
│   │   ├── deps.py                  # 依赖注入 / Token 验证
│   │   ├── files.py                 # 头像 / 临时图片
│   │   ├── router.py                # 路由聚合
│   │   └── system.py                # 健康 / 状态 / 版本 / 日志
│   ├── core/
│   │   ├── config.py                # Settings (HOST/PORT) / 路径 / 艾宾浩斯算法
│   │   ├── constants.py             # 全局常量池 (40+ 参数)
│   │   ├── llm_engine.py            # LLM 引擎 + 熔断 + 上下文 + 签名
│   │   ├── memory_engine.py         # 记忆引擎 (摘要 / 画像 / 主动消息 / 死信)
│   │   ├── rag_engine.py            # Bi-gram 倒排索引 + BM25
│   │   └── security.py              # Session Token / 服务器密钥
│   ├── services/
│   │   ├── chat_service.py          # 聊天 Pipeline
│   │   ├── config_service.py        # 文件读写 / 系统重置
│   │   └── rag_service.py           # RAG 索引队列消费者
│   └── utils/
│       ├── constants.py             # 文件夹白名单
│       ├── fs_lock.py               # 协程安全文件锁
│       └── logging.py               # Loguru 日志 (轮转 30 天)
│
├── src/                             # React 前端
│   ├── main.jsx                     # 入口
│   ├── App.jsx                      # 根组件 (端口屏障 / 路由 / 初始化)
│   ├── api/
│   │   ├── index.js
│   │   └── request.js              # 动态 baseUrl + Token 注入
│   ├── components/
│   │   ├── chat/                    # ChatHeader / ChatInput / MessageList
│   │   ├── manage/                  # EditorPanel / Sidebar
│   │   └── modals/                  # Health / ModelConfig / Reset / Wizard
│   ├── stores/
│   │   ├── useAppStore.js           # baseUrl / portReady / initServerPort
│   │   ├── useChatStore.js          # 消息 / 轮询
│   │   └── useConfigStore.js        # 模型 / 主动消息
│   └── views/
│       ├── ChatView.jsx             # /
│       └── ManageView.jsx           # /manage
│
├── src-tauri/                       # Tauri 桌面壳
│   ├── tauri.conf.json              # 打包流水线 (beforeBuildCommand 一键串联)
│   ├── icons/                       # 5 尺寸应用图标
│   └── src/main.rs                  # 动态端口 + IPC + Sidecar + 托盘
│
├── scripts/
│   ├── build_engine.py              # PyInstaller (不含 Data/)
│   └── generate_icons.py
│
└── tests/                           # 55 项，零污染隔离
    ├── test_api.py
    └── test_core.py
```

## 开发

### 环境要求

- Python 3.10+ / Node.js 18+ / Rust 1.70+ (仅桌面模式)

### 启动

```bash
git clone https://github.com/RenLa5223/LangAgentV3.git
cd LangAgentV3
pip install -r requirements.txt
npm install
npm run build

# 终端 1：后端
python main.py

# 终端 2：前端
npm run dev
```

浏览器访问 `http://localhost:5173`。

### 自定义端口

```bash
LANGAGENT_PORT=8888 python main.py
```

Tauri 桌面模式自动分配随机端口，无需手动指定。

### 桌面打包

```bash
cargo tauri dev          # 开发模式
cargo tauri build        # 一键生产打包 → .msi + .exe
```

### 测试

```bash
python -m pytest tests/ -v   # 55 项，零污染
```

## 数据目录

| 模式 | 位置 |
|---|---|
| 开发 (`python main.py`) | 项目根 `Data/` |
| 生产 (安装的 exe) | `%APPDATA%\LangAgentV3\Data\` |
| APPDATA 不可用 | exe 同级目录 |

首次启动自动创建全部子目录。`Data/config/config.json` 保存模型 API 配置，其他目录为运行时数据（记忆、画像、日志等）。

## 系统重置

档案室 → 功能设置 → 系统诊断下方可找到重置入口。需输入「确认重置」后执行，将清除所有配置、记忆、归档、头像，恢复为首次启动状态。数据目录本身不会被删除（下次启动自动重建空文件）。
