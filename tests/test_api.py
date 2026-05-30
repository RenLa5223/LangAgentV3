# -*- coding: utf-8 -*-
"""API 端点集成测试"""
import unittest
import sys
import os
from unittest.mock import patch, AsyncMock

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


class TestRootEndpoints(unittest.TestCase):

    def test_root_html(self):
        resp = client.get('/')
        self.assertEqual(resp.status_code, 200)
        self.assertIn('LangAgent', resp.text)

    def test_version(self):
        resp = client.get('/api/version')
        self.assertEqual(resp.json()['version'], '1.0.5')

    def test_health(self):
        resp = client.get('/api/health')
        data = resp.json()
        self.assertEqual(data['core_server'], 'online')

    def test_status(self):
        resp = client.get('/api/status')
        self.assertIn('status', resp.json())


class TestDataReadWrite(unittest.TestCase):

    def test_read_config(self):
        resp = client.get('/api/read/config/config.json')
        self.assertIn(resp.status_code, [200, 404])

    def test_save_and_read(self):
        # Write to a dedicated test file to avoid polluting real config
        resp = client.post('/api/save', json={
            'folder': 'config', 'filename': '_test_config.json',
            'content': '{"test_field": true}'
        })
        self.assertEqual(resp.status_code, 200)
        # Clean up
        test_path = os.path.join(os.path.dirname(__file__), '..', 'Data', 'config', '_test_config.json')
        if os.path.exists(test_path):
            os.remove(test_path)

    def test_read_nonexistent_file(self):
        resp = client.get('/api/read/config/no_such_file.json')
        self.assertEqual(resp.status_code, 404)

    def test_read_forbidden_folder(self):
        resp = client.get('/api/read/../system32/evil.json')
        self.assertIn(resp.status_code, [403, 404])


class TestChatEndpoints(unittest.TestCase):

    def test_poll_empty(self):
        resp = client.get('/api/poll?count=0')
        data = resp.json()
        self.assertIn('new_messages', data)
        self.assertIsInstance(data['new_messages'], list)

    @patch('app.services.chat_service.call_llm_with_circuit_breaker')
    def test_chat_without_message(self, mock_llm):
        """沙盒隔离：先移走真实聊天记录，阻塞前端 poll 读到脏数据，测试后恢复"""
        history_path = os.path.join(os.path.dirname(__file__), '..', 'Data', 'memory_core', 'chat_history.json')
        backup_path = history_path + '.test_backup'
        backup_existed = False

        if os.path.exists(history_path):
            os.rename(history_path, backup_path)
            backup_existed = True

        try:
            mock_llm.return_value = '沙盒测试回复'
            resp = client.post('/api/chat', json={"message": "", "image": None})
            self.assertIn(resp.status_code, [200, 500])
        finally:
            # 清理测试产生的脏数据
            if os.path.exists(history_path):
                os.remove(history_path)
            # 恢复原有聊天记录
            if backup_existed:
                os.rename(backup_path, history_path)

    def test_signature_no_config(self):
        resp = client.get('/api/signature')
        self.assertIn(resp.status_code, [200, 400])


class TestStaticAssets(unittest.TestCase):

    def test_static_assets_exist(self):
        """V3: static assets are Vite-built, served from /static/assets/"""
        import glob as _glob
        static_dir = os.path.join(os.path.dirname(__file__), '..', 'static', 'assets')
        files = _glob.glob(os.path.join(static_dir, 'index-*.js'))
        self.assertTrue(len(files) > 0, 'No built JS assets found — run npm run build first')

    def test_static_assets_served(self):
        """Verify a built CSS file is served"""
        import glob as _glob
        static_dir = os.path.join(os.path.dirname(__file__), '..', 'static', 'assets')
        css_files = _glob.glob(os.path.join(static_dir, 'index-*.css'))
        if css_files:
            filename = os.path.basename(css_files[0])
            resp = client.get(f'/static/assets/{filename}')
            self.assertEqual(resp.status_code, 200)

    def test_static_404(self):
        resp = client.get('/static/assets/nonexistent.xyz')
        self.assertEqual(resp.status_code, 404)


