import json
import os
import time
import unittest
from unittest.mock import MagicMock, patch

import serve


class DataRefreshTests(unittest.TestCase):
    def setUp(self):
        self.calendar_cache = dict(serve.calendar_cache)
        self.tasks_cache = dict(serve.tasks_cache)

    def tearDown(self):
        serve.calendar_cache.clear()
        serve.calendar_cache.update(self.calendar_cache)
        serve.tasks_cache.clear()
        serve.tasks_cache.update(self.tasks_cache)

    def test_refresh_intervals_are_fifteen_minutes(self):
        self.assertEqual(serve.CALENDAR_CACHE_SECONDS, 900)
        self.assertEqual(serve.TASKS_CACHE_SECONDS, 900)

    def test_refresh_minutes_are_bounded(self):
        with patch.dict(os.environ, {'PANEL_REFRESH_MINUTES': '30'}):
            self.assertEqual(serve.refresh_minutes(), 30)
        with patch.dict(os.environ, {'PANEL_REFRESH_MINUTES': '0'}):
            self.assertEqual(serve.refresh_minutes(), 1)
        with patch.dict(os.environ, {'PANEL_REFRESH_MINUTES': '9999'}):
            self.assertEqual(serve.refresh_minutes(), 1440)
        with patch.dict(os.environ, {'PANEL_REFRESH_MINUTES': 'invalid'}):
            self.assertEqual(serve.refresh_minutes(), 15)

    @patch.object(serve, 'urlopen')
    def test_weather_proxy_returns_only_widget_fields(self, urlopen):
        response = MagicMock()
        response.read.return_value = json.dumps({
            'current': {
                'temperature_2m': 26.4,
                'weather_code': 1,
                'uv_index': 3.2,
                'unexpected': 'discarded',
            },
            'daily': {
                'temperature_2m_max': [31.0, 32.0],
                'temperature_2m_min': [24.0, 25.0],
                'unexpected': ['discarded'],
            },
            'unexpected': 'discarded',
        }).encode('utf-8')
        urlopen.return_value.__enter__.return_value = response

        self.assertEqual(serve.get_weather(), {
            'current': {
                'temperature_2m': 26.4,
                'weather_code': 1,
                'uv_index': 3.2,
            },
            'daily': {
                'temperature_2m_max': [31.0],
                'temperature_2m_min': [24.0],
            },
        })
        urlopen.assert_called_once_with(serve.WEATHER_URL, timeout=10)

    @patch.object(serve, 'mcp_configured', return_value=True)
    @patch.object(serve, 'fetch_calendar', return_value=[{'title': 'Fresh'}])
    def test_forced_calendar_refresh_bypasses_valid_cache(self, fetch_calendar, _configured):
        serve.calendar_cache.update({
            'payload': {'events': [{'title': 'Cached'}]},
            'expires_at': time.monotonic() + 900,
            'fails': 0,
        })

        self.assertEqual(serve.get_calendar()['events'][0]['title'], 'Cached')
        fetch_calendar.assert_not_called()
        self.assertEqual(serve.get_calendar(force=True)['events'][0]['title'], 'Fresh')
        fetch_calendar.assert_called_once_with()

    @patch.object(serve, 'mcp_configured', return_value=True)
    @patch.object(serve, 'fetch_tasks', return_value=[{'list_title': 'Fresh'}])
    def test_forced_tasks_refresh_bypasses_valid_cache(self, fetch_tasks, _configured):
        serve.tasks_cache.update({
            'payload': {'folders': [{'list_title': 'Cached'}]},
            'expires_at': time.monotonic() + 900,
            'fails': 0,
        })

        self.assertEqual(serve.get_tasks()['folders'][0]['list_title'], 'Cached')
        fetch_tasks.assert_not_called()
        self.assertEqual(serve.get_tasks(force=True)['folders'][0]['list_title'], 'Fresh')
        fetch_tasks.assert_called_once_with()


if __name__ == '__main__':
    unittest.main()
