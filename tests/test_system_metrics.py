import ctypes
import unittest

from macos_sensors import _KeyData, _key_id
from serve import parse_macos_vm_stat


class MacOSMemoryTests(unittest.TestCase):
    def test_parses_vm_stat_using_macos_available_memory_semantics(self):
        output = """Mach Virtual Memory Statistics: (page size of 16384 bytes)
Pages free: 100.
Pages active: 300.
Pages inactive: 200.
Pages speculative: 20.
Pages wired down: 100.
"""
        total = 1000 * 16384

        self.assertEqual(parse_macos_vm_stat(output, total), {
            'value': 68.0,
            'used_bytes': 400 * 16384,
            'total_bytes': total,
        })

    def test_rejects_incomplete_vm_stat_output(self):
        self.assertIsNone(parse_macos_vm_stat('page size of 16384 bytes', 16384))


class AppleSMCTests(unittest.TestCase):
    def test_smc_request_layout_matches_iokit_protocol(self):
        self.assertEqual(ctypes.sizeof(_KeyData), 80)

    def test_four_character_key_encoding(self):
        self.assertEqual(_key_id('#KEY'), 0x234B4559)


if __name__ == '__main__':
    unittest.main()