class TestAvatarEndpoints(unittest.TestCase):

    def test_avatar_no_upload(self):
        resp = client.get('/api/avatar/agent')
        self.assertIn(resp.status_code, [200, 404])

    def test_avatar_invalid_role(self):
        resp = client.get('/api/avatar/admin')
        self.assertEqual(resp.status_code, 400)


class TestLogsEndpoints(unittest.TestCase):

    def test_logs_stream(self):
        resp = client.get('/api/logs/stream')
        self.assertEqual(resp.status_code, 200)

    @patch('subprocess.Popen')
    def test_logs_open_folder(self, mock_popen):
        resp = client.get('/api/logs/open_folder')
        self.assertEqual(resp.status_code, 200)


class TestModelProbe(unittest.TestCase):

    def test_get_models_empty(self):
        resp = client.post('/api/get_models', json={
            "url": "", "key": "", "model": "", "format": "openai"
        })
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn('status', data)
        self.assertEqual(data['status'], 'fallback')


class TestShowEndpoint(unittest.TestCase):

    def test_show(self):
        resp = client.get('/api/show')
        self.assertEqual(resp.status_code, 200)


class TestMusicEndpoints(unittest.TestCase):
    """【音乐播放器】API 端点测试"""

    @classmethod
    def setUpClass(cls):
        cls.music_dir = os.path.join(
            os.path.dirname(__file__), '..', 'Data', 'music'
        )
        os.makedirs(cls.music_dir, exist_ok=True)

    def setUp(self):
        for f in os.listdir(self.music_dir):
            os.remove(os.path.join(self.music_dir, f))

    def test_list_empty(self):
        """空音乐库返回空列表"""
        resp = client.get('/api/music/list')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json(), {'files': []})

    def test_list_with_files(self):
        """音乐库文件列表正确返回"""
        open(os.path.join(self.music_dir, 'test.mp3'), 'w').close()
        open(os.path.join(self.music_dir, 'demo.wav'), 'w').close()
        resp = client.get('/api/music/list')
        data = resp.json()
        self.assertEqual(len(data['files']), 2)
        names = [f['name'] for f in data['files']]
        self.assertIn('test.mp3', names)
        self.assertIn('demo.wav', names)

    def test_stream_206_range(self):
        """206 Partial Content 范围请求"""
        path = os.path.join(self.music_dir, 'song.mp3')
        with open(path, 'wb') as f:
            f.write(b'A' * 100)
        resp = client.get('/api/music/stream/song.mp3',
                          headers={'Range': 'bytes=0-49'})
        self.assertEqual(resp.status_code, 206)
        self.assertIn('Content-Range', resp.headers)
        self.assertEqual(resp.headers['Content-Range'], 'bytes 0-49/100')
        self.assertEqual(len(resp.content), 50)

    def test_stream_404(self):
        """请求不存在的音频返回 404"""
        resp = client.get('/api/music/stream/ghost.flac')
        self.assertEqual(resp.status_code, 404)

    def test_upload_and_delete(self):
        """上传后文件存在，删除后消失"""
        resp = client.post('/api/music/upload', json={
            'filename': 'up.mp3',
            'data': 'dGVzdA=='  # base64("test")
        })
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(os.path.exists(os.path.join(self.music_dir, 'up.mp3')))

        resp = client.delete('/api/music/up.mp3')
        self.assertEqual(resp.status_code, 200)
        self.assertFalse(os.path.exists(os.path.join(self.music_dir, 'up.mp3')))

    def test_upload_bad_format(self):
        """不支持的文件格式返回 400"""
        resp = client.post('/api/music/upload', json={
            'filename': 'virus.exe',
            'data': 'dGVzdA=='
        })
        self.assertEqual(resp.status_code, 400)

    def test_upload_no_data(self):
        """空数据返回 400"""
        resp = client.post('/api/music/upload', json={
            'filename': 'x.mp3',
            'data': ''
        })
        self.assertEqual(resp.status_code, 400)


