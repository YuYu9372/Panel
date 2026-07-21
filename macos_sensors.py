"""Native, unprivileged Apple Silicon temperature readings."""

import ctypes
import platform
import struct
import threading
import time


class _KeyDataVersion(ctypes.Structure):
    _fields_ = [
        ('major', ctypes.c_uint8),
        ('minor', ctypes.c_uint8),
        ('build', ctypes.c_uint8),
        ('reserved', ctypes.c_uint8),
        ('release', ctypes.c_uint16),
    ]


class _PowerLimitData(ctypes.Structure):
    _fields_ = [
        ('version', ctypes.c_uint16),
        ('length', ctypes.c_uint16),
        ('cpu_limit', ctypes.c_uint32),
        ('gpu_limit', ctypes.c_uint32),
        ('memory_limit', ctypes.c_uint32),
    ]


class _KeyInfo(ctypes.Structure):
    _fields_ = [
        ('data_size', ctypes.c_uint32),
        ('data_type', ctypes.c_uint32),
        ('attributes', ctypes.c_uint8),
    ]


class _KeyData(ctypes.Structure):
    _fields_ = [
        ('key', ctypes.c_uint32),
        ('version', _KeyDataVersion),
        ('power_limit', _PowerLimitData),
        ('key_info', _KeyInfo),
        ('result', ctypes.c_uint8),
        ('status', ctypes.c_uint8),
        ('command', ctypes.c_uint8),
        ('data', ctypes.c_uint32),
        ('bytes', ctypes.c_uint8 * 32),
    ]


def _key_id(key):
    if len(key) != 4:
        raise ValueError('SMC keys must contain four characters')
    return int.from_bytes(key.encode('ascii'), 'big')


