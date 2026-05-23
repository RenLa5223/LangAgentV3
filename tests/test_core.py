# -*- coding: utf-8 -*-
import unittest
import sys
import os
import asyncio
import tempfile

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
sys.path.insert(0, PROJECT_ROOT)

from app.core.memory_engine import extract_clean_json
from app.core.config import get_decay_score, _strip_think, AppState
from app.core.rag_engine import _tokenize_tf
from app.core.security import generate_session_token, verify_session_token, init_session_token
from app.utils.fs_lock import lock_registry


class TestCoreEngines(unittest.TestCase):

    # ========== 记忆衰减 ==========
    def test_decay_old_item(self):
        item = {"importance": 8, "time": "2020-01-01 12:00:00"}
        score = get_decay_score(item)
        self.assertLess(score, 8)
        self.assertGreaterEqual(score, 0.0)

    def test_decay_recent_wins(self):
        now = __import__('time').strftime('%Y-%m-%d %H:%M:%S')
        item_new = {"importance": 5, "time": now}
        item_old = {"importance": 5, "time": "2020-01-01 12:00:00"}
        self.assertGreater(get_decay_score(item_new), get_decay_score(item_old))

    def test_decay_importance_matters(self):
        high = {"importance": 10, "time": "2020-01-01 12:00:00"}
        low = {"importance": 1, "time": "2020-01-01 12:00:00"}
        self.assertGreaterEqual(get_decay_score(high), get_decay_score(low))

    # ========== JSON 提取 ==========
    def test_json_markdown_block(self):
        text = '```json\n{"content": "hello", "importance": 5}\n```'
        result = extract_clean_json(text)
        self.assertEqual(result.get("content"), "hello")
        self.assertEqual(result.get("importance"), 5)

    def test_json_inline_with_prefix(self):
        text = '前缀文本 {"content": "test", "importance": 3} 后缀文本'
        result = extract_clean_json(text)
        self.assertEqual(result.get("content"), "test")

    def test_json_nested_braces(self):
        text = '{"outer": {"inner": "value"}} trailing'
        result = extract_clean_json(text)
        self.assertEqual(result.get("outer"), {"inner": "value"})

    def test_json_empty_input(self):
        self.assertEqual(extract_clean_json(""), {})
        self.assertEqual(extract_clean_json("这里没有任何 json 对象"), {})

    def test_json_unbalanced_braces(self):
        self.assertEqual(extract_clean_json("{broken"), {})

    # ========== 文本处理 ==========
    def test_strip_think_tags(self):
        text = "<think>reasoning here</think>hello world"
        result = _strip_think(text)
        self.assertIn("hello", result)
        self.assertNotIn("think", result)

    def test_strip_think_empty_input(self):
        self.assertEqual(_strip_think(""), "")
        self.assertEqual(_strip_think(None), "")

    # ========== Bi-gram 分词 ==========
    def test_bigram_tokenize(self):
        tokens = _tokenize_tf('你好世界')
        self.assertIn('你好', tokens)
        self.assertIn('世界', tokens)
        self.assertIn('你', tokens)
        self.assertIn('好', tokens)

    def test_bigram_empty(self):
        self.assertEqual(_tokenize_tf(''), {})

    def test_bigram_english(self):
        tokens = _tokenize_tf('hello')
        self.assertIn('he', tokens)
        self.assertIn('el', tokens)


class TestAppState(unittest.IsolatedAsyncioTestCase):

    async def test_conn_status_get_set(self):
        state = AppState()
        self.assertEqual(await state.conn_status, "connecting")
        await state.set_conn_status("online")
        self.assertEqual(await state.conn_status, "online")

    async def test_consecutive_failures(self):
        state = AppState()
        self.assertEqual(await state.consecutive_failures, 0)
        self.assertEqual(await state.inc_failures(), 1)
        self.assertEqual(await state.inc_failures(), 2)
        await state.reset_failures()
        self.assertEqual(await state.consecutive_failures, 0)

    async def test_api_cooldown(self):
        state = AppState()
        self.assertLess(await state.api_cooldown_until, 1.0)
        await state.set_api_cooldown(999999.0)
        self.assertEqual(await state.api_cooldown_until, 999999.0)

    async def test_interaction_time_update(self):
        state = AppState()
        before = await state.last_interaction_time
        cfg = {"proactive_min": 60, "proactive_max": 120}
        await state.update_interaction_time(cfg)
        after = await state.last_interaction_time
        self.assertGreater(after, before)
        delay = await state.next_proactive_delay
        self.assertGreaterEqual(delay, 60 * 60)
        self.assertLessEqual(delay, 120 * 60)


