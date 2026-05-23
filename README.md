# LangAgentV3

本地运行的 AI Agent 桌面应用，基于 Tauri + FastAPI + React 混合架构。支持 OpenAI / Anthropic 协议 API，具备长短期记忆、RAG 检索、主动消息等能力。

## 技术栈

| 层 | 技术 | 说明 |
|---|---|---|
| 桌面壳 | Tauri 1.7 (Rust) | 系统托盘常驻、单实例锁、全局快捷键 (Alt+Space) |
| 后端 | Python FastAPI + Uvicorn | 异步 API 服务，端口 5622 |
| 前端 | React 19 + Vite 8 | SPA 界面，HMR 开发模式 |
| 样式 | TailwindCSS 3 | 新拟态 (Neumorphism) 设计风格 |
| 状态管理 | Zustand 5 | 轻量响应式状态 |
| 打包 | PyInstaller + Cargo | 后端打成 exe，前端编译为静态资源，整体进 Tauri |

## 功能

- **多模型兼容** — 支持 OpenAI 和 Anthropic 两种 API 格式，可探测远端模型列表
- **长短期记忆** — 短期对话上下文 + 艾宾浩斯遗忘曲线评分 + 长期记忆摘要压缩
- **RAG 检索** — 双字倒排索引，对话内容自动归档并支持关键词检索
- **人物系统** — Agent 档案、用户画像、人物内心独白，可编辑与管理
- **主动消息** — 可配置时间窗口和间隔的自动触发消息
- **图片对话** — 支持粘贴/上传图片，通过多模态模型分析
- **语音输入** — 基于 Web Speech API 的浏览器端语音识别
- **电路熔断** — 连续失败计数 + 自动冷却，防止 API 频繁错误重试
- **安全令牌** — 运行时动态 Session Token，HMAC 常量时间比较，防时序攻击
- **系统诊断** — 6 节点全链路健康检查面板

## 文件树