class AppleSMCTemperatureReader:
    def __init__(self):
        if platform.system() != 'Darwin' or platform.machine() != 'arm64':
            raise OSError('Apple SMC temperature sensors require Apple Silicon')

        self._io = ctypes.CDLL('/System/Library/Frameworks/IOKit.framework/IOKit')
        self._system = ctypes.CDLL('/usr/lib/libSystem.B.dylib')
        self._configure_api()
        self._connection = self._open_connection()
        self._key_info = {}
        self._lock = threading.Lock()
        self._cpu_keys, self._gpu_keys = self._discover_temperature_keys()

        if not self._cpu_keys and not self._gpu_keys:
            self.close()
            raise OSError('No readable Apple SMC temperature sensors were found')

    def _configure_api(self):
        self._io.IOServiceMatching.argtypes = [ctypes.c_char_p]
        self._io.IOServiceMatching.restype = ctypes.c_void_p
        self._io.IOServiceGetMatchingServices.argtypes = [
            ctypes.c_uint,
            ctypes.c_void_p,
            ctypes.POINTER(ctypes.c_uint),
        ]
        self._io.IOServiceGetMatchingServices.restype = ctypes.c_int
        self._io.IOIteratorNext.argtypes = [ctypes.c_uint]
        self._io.IOIteratorNext.restype = ctypes.c_uint
        self._io.IORegistryEntryGetName.argtypes = [ctypes.c_uint, ctypes.c_char_p]
        self._io.IORegistryEntryGetName.restype = ctypes.c_int
        self._io.IOServiceOpen.argtypes = [
            ctypes.c_uint,
            ctypes.c_uint,
            ctypes.c_uint,
            ctypes.POINTER(ctypes.c_uint),
        ]
        self._io.IOServiceOpen.restype = ctypes.c_int
        self._io.IOConnectCallStructMethod.argtypes = [
            ctypes.c_uint,
            ctypes.c_uint,
            ctypes.c_void_p,
            ctypes.c_size_t,
            ctypes.c_void_p,
            ctypes.POINTER(ctypes.c_size_t),
        ]
        self._io.IOConnectCallStructMethod.restype = ctypes.c_int
        self._io.IOServiceClose.argtypes = [ctypes.c_uint]
        self._io.IOObjectRelease.argtypes = [ctypes.c_uint]

    def _open_connection(self):
        matching = self._io.IOServiceMatching(b'AppleSMC')
        if not matching:
            raise OSError('AppleSMC service is unavailable')

        iterator = ctypes.c_uint()
        result = self._io.IOServiceGetMatchingServices(0, matching, ctypes.byref(iterator))
        if result != 0:
            raise OSError(f'Could not enumerate AppleSMC services: {result}')

        connection = ctypes.c_uint()
        task = ctypes.c_uint.in_dll(self._system, 'mach_task_self_').value
        try:
            while True:
                device = self._io.IOIteratorNext(iterator.value)
                if not device:
                    break
                try:
                    name = ctypes.create_string_buffer(128)
                    if self._io.IORegistryEntryGetName(device, name) != 0:
                        continue
                    if name.value != b'AppleSMCKeysEndpoint':
                        continue
                    result = self._io.IOServiceOpen(device, task, 0, ctypes.byref(connection))
                    if result != 0:
                        raise OSError(f'Could not open AppleSMC: {result}')
                    break
                finally:
                    self._io.IOObjectRelease(device)
        finally:
            self._io.IOObjectRelease(iterator.value)

        if not connection.value:
            raise OSError('AppleSMC keys endpoint is unavailable')
        return connection.value

    def _call(self, request):
        response = _KeyData()
        response_size = ctypes.c_size_t(ctypes.sizeof(response))
        result = self._io.IOConnectCallStructMethod(
            self._connection,
            2,
            ctypes.byref(request),
            ctypes.sizeof(request),
            ctypes.byref(response),
            ctypes.byref(response_size),
        )
        if result != 0 or response.result != 0:
            raise OSError(f'AppleSMC read failed: {result or response.result}')
        return response

    def _read_key_info(self, key):
        identifier = _key_id(key)
        if identifier not in self._key_info:
            request = _KeyData()
            request.key = identifier
            request.command = 9
            self._key_info[identifier] = self._call(request).key_info
        return self._key_info[identifier]

    def _read_value(self, key):
        info = self._read_key_info(key)
        request = _KeyData()
        request.key = _key_id(key)
        request.command = 5
        request.key_info = info
        response = self._call(request)
        data_type = info.data_type.to_bytes(4, 'big').decode('ascii', errors='replace')
        raw = bytes(response.bytes[:info.data_size])
        return data_type, raw

    def _key_count(self):
        data_type, raw = self._read_value('#KEY')
        if data_type != 'ui32' or len(raw) < 4:
            raise OSError('AppleSMC returned an invalid key count')
        return int.from_bytes(raw[:4], 'big')

    def _key_at(self, index):
        request = _KeyData()
        request.command = 8
        request.data = index
        response = self._call(request)
        return response.key.to_bytes(4, 'big').decode('ascii')

    def _read_celsius(self, key):
        data_type, raw = self._read_value(key)
        if data_type != 'flt ' or len(raw) != 4:
            raise OSError(f'AppleSMC key {key} is not a temperature value')
        value = struct.unpack('<f', raw)[0]
        if not 0 < value < 130:
            raise OSError(f'AppleSMC key {key} returned an invalid temperature')
        return value

    def _discover_temperature_keys(self):
        cpu_keys = []
        gpu_keys = []
        for index in range(self._key_count()):
            try:
                key = self._key_at(index)
            except (OSError, UnicodeDecodeError):
                continue
            is_cpu = key.startswith(('Tp', 'Te', 'Ts'))
            is_gpu = key.startswith('Tg')
            if not is_cpu and not is_gpu:
                continue
            try:
                self._read_celsius(key)
            except OSError:
                continue
            if is_cpu:
                cpu_keys.append(key)
            else:
                gpu_keys.append(key)
        return tuple(cpu_keys), tuple(gpu_keys)

    def read(self):
        with self._lock:
            cpu_values = self._read_group(self._cpu_keys)
            if cpu_values:
                return round(sum(cpu_values) / len(cpu_values), 1), 'Apple CPU average'
            gpu_values = self._read_group(self._gpu_keys)
            if gpu_values:
                return round(sum(gpu_values) / len(gpu_values), 1), 'Apple GPU average'
        raise OSError('Apple SMC temperature sensors stopped responding')

    def _read_group(self, keys):
        values = []
        for key in keys:
            try:
                values.append(self._read_celsius(key))
            except OSError:
                continue
        return values

    def close(self):
        connection = getattr(self, '_connection', 0)
        if connection:
            self._io.IOServiceClose(connection)
            self._connection = 0

    def __del__(self):
        try:
            self.close()
        except Exception:
            pass


_reader = None
_retry_at = 0.0
_reader_lock = threading.Lock()


def read_apple_temperature():
    global _reader, _retry_at

    if platform.system() != 'Darwin' or platform.machine() != 'arm64':
        return None

    with _reader_lock:
        now = time.monotonic()
        if _reader is None and now < _retry_at:
            return None
        if _reader is None:
            try:
                _reader = AppleSMCTemperatureReader()
            except (OSError, ValueError):
                _retry_at = now + 60
                return None
        try:
            return _reader.read()
        except OSError:
            _reader.close()
            _reader = None
            _retry_at = now + 60
            return None