class TestMemoryStar(unittest.TestCase):
    """记忆星标 API"""

    @classmethod
    def setUpClass(cls):
        cls.summary_path = os.path.join(
            os.path.dirname(__file__), '..', 'Data', 'memory_core', 'memory_summary.json'
        )
        cls.backup_path = cls.summary_path + '.star_test_backup'
        cls.backup_existed = os.path.exists(cls.summary_path)
        if cls.backup_existed:
            os.rename(cls.summary_path, cls.backup_path)

    @classmethod
    def tearDownClass(cls):
        if os.path.exists(cls.summary_path):
            os.remove(cls.summary_path)
        if cls.backup_existed:
            os.rename(cls.backup_path, cls.summary_path)

    def setUp(self):
        # 每次测试前写入干净的测试数据
        import json, time as _t
        test_data = {
            "items": [
                {"content": "测试记忆1", "importance": 8, "time": _t.strftime('%Y-%m-%d %H:%M:%S')},
                {"content": "测试记忆2", "importance": 5, "time": "2020-01-01 12:00:00"},
            ]
        }
        with open(self.summary_path, 'w', encoding='utf-8') as f:
            json.dump(test_data, f, ensure_ascii=False)

    def test_star_memory(self):
        resp = client.post('/api/memory/star', json={"item_index": 0, "action": "star"})
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertTrue(data['success'])
        self.assertTrue(data['item']['starred'])
        self.assertIn('frozen_score', data['item'])

    def test_star_out_of_bounds(self):
        resp = client.post('/api/memory/star', json={"item_index": 99, "action": "star"})
        self.assertEqual(resp.status_code, 400)

    def test_star_invalid_action(self):
        resp = client.post('/api/memory/star', json={"item_index": 0, "action": "invalid"})
        self.assertEqual(resp.status_code, 400)

    def test_unstar_restores_time(self):
        # 先星标
        resp = client.post('/api/memory/star', json={"item_index": 0, "action": "star"})
        # 再取消
        resp = client.post('/api/memory/star', json={"item_index": 0, "action": "unstar"})
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertTrue(data['success'])
        self.assertNotIn('starred', data['item'])
        self.assertNotIn('frozen_score', data['item'])


class TestPluginEndpoints(unittest.TestCase):
    """插件管理 API"""

    def test_list_plugins(self):
        resp = client.get('/api/plugins/list')
        self.assertEqual(resp.status_code, 200)
        self.assertIn('plugins', resp.json())

    def test_reload_plugins(self):
        resp = client.post('/api/plugins/reload')
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertTrue(data['success'])
        self.assertIn('plugins', data)

    def test_toggle_not_found(self):
        resp = client.post('/api/plugins/toggle', json={"plugin_id": "nonexistent", "enabled": True})
        self.assertEqual(resp.status_code, 404)

    def test_settings_not_found(self):
        resp = client.get('/api/plugins/settings/nonexistent')
        self.assertEqual(resp.status_code, 404)

    def test_status_not_found(self):
        resp = client.get('/api/plugins/status/nonexistent')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json(), {"status": {}})

    def test_static_not_found(self):
        resp = client.get('/api/plugins/static/nonexistent/index.html')
        self.assertEqual(resp.status_code, 404)

    @patch('subprocess.Popen')
    def test_open_folder(self, mock_popen):
        resp = client.get('/api/plugins/open_folder')
        self.assertEqual(resp.status_code, 200)


class TestWebhookEndpoints(unittest.TestCase):
    """外部通道 API"""

    def test_sync_invoke_no_key_required(self):
        """external_api_key 未设置时应放行"""
        resp = client.post('/api/v1/chat/sync_invoke', json={
            "user_text": "test", "image_base64": None
        })
        self.assertIn(resp.status_code, [200, 500])


if __name__ == '__main__':
    unittest.main()