```
LangAgentV3/
├── main.py                          # Uvicorn 启动器 (端口 5622 + 单实例锁)
├── index.html                       # Vite 开发入口 HTML
├── package.json                     # 前端依赖与脚本
├── requirements.txt                 # Python 依赖
├── vite.config.js                   # Vite 构建配置 (含 API 代理)
├── tailwind.config.js               # TailwindCSS 主题配置
├── postcss.config.js                # PostCSS 插件配置
│
├── app/                             # Python 后端
│   ├── __init__.py
│   ├── main.py                      # FastAPI 应用工厂 (CORS / 生命周期 / 路由)
│   ├── api/
│   │   ├── chat.py                  # 聊天与轮询接口
│   │   ├── config_endpoints.py      # 配置读写 / 模型探测 / 重置
│   │   ├── deps.py                  # 配置依赖注入 / Token 验证
│   │   ├── files.py                 # 头像上传 / 临时图片
│   │   ├── router.py                # 路由聚合
│   │   └── system.py                # 健康检查 / 状态 / 版本 / 日志
│   ├── core/
│   │   ├── config.py                # Pydantic 配置 / 路径常量 / 艾宾浩斯算法
│   │   ├── llm_engine.py            # LLM 调用引擎 + 电路熔断
│   │   ├── memory_engine.py         # 记忆引擎 (摘要压缩 / 主动消息)
│   │   ├── rag_engine.py            # 倒排索引 RAG 检索引擎
│   │   └── security.py              # Session Token 生成与验证
│   ├── services/
│   │   ├── chat_service.py          # 聊天 Pipeline 与回复分条
│   │   ├── config_service.py        # 文件读写 / 系统重置
│   │   └── rag_service.py           # RAG 索引队列消费者
│   └── utils/
│       ├── constants.py             # 常量与文件夹白名单
│       ├── fs_lock.py               # 协程安全文件锁与原子读写
│       └── logging.py               # Loguru 日志 (按日轮转 / 上下文字段)
│
├── src/                             # React 前端
│   ├── main.jsx                     # 入口：挂载 <App />
│   ├── App.jsx                      # 根组件：路由 / 全局模态 / 初始化
│   ├── api/
│   │   ├── index.js                 # API 模块导出
│   │   └── request.js              # 统一请求层 (fetch + Token 注入)
│   ├── assets/
│   │   └── tailwind.css             # TailwindCSS 入口样式
│   ├── components/
│   │   ├── ToastContainer.jsx       # Toast 通知容器
│   │   ├── chat/
│   │   │   ├── ChatHeader.jsx       # 聊天顶部栏 (签名 / 状态 / 模型配置)
│   │   │   ├── ChatInput.jsx        # 输入框 + 图片 + 语音
│   │   │   └── MessageList.jsx      # 消息列表 + 头像
│   │   ├── manage/
│   │   │   ├── EditorPanel.jsx      # 管理面板 (档案 / 内心 / 记忆 / 设置)
│   │   │   └── Sidebar.jsx          # 管理侧边栏导航
│   │   └── modals/
│   │       ├── HealthModal.jsx      # 系统健康诊断弹窗
│   │       ├── ModelConfigModal.jsx # 模型配置弹窗
│   │       ├── ResetModal.jsx       # 重置确认弹窗
│   │       └── WizardModal.jsx      # 新手引导弹窗
│   ├── stores/
│   │   ├── useAppStore.js           # 全局状态 (模态 / Toast)
│   │   ├── useChatStore.js          # 聊天状态 (消息 / 轮询 / 流式)
│   │   └── useConfigStore.js        # 配置状态 (模型 / 主动消息 / 同步)
│   └── views/
│       ├── ChatView.jsx             # 聊天页面 (/)
│       └── ManageView.jsx           # 管理页面 (/manage)
│
├── src-tauri/                       # Tauri 桌面壳
│   ├── Cargo.toml                   # Rust 依赖
│   ├── build.rs                     # 构建脚本
│   ├── tauri.conf.json              # Tauri 配置 (窗口 / Sidecar / 打包)
│   ├── icons/                       # 应用图标 (32px / 128px / 256px / ico / icns)
│   └── src/
│       └── main.rs                  # Rust 入口 (Sidecar 管理 / 托盘 / 快捷键)
│
├── scripts/
│   ├── build_engine.py              # PyInstaller 打包脚本
│   └── generate_icons.py            # 图标生成脚本 (圆角遮罩)
│
├── tests/
│   ├── test_api.py
│   └── test_core.py
│
└── Data/                            # 运行时数据目录 (自动创建)
    ├── agent_profile/               # Agent 人物档案
    ├── avatars/agent/ user/         # 头像文件
    ├── config/                      # 模型配置 config.json
    ├── inner_thoughts/              # AI 内心独白
    ├── logs/                        # 运行日志
    ├── memory_archive/              # 记忆归档 (archive_db / inverted_index)
    ├── memory_core/                 # 短期记忆 (chat_history / memory_summary)
    ├── memory_retry/                # 记忆重试队列
    ├── temp_images/                 # 临时图片缓存
    └── user_profile/                # 用户画像
```

## 启动方式

### 环境要求

- Python 3.10+
- Node.js 18+
- Rust 1.70+ (仅 Tauri 桌面模式需要)

### 安装依赖

```bash
# Python 后端
pip install -r requirements.txt

# 前端
npm install
```

### 开发模式 (浏览器)

```bash
# 终端 1：启动后端
python main.py

# 终端 2：启动前端
npm run dev
```

浏览器访问 `http://localhost:5173` 即可使用。Vite 自动代理 `/api` 到后端 `http://127.0.0.1:5622`。

### Tauri 桌面模式

```bash
cargo tauri dev          # 开发构建
cargo tauri build        # 生产打包
```

生产打包流程：
1. `npm run build` 编译前端并自动复制到 `templates/` 和 `static/`
2. `python scripts/build_engine.py` 用 PyInstaller 将后端打包为 `core-engine.exe`
3. `cargo tauri build` 将壳 + 前端 + 后端 Sidecar 打包为 `.msi` / `.exe`

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

首次启动后在聊天页面点击「模型配置」，填入 API 地址、密钥和模型名称即可开始对话。支持 OpenAI 格式 (URL 含 `/chat/completions`) 和 Anthropic 格式 (URL 含 `/messages`)。

所有运行时数据存储在 `Data/` 目录下，配置在 `Data/config/config.json`。
