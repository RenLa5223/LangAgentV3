# -*- coding: utf-8 -*-
"""
全局常量池 —— 单一事实来源
所有数据文件名、阈值参数、魔法数字均在此统一定义。
修改此处即可全局生效，避免硬编码散落。
"""

# ============================================================================
# 数据文件名
# ============================================================================
CHAT_HISTORY_FILE = "chat_history.json"
MEMORY_SUMMARY_FILE = "memory_summary.json"
CONFIG_FILE = "config.json"
DAILY_SIGNATURE_FILE = "daily_signature.json"
USER_PORTRAIT_FILE = "user_portrait.txt"
ARCHIVE_DB_FILE = "archive_db.json"
INVERTED_INDEX_FILE = "inverted_index.json"
AGENT_PROFILE_FILE = "agent_profile.txt"
USER_PROFILE_FILE = "user_profile.txt"
SERVER_SECRET_FILE = ".server_secret"
AVATAR_FILE = "avatar.png"

# ============================================================================
# 记忆引擎阈值
# ============================================================================
CHAT_SUMMARY_TRIGGER = 22       # 触发记忆总结的对话轮数阈值
CHAT_SUMMARY_SLICE = 20         # 每次总结取前 N 条消息
USER_PORTRAIT_CONTEXT_CHARS = 800   # 注入 LLM 的用户画像上下文长度（取末尾）
MEMORY_DECAY_EVICT = 0.3            # 记忆衰减分数低于此值则淘汰
MEMORY_REINFORCE_MIN_LEN = 3        # 记忆强化关键词最小长度

# ============================================================================
# 时间参数（秒）
# ============================================================================
MODEL_TIMEOUT_DEFAULT = 120         # LLM 调用默认超时
MEMORY_DECAY_INTERVAL = 1800        # 记忆衰减清理间隔
PROACTIVE_CHECK_INTERVAL = 60       # 主动消息检查间隔
DEAD_LETTER_RETRY_INTERVAL = 120    # 死信队列重试间隔
DEAD_LETTER_MAX_RETRIES = 5         # 死信最大重试次数
CIRCUIT_BREAKER_COOLDOWN = 60       # 熔断冷却秒数
CIRCUIT_BREAKER_TRIP_COUNT = 3      # 连续失败触发熔断次数
LLM_RETRY_ATTEMPTS = 2              # LLM 调用重试次数
LLM_RETRY_DELAY = 1                 # LLM 重试间隔秒数
RESET_TOKEN_WINDOW = 300            # 重置令牌有效窗口（5分钟）
RAG_SHUTDOWN_TIMEOUT = 10.0         # RAG 关闭排空超时
MODEL_PROBE_TIMEOUT = 5             # 模型探测 HTTP 超时

# ============================================================================
# API 格式标识
# ============================================================================
API_FORMAT_OPENAI = "openai"
API_FORMAT_ANTHROPIC = "anthropic"

# ============================================================================
# RAG / BM25 参数
# ============================================================================
BM25_K1 = 1.5
BM25_B = 0.75
BM25_IDF_FLOOR = 0.01
RAG_SEARCH_TOP_K = 2
RAG_SEARCH_THRESHOLD = 1.5
RAG_CONTEXT_TRUNCATE = 400      # 每条 RAG 结果截断字符数

# ============================================================================
# 其他
# ============================================================================
MAX_AVATAR_SIZE = 5 * 1024 * 1024   # 头像上传最大 5MB
ANTHROPIC_MAX_TOKENS = 4096         # Anthropic API max_tokens
LOG_STREAM_TAIL = 20000             # 日志流末尾字符数
EMPTY_PROFILE_THRESHOLD = 20        # 档案字数低于此值触发 fallback 提示
EMPTY_VALUE_MARKERS = ("无", "none", "null", "")   # LLM 返回的空值标记
