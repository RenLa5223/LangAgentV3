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
        self.assertEqual(resp.json()['version'], '1.0.0')

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
        resp = client.post('/api/save', json={
            'folder': 'config', 'filename': 'config.json',
            'content': '{"test_field": true}'
        })
        self.assertEqual(resp.status_code, 200)

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

    def test_chat_without_message(self):
        resp = client.post('/api/chat', json={"message": "", "image": None})
        self.assertIn(resp.status_code, [200, 500])

    def test_signature_no_config(self):
        resp = client.get('/api/signature')
        self.assertIn(resp.status_code, [200, 400])


class TestStaticAssets(unittest.TestCase):

    def test_css_themes(self):
        resp = client.get('/static/css/themes.css')
        self.assertEqual(resp.status_code, 200)

    def test_css_style(self):
        resp = client.get('/static/css/style.css')
        self.assertEqual(resp.status_code, 200)

    def test_js_app(self):
        resp = client.get('/static/js/app.js')
        self.assertEqual(resp.status_code, 200)

    def test_js_ui(self):
        resp = client.get('/static/js/ui.js')
        self.assertEqual(resp.status_code, 200)

    def test_js_state(self):
        resp = client.get('/static/js/state.js')
        self.assertEqual(resp.status_code, 200)

    def test_js_api(self):
        resp = client.get('/static/js/api.js')
        self.assertEqual(resp.status_code, 200)

    def test_static_404(self):
        resp = client.get('/static/js/nonexistent.js')
        self.assertEqual(resp.status_code, 404)


class TestAvatarEndpoints(unittest.TestCase):

    def test_avatar_no_upload(self):
        resp = client.get('/api/avatar/agent')
        self.assertEqual(resp.status_code, 404)

    def test_avatar_invalid_role(self):
        resp = client.get('/api/avatar/admin')
        self.assertEqual(resp.status_code, 400)


class TestLogsEndpoints(unittest.TestCase):

    def test_logs_stream(self):
        resp = client.get('/api/logs/stream')
        self.assertEqual(resp.status_code, 200)

    def test_logs_open_folder(self):
        resp = client.get('/api/logs/open_folder')
        self.assertIn(resp.status_code, [200, 500])


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


if __name__ == '__main__':
    unittest.main()
