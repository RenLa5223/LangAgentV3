# LangAgentV3

本地运行的 AI Agent 桌面应用，Tauri + FastAPI + React 混合架构。支持 OpenAI / Anthropic 双协议 API，动态端口分配，长短期记忆，RAG 检索，插件系统，Function Calling 工具调用，主动消息，本地音乐播放器。

## 安装

从 [Releases](https://github.com/RenLa5223/LangAgentV3/releases) 下载最新 `LangAgentV3_x.x.x_x64-setup.exe`，双击安装即可。首次启动后点击「模型配置」填入 API 地址和密钥。

> 数据存储在 `%APPDATA%\LangAgentV3\Data\`，重装/升级不会丢失。

## 技术栈

| 层 | 技术 | 说明 |
|---|---|---|
| 桌面壳 | Tauri 2.x (Rust) | 动态端口分配、环境变量注入、IPC、系统托盘、单实例锁、Alt+Space 全局快捷键 |
| 后端 | Python FastAPI + Uvicorn | 异步 API，`LANGAGENT_PORT` 环境变量优先，默认 5622，绑定 `127.0.0.1` |
| 前端 | React 19 + Vite 8 | SPA，智能检测 Tauri/Web 切换动态 Base URL |
| 样式 | TailwindCSS 3 | 新拟态 (Neumorphism) 设计 |
| 状态管理 | Zustand 5 | 轻量响应式 |
| 打包 | PyInstaller + Cargo | `cargo tauri build` 一键完成全量构建 |

## 功能

- **多模型兼容** — OpenAI 和 Anthropic 两种 API 格式，可探测远端模型列表
- **Function Calling** — 双协议工具调用（OpenAI `tools` + Anthropic `tool_use/tool_result`），LLM 自主判断意图并调用插件工具，多轮回环调度
- **插件系统** — 热插拔插件总线，三种 Hook 分发（modifier 透传 / override 劫持 / event 广播），Context 依赖注入隔离，劣质插件崩溃不回传
- **插件中心** — JSON Schema 动态 UI 渲染（文本/密码/开关/单选/滑块/Markdown/iframe 沙盒），即时自动保存，开关一键启停
- **长短期记忆** — 短期对话上下文 + 艾宾浩斯遗忘曲线评分 + 长期记忆摘要压缩
- **记忆星标** — 关键记忆冻结衰减，30 条上限，取消时艾宾浩斯反推时间平滑恢复
- **主动消息熔断** — 末尾连续 Agent 消息达阈值时自动跳过，防止机器人自说自话
- **RAG 检索** — Bi-gram 倒排索引 + BM25 算法，对话自动归档并注入 LLM 上下文
- **外部通道** — `/api/v1/chat/sync_invoke` 供微信机器人等外部系统调用，独立 API Key 鉴权
- **用户画像** — AI 自动提取并累积用户特征、偏好、习惯
- **人物系统** — Agent 档案、用户档案，可编辑与管理
- **主动消息** — 可配置时间窗口和间隔的自动触发
- **图片对话** — 支持粘贴/上传图片，插件可劫持视觉识别
- **语音输入** — Web Speech API 浏览器端语音识别
- **音乐播放器** — 灵动岛常驻播放控件，支持 MP3/WAV/FLAC/OGG/AAC/M4A/WMA，拖拽上传，批量屏蔽/删除，206 Partial Content 无损流传输，路由切换播放不中断
- **电路熔断** — 连续失败计数 + 自动冷却，防 API 频繁重试
- **安全令牌** — 运行时动态 Session Token，HMAC 常量时间比较
- **系统诊断** — 6 节点全链路健康检查，含日志流预览

## 插件系统

### Hook 机制

| Hook | 类型 | 触发位置 | 用途 |
|---|---|---|---|
| `HOOK_BEFORE_LLM_PROMPT` | modifier | LLM 消息组装末尾 | 向 prompt 注入上下文（爬虫、天气） |
| `HOOK_OVERRIDE_VISION` | override | 图片处理前 | 劫持图片识别，非 None 即短路 |
| `HOOK_OVERRIDE_RAG_SEARCH` | override | RAG 检索顶部 | 劫持记忆检索，非 None 即短路 |

### Tool Calling (Function Calling)

插件可在 `manifest.json` 中声明 `tool_schema`，LLM 自主决定是否调用。

**双协议自动路由：**

| | OpenAI | Anthropic |
|---|---|---|
| tools 格式 | `[{type:"function", function:{...}}]` | `[{name, description, input_schema}]` |
| tool_choice | `"auto"` | `{"type": "auto"}` |
| 鉴权 | `Authorization: Bearer` | `x-api-key` + `anthropic-version: 2023-06-01` |
| 响应解析 | `choices[0].message.tool_calls` | `content[]` 中 `type=="tool_use"` |
| 结果回传 | `{role:"tool", tool_call_id, content}` | `{role:"user", content: [{type:"tool_result",...}]}` |

**调度流程：** LLM 请求带 tools → 返回 tool_calls → 插件 `execute_tool()` → 结果喂回 LLM → 自然语言回复。

### 插件结构

```
Data/plugins/{plugin_id}/
├── manifest.json    # 声明 id/name/version/enabled/hooks/tool_schema/ui_schema
├── main.py          # register(ctx) + hook 处理函数 / execute_tool(args)
├── settings.json    # 前端即时自动保存的配置（运行时生成）
└── status.json      # 插件运行状态（可选，供前端 status_box 轮询）
```

### Context 依赖注入

插件不直接 `import app.xxx`，而是通过 `register(ctx)` 接收：
- `ctx["logger"]` — 系统日志器
- `ctx["plugin_dir"]` — 插件自身目录
- `ctx["dispatch_event"]` — 反向事件触发

## 架构亮点

- **动态端口** — `TcpListener::bind("127.0.0.1:0")` 随机分配，通过 `LANGAGENT_PORT` 注入 Python sidecar，前端 IPC 获取。彻底消除端口冲突。
- **APPDATA 标准化** — 生产环境数据写入 `%APPDATA%\LangAgentV3\Data\`，安装目录干净，卸载不留残留，重装保留全部数据。
- **全局常量池** — `app/core/constants.py` 集中管理 40+ 个文件名、阈值、超时参数。
- **前端启动屏障** — 端口就绪前显示加载画面，确保首次 API 调用不失败。
- **测试零污染** — 沙盒隔离（`os.rename` 原子操作 + 专用测试文件），不触碰真实数据。
- **系统重置** — 支持一键恢复出厂状态，清除全部配置、记忆、归档、头像，前端需输入「确认重置」防误触。

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
│   ├── main.py                      # FastAPI 应用工厂 (lifespan: 插件初始化)
│   ├── api/
│   │   ├── chat.py                  # 聊天与轮询
│   │   ├── config_endpoints.py      # 配置读写 / 模型探测 / 重置
│   │   ├── deps.py                  # 依赖注入 / Token 验证
│   │   ├── files.py                 # 头像 / 临时图片 / 音乐流 (206 Range)
│   │   ├── memory_endpoints.py      # 记忆星标 API
│   │   ├── plugins.py               # 插件管理 (列表/启停/设置/状态/静态资源)
│   │   ├── webhook.py               # 外部通道 (sync_invoke)
│   │   ├── router.py                # 路由聚合
│   │   └── system.py                # 健康 / 状态 / 版本 / 日志
│   ├── core/
│   │   ├── config.py                # Settings (HOST/PORT) / 路径 / 艾宾浩斯算法 / 星标冻结
│   │   ├── constants.py             # 全局常量池 (40+ 参数)
│   │   ├── llm_engine.py            # LLM 引擎 + 熔断 + 双协议 Tool Calling + 签名
│   │   ├── memory_engine.py         # 记忆引擎 (摘要 / 画像 / 主动消息熔断 / 死信)
│   │   ├── plugin_manager.py        # 插件总线 (加载/三种Hook分发/Tool注册与调度)
│   │   ├── rag_engine.py            # Bi-gram 倒排索引 + BM25 (HOOK 劫持点)
│   │   └── security.py              # Session Token / 服务器密钥
│   ├── services/
│   │   ├── chat_service.py          # 聊天 Pipeline (多轮 Tool Call 回环)
│   │   ├── config_service.py        # 文件读写 / 系统重置
│   │   └── rag_service.py           # RAG 索引队列消费者
│   └── utils/
│       ├── constants.py             # 文件夹白名单 (含 music)
│       ├── fs_lock.py               # 协程安全文件锁
│       └── logging.py               # Loguru 日志 (轮转 30 天)
│
├── src/                             # React 前端
│   ├── main.jsx                     # 入口
│   ├── App.jsx                      # 根组件 (端口屏障 / 路由 / 初始化)
│   ├── api/
│   │   ├── index.js
│   │   └── request.js               # 动态 baseUrl + Token 注入 + 插件/星标 API
│   ├── assets/
│   │   └── tailwind.css             # 全局样式 + custom-scrollbar + 动画
│   ├── components/
│   │   ├── chat/                    # ChatHeader (灵动岛) / ChatInput / MessageList
│   │   ├── manage/                  # EditorPanel / Sidebar / SchemaRenderer
│   │   └── modals/                  # Health / ModelConfig / Reset / Wizard / MusicSettings
│   ├── stores/
│   │   ├── useAppStore.js           # baseUrl / portReady / initServerPort
│   │   ├── useAudioStore.js         # 音乐播放器 Audio 单例 / 播放控制
│   │   ├── useChatStore.js          # 消息 / 轮询
│   │   └── useConfigStore.js        # 模型 / 主动消息
│   └── views/
│       ├── ChatView.jsx             # / (挂载时自动重载历史)
│       └── ManageView.jsx           # /manage (档案室 + 插件中心)
│
├── src-tauri/                       # Tauri v2 桌面壳
│   ├── tauri.conf.json              # 打包流水线 + NSIS 配置
│   ├── capabilities/default.json    # 权限声明（v2 capabilities 体系）
│   ├── installer.nsh                # NSIS 自定义钩子（kill 进程 / 卸载数据清理）
│   ├── icons/                       # 5 尺寸应用图标
│   └── src/main.rs                  # 动态端口 + IPC + Sidecar + 托盘 + 全局快捷键
│
├── scripts/
│   ├── build_engine.py              # PyInstaller 打包 (已含全部新模块)
│   └── generate_icons.py
│
├── Data/                            # 运行时数据（开发模式，生产模式在 %APPDATA%）
│   ├── config/
│   ├── memory_core/
│   ├── memory_archive/
│   ├── plugins/                     # 插件目录（首次启动自动创建）
│   └── ...
│
└── tests/                           # 沙盒隔离，零污染
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
python -m pytest tests/ -v   # 88 个测试，沙盒隔离，零污染
```

### 测试覆盖

| 模块 | 测试数 | 覆盖内容 |
|---|---|---|
| API 端点 | 39 | 聊天/轮询/配置读写/头像/日志/音乐(7)/记忆星标(4)/插件(7)/Webhook(1) |
| 核心引擎 | 49 | 艾宾浩斯衰减(3)/星标冻结(3)/JSON提取(5)/分词(3)/状态机(4)/安全(4)/文件锁(4)/RAG(3)/断路器(3)/记忆摘要(3)/插件管理器(4)/Tool Calling双协议(4)/主动熔断(3) |

## 数据目录

| 模式 | 位置 |
|---|---|
| 开发 (`python main.py`) | 项目根 `Data/` |
| 生产 (安装的 exe) | `%APPDATA%\LangAgentV3\Data\` |
| APPDATA 不可用 | exe 同级目录 |

首次启动自动创建全部子目录（含 `plugins/`、`music/`）。`Data/config/config.json` 保存模型 API 配置，其他目录为运行时数据（记忆、画像、日志、音乐等）。

## API 接口

| 端点 | 方法 | 说明 |
|---|---|---|
| `/api/chat` | POST | 发送消息 |
| `/api/poll?count=N` | GET | 轮询新消息 |
| `/api/read/{folder}/{file}` | GET | 读取数据文件 |
| `/api/save` | POST | 写入数据文件 |
| `/api/reset` | POST | 系统重置 |
| `/api/health` | GET | 健康检查 |
| `/api/status` | GET | 连接状态 |
| `/api/version` | GET | 版本号 |
| `/api/signature` | GET | 每日个性签名 |
| `/api/memory/star` | POST | 记忆星标/取消 |
| `/api/plugins/list` | GET | 插件清单 |
| `/api/plugins/reload` | POST | 热重载插件 |
| `/api/plugins/toggle` | POST | 插件启停 |
| `/api/plugins/settings/{id}` | GET/POST | 插件配置读写 |
| `/api/plugins/status/{id}` | GET | 插件运行状态 |
| `/api/plugins/static/{id}/{path}` | GET | 插件静态资源 |
| `/api/v1/chat/sync_invoke` | POST | 外部同步对话 |

## 系统重置

档案室 → 功能设置 → 系统诊断下方可找到重置入口。需输入「确认重置」后执行，将清除所有配置、记忆、归档、头像，恢复为首次启动状态。数据目录本身不会被删除（下次启动自动重建空文件）。