class TestSecurity(unittest.TestCase):

    def test_token_verify_success(self):
        init_session_token()
        from app.core.security import SESSION_TOKEN
        self.assertTrue(verify_session_token(SESSION_TOKEN))

    def test_token_verify_fail(self):
        init_session_token()
        self.assertFalse(verify_session_token("wrong_token"))
        self.assertFalse(verify_session_token(""))
        self.assertFalse(verify_session_token(None))

    def test_token_random_per_call(self):
        t1 = generate_session_token()
        t2 = generate_session_token()
        self.assertNotEqual(t1, t2)
        self.assertEqual(len(t1), 43)

    def test_reset_token_roundtrip(self):
        from app.core.security import get_or_create_server_secret, generate_reset_token, verify_reset_token
        async def _run():
            secret = await get_or_create_server_secret()
            token = generate_reset_token(secret)
            self.assertTrue(verify_reset_token(token, secret))
            self.assertFalse(verify_reset_token("wrong", secret))
        asyncio.run(_run())


class TestFileLock(unittest.IsolatedAsyncioTestCase):

    async def test_lock_registry_same_path(self):
        lock1 = await lock_registry.get_lock("/tmp/test.json")
        lock2 = await lock_registry.get_lock("/tmp/test.json")
        # 相同路径应该返回同一把锁
        self.assertIs(lock1, lock2)

    async def test_lock_registry_different_paths(self):
        lock1 = await lock_registry.get_lock("/tmp/a.json")
        lock2 = await lock_registry.get_lock("/tmp/b.json")
        self.assertIsNot(lock1, lock2)

    async def test_atomic_write_and_read(self):
        from app.utils.fs_lock import atomic_json_write, safe_json_read
        data = {"key": "value", "nested": {"a": 1}}
        with tempfile.NamedTemporaryFile(suffix=".json", delete=False) as f:
            tmp_path = f.name
        try:
            await atomic_json_write(tmp_path, data)
            result = await safe_json_read(tmp_path, {})
            self.assertEqual(result, data)
        finally:
            os.unlink(tmp_path)

    async def test_corrupted_file_isolation(self):
        from app.utils.fs_lock import safe_json_read
        with tempfile.NamedTemporaryFile(suffix=".json", delete=False, mode='w') as f:
            f.write('{invalid json')
            tmp_path = f.name
        try:
            result = await safe_json_read(tmp_path, {"fallback": True})
            self.assertEqual(result, {"fallback": True})
            self.assertFalse(os.path.exists(tmp_path))
        finally:
            if os.path.exists(tmp_path):
                os.unlink(tmp_path)

    async def test_text_read_write(self):
        from app.utils.fs_lock import safe_text_read, safe_text_write
        with tempfile.NamedTemporaryFile(suffix=".txt", delete=False) as f:
            tmp_path = f.name
        try:
            await safe_text_write(tmp_path, "hello world")
            result = await safe_text_read(tmp_path)
            self.assertEqual(result, "hello world")
        finally:
            os.unlink(tmp_path)


class TestRAGEngine(unittest.TestCase):

    def test_tokenize_mixed_cn_en(self):
        tokens = _tokenize_tf('AI测试')
        # tokenizer lowercases everything
        self.assertIn('a', tokens)
        self.assertIn('ai', tokens)

    def test_bm25_search_basic(self):
        import asyncio
        async def _run():
            from app.core.rag_engine import add_to_archive, search, ARCHIVE_DB_FILE, INDEX_FILE
            # 清理测试数据
            for f in [ARCHIVE_DB_FILE, INDEX_FILE]:
                if os.path.exists(f):
                    os.unlink(f)
            msgs = [{"role": "user", "content": "今天天气不错", "time": "2025-01-01 12:00:00"}]
            await add_to_archive(msgs)
            results = await search("天气", top_k=5, threshold=0)
            self.assertGreaterEqual(len(results), 1)
            self.assertIn("天气", results[0]["content"])
            for f in [ARCHIVE_DB_FILE, INDEX_FILE]:
                if os.path.exists(f):
                    os.unlink(f)
        asyncio.run(_run())

    def test_empty_search(self):
        import asyncio
        async def _run():
            from app.core.rag_engine import search
            results = await search("", top_k=5, threshold=0)
            self.assertEqual(results, [])
        asyncio.run(_run())


class TestLLMCircuitBreaker(unittest.IsolatedAsyncioTestCase):

    async def test_circuit_breaker_cooling(self):
        import time
        from unittest.mock import patch
        from app.core.llm_engine import call_llm_with_circuit_breaker
        from app.core.config import AppState
        from app.utils.constants import _MODEL_ERR
        s = AppState()
        await s.set_api_cooldown(time.time() + 999)
        with patch('app.core.llm_engine.state', s):
            result = await call_llm_with_circuit_breaker({}, [], use_fallback=True)
            self.assertIn(_MODEL_ERR, result)
            self.assertIn('断路保护', result)

    async def test_circuit_breaker_fallback_off(self):
        import time
        from unittest.mock import patch
        from app.core.llm_engine import call_llm_with_circuit_breaker
        from app.core.config import AppState
        s = AppState()
        await s.set_api_cooldown(time.time() + 999)
        with patch('app.core.llm_engine.state', s):
            result = await call_llm_with_circuit_breaker({}, [], use_fallback=False)
            self.assertIsNone(result)

    async def test_triple_failure_triggers_cooldown(self):
        from unittest.mock import patch
        from app.core.llm_engine import call_llm_with_circuit_breaker, _MODEL_ERR
        from app.core.config import AppState
        import time
        s = AppState()
        with patch('app.core.llm_engine.state', s), \
             patch('app.core.llm_engine._sync_llm_call') as mock_sync:
            mock_sync.return_value = f"{_MODEL_ERR}|test error"
            # 连续 3 次失败
            for _ in range(3):
                r = await call_llm_with_circuit_breaker({}, [], use_fallback=True)
                self.assertIn(_MODEL_ERR, r)
            # 第 4 次应进入冷却期
            cooldown = await s.api_cooldown_until
            self.assertGreater(cooldown, time.time())


