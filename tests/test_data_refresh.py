import time
import unittest
from unittest.mock import patch

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
