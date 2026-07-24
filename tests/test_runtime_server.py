import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import serve


class RuntimeServerTests(unittest.TestCase):
    def test_web_root_requires_an_absolute_panel_directory(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'index.html').write_text('<!doctype html>', encoding='utf-8')
            self.assertEqual(serve.resolve_web_root(str(root)), root.resolve())
            with self.assertRaises(ValueError):
                serve.resolve_web_root('relative')

    def test_runtime_health_reports_the_managed_identity(self):
        with patch.dict(
            os.environ,
            {'PANEL_RUNTIME_REVISION': '7', 'PANEL_RUNTIME_SLOT': 'b'},
            clear=False,
        ):
            self.assertEqual(
                serve.runtime_identity(),
                {'ok': True, 'runtimeRevision': 7, 'runtimeSlot': 'b'},
            )

    def test_runtime_health_rejects_an_invalid_identity(self):
        with patch.dict(
            os.environ,
            {'PANEL_RUNTIME_REVISION': '-1', 'PANEL_RUNTIME_SLOT': 'unknown'},
            clear=False,
        ):
            with self.assertRaises(ValueError):
                serve.runtime_identity()


if __name__ == '__main__':
    unittest.main()