class TestMemoryEngine(unittest.IsolatedAsyncioTestCase):

    async def test_auto_summarize_writes_memory(self):
        import tempfile
        from unittest.mock import patch
        from app.core.memory_engine import auto_summarize_memory, MEM_DIR

        cfg = {"ai_name": "测试", "user_name": "用户"}
        history = [
            {"role": "user", "content": "今天工作好累", "time": "2025-06-01 12:00:00"},
            {"role": "agent", "content": "辛苦了，注意休息", "time": "2025-06-01 12:01:00"},
        ]
        mock_reply = '{"content": "他今天跟我说工作很累", "importance": 4, "new_user_profile": "近期工作压力大"}'

        with tempfile.TemporaryDirectory() as tmp_data:
            # 重定向记忆文件到临时目录
            mem_dir = tmp_data
            summary_file = os.path.join(mem_dir, "memory_summary.json")
            with patch.object(
                __import__('app.core.memory_engine', fromlist=['MEM_DIR']),
                'MEM_DIR', mem_dir
            ), patch(
                'app.core.memory_engine.INNER_THOUGHTS_DIR', tmp_data
            ), patch(
                'app.core.memory_engine.call_llm_with_circuit_breaker'
            ) as mock_llm:
                mock_llm.return_value = mock_reply
                result = await auto_summarize_memory(cfg, history)
                self.assertTrue(result)
                # 验证长期记忆已写入
                self.assertTrue(os.path.exists(summary_file))
                import json
                data = json.load(open(summary_file, 'r', encoding='utf-8'))
                items = data.get('items', [])
                self.assertGreaterEqual(len(items), 1)
                self.assertIn('工作', items[-1]['content'])

    async def test_auto_summarize_retry_on_failure(self):
        import tempfile
        from unittest.mock import patch
        from app.core.memory_engine import auto_summarize_memory, MEMORY_RETRY_DIR

        cfg = {"ai_name": "测试", "user_name": "用户"}
        history = [{"role": "user", "content": "hi", "time": "2025-06-01 12:00:00"}]

        with tempfile.TemporaryDirectory() as tmp_data:
            with patch.object(
                __import__('app.core.memory_engine', fromlist=['MEM_DIR']),
                'MEM_DIR', tmp_data
            ), patch('app.core.memory_engine.INNER_THOUGHTS_DIR', tmp_data), \
              patch('app.core.memory_engine.MEMORY_RETRY_DIR', tmp_data), \
              patch('app.core.memory_engine.call_llm_with_circuit_breaker') as mock_llm:
                mock_llm.return_value = None
                result = await auto_summarize_memory(cfg, history)
                self.assertFalse(result)
                # 死信队列应有重试文件
                retry_files = [f for f in os.listdir(tmp_data) if f.endswith('.json')]
                self.assertGreaterEqual(len(retry_files), 1)

    async def test_auto_summarize_appends_inner_thoughts(self):
        import tempfile
        from unittest.mock import patch
        from app.core.memory_engine import auto_summarize_memory

        cfg = {"ai_name": "测试", "user_name": "用户"}
        history = [
            {"role": "user", "content": "我喜欢喝咖啡", "time": "2025-06-01 12:00:00"},
            {"role": "agent", "content": "咖啡确实提神", "time": "2025-06-01 12:01:00"},
        ]
        mock_reply = ('{"content": "他告诉我喜欢喝咖啡", "importance": 3, '
                      '"new_user_profile": "饮品偏好：咖啡"}')

        with tempfile.TemporaryDirectory() as tmp_data:
            inner_path = os.path.join(tmp_data, "inner_thoughts.txt")
            with patch.object(
                __import__('app.core.memory_engine', fromlist=['MEM_DIR']),
                'MEM_DIR', tmp_data
            ), patch('app.core.memory_engine.INNER_THOUGHTS_DIR', tmp_data), \
              patch('app.core.memory_engine.call_llm_with_circuit_breaker') as mock_llm:
                mock_llm.return_value = mock_reply
                await auto_summarize_memory(cfg, history)
                self.assertTrue(os.path.exists(inner_path))
                content = open(inner_path, 'r', encoding='utf-8').read()
                self.assertIn('咖啡', content)


if __name__ == '__main__':
    unittest.main()
