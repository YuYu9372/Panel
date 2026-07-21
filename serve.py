import glob
import http.server
import json
import math
import os
import platform
import re
import shutil
import socket
import subprocess
import sys
import threading
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import unquote, urlparse
from urllib.request import Request, urlopen

try:
    import psutil
except ImportError:
    psutil = None


def load_env(path='.env'):
    try:
        for line in Path(path).read_text().splitlines():
            line = line.strip()
            if line and not line.startswith('#') and '=' in line:
                key, value = line.split('=', 1)
                os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))
    except OSError:
        pass


load_env()


def log_error(context, error):
    stamp = datetime.now().isoformat(timespec='seconds')
    print(f'[{stamp}] {context}: {error}', file=sys.stderr)


ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'
GREETING_CACHE_SECONDS = 3600
greeting_cache = {'payload': None, 'expires_at': 0.0, 'period': None}
greeting_lock = threading.Lock()

WEATHER_TEXT = {
    0: 'clear', 1: 'mostly clear', 2: 'partly cloudy', 3: 'cloudy',
    45: 'foggy', 48: 'foggy', 51: 'drizzly', 53: 'drizzly', 55: 'drizzly',
    61: 'rainy', 63: 'rainy', 65: 'pouring', 80: 'showery', 81: 'showery',
    82: 'pouring', 95: 'stormy', 96: 'stormy', 99: 'stormy',
}


def current_period(hour):
    if 5 <= hour < 12:
        return 'morning'
    if 12 <= hour < 18:
        return 'afternoon'
    if 18 <= hour < 22:
        return 'evening'
    return 'night'


def fetch_weather_brief():
    url = ('https://api.open-meteo.com/v1/forecast?latitude=25.03&longitude=121.56'
           '&current=temperature_2m,weather_code&timezone=auto')
    try:
        with urlopen(url, timeout=5) as response:
            current = json.loads(response.read())['current']
        text = WEATHER_TEXT.get(current['weather_code'])
        if text is None:
            return None
        return f"{text}, {round(current['temperature_2m'])}C"
    except Exception:
        return None


def fetch_ai_greeting(period):
    context = f"It is {datetime.now().strftime('%A, %H:%M')} ({period})."
    weather = fetch_weather_brief()
    if weather:
        context += f' The weather in Taipei is {weather}.'

    prompt = (
      f'{context} Write one short, warm line (max 8 words) for the greeting bar '
      f'of a personal dashboard. It appears right after "Good {period.capitalize()} !" '
      'so do not greet again. Mention the weather or time only if it feels natural. '
      'Plain text only: no quotes, no emoji.'
    )

    request = Request(
        ANTHROPIC_URL,
        data=json.dumps({
            'model': os.environ.get('PANEL_AI_MODEL', 'claude-haiku-4-5'),
            'messages': [{'role': 'user', 'content': prompt}],
            'max_tokens': 60,
        }).encode('utf-8'),
        headers={
            'x-api-key': os.environ['ANTHROPIC_API_KEY'],
            'anthropic-version': '2023-06-01',
            'Content-Type': 'application/json',
        },
    )
    with urlopen(request, timeout=15) as response:
        data = json.loads(response.read())

    line = data['content'][0]['text'].strip().strip('"').strip()
    line = re.sub(r'^\s*good\s+(morning|afternoon|evening|night|day)\b[\s!,.…—-]*',
                  '', line, flags=re.I).strip()
    if line:
        line = line[0].upper() + line[1:]
    if not line or len(line) > 100:
        raise ValueError('Unusable greeting line')
    return line


def get_greeting():
    now = time.monotonic()
    period = current_period(datetime.now().hour)
    with greeting_lock:
        cached = greeting_cache['payload']
        if cached and greeting_cache['period'] == period and now < greeting_cache['expires_at']:
            return cached

        if not os.environ.get('ANTHROPIC_API_KEY'):
            return {'line': None, 'source': 'fallback'}

        try:
            payload = {'line': fetch_ai_greeting(period), 'source': 'ai'}
            ttl = GREETING_CACHE_SECONDS
        except Exception as error:
            log_error('greeting fetch failed', error)
            payload = {'line': None, 'source': 'fallback'}
            ttl = 120

        greeting_cache['payload'] = payload
        greeting_cache['expires_at'] = now + ttl
        greeting_cache['period'] = period
        return payload


CALENDAR_CACHE_SECONDS = 600
TASKS_CACHE_SECONDS = 300
CALENDAR_WINDOW_DAYS = 7
calendar_cache = {'payload': None, 'expires_at': 0.0, 'fails': 0}
tasks_cache = {'payload': None, 'expires_at': 0.0, 'fails': 0}
NEGATIVE_TTL_BASE = 120
NEGATIVE_TTL_MAX = 1800
mcp_session = {'id': None}
data_lock = threading.Lock()


def mcp_configured():
    return bool(os.environ.get('COMPOSIO_MCP_URL') and os.environ.get('COMPOSIO_MCP_TOKEN'))


def _mcp_parse(raw, content_type):
    text = raw.decode('utf-8', 'replace')
    if not text.strip():
        return None
    if 'text/event-stream' in (content_type or ''):
        message = None
        for line in text.splitlines():
            if line.startswith('data:'):
                chunk = line[5:].strip()
                if chunk and chunk != '[DONE]':
                    try:
                        message = json.loads(chunk)
                    except json.JSONDecodeError:
                        pass
        return message
    return json.loads(text)


def _mcp_rpc(payload, expect_response=True):
    headers = {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
        'Authorization': f"Bearer {os.environ['COMPOSIO_MCP_TOKEN']}",
    }
    if mcp_session['id']:
        headers['Mcp-Session-Id'] = mcp_session['id']
    request = Request(os.environ['COMPOSIO_MCP_URL'],
                      data=json.dumps(payload).encode('utf-8'), headers=headers)
    with urlopen(request, timeout=60) as response:
        session_id = response.headers.get('Mcp-Session-Id')
        if session_id:
            mcp_session['id'] = session_id
        if not expect_response:
            return None
        return _mcp_parse(response.read(), response.headers.get('Content-Type'))


def _mcp_initialize():
    _mcp_rpc({
        'jsonrpc': '2.0', 'id': 1, 'method': 'initialize',
        'params': {
            'protocolVersion': '2025-06-18',
            'capabilities': {},
            'clientInfo': {'name': 'panel', 'version': '0.4'},
        },
    })
    _mcp_rpc({'jsonrpc': '2.0', 'method': 'notifications/initialized'}, expect_response=False)


def mcp_execute(tool_slug, arguments):
    payload = {
        'jsonrpc': '2.0', 'id': 2, 'method': 'tools/call',
        'params': {
            'name': 'COMPOSIO_MULTI_EXECUTE_TOOL',
            'arguments': {
                'tools': [{'tool_slug': tool_slug, 'arguments': arguments}],
                'sync_response_to_workbench': False,
            },
        },
    }

    last_error = ValueError('MCP unavailable')
    for attempt in range(2):
        try:
            if not mcp_session['id']:
                _mcp_initialize()
            envelope = _mcp_rpc(payload)
        except HTTPError as error:
            mcp_session['id'] = None
            last_error = error
            continue

        rpc_error = (envelope or {}).get('error')
        if rpc_error:
            mcp_session['id'] = None
            last_error = ValueError(rpc_error.get('message', 'MCP error'))
            continue

        content = envelope['result']['content']
        outer = json.loads('\n'.join(b['text'] for b in content if b.get('type') == 'text'))
        result = outer['data']['results'][0]['response']
        if not result.get('successful'):
            reason = (result.get('data') or {}).get('http_error') or result.get('error') or 'unknown error'
            if isinstance(reason, str) and len(reason) > 200:
                reason = reason[:200] + '…'
            raise ValueError(f'{tool_slug} failed: {reason}')
        return result['data']

    raise last_error


def _iso_utc(moment):
    return moment.astimezone(timezone.utc).isoformat().replace('+00:00', 'Z')


def fetch_calendar():
    now = datetime.now(timezone.utc)
    data = mcp_execute('GOOGLECALENDAR_EVENTS_LIST_ALL_CALENDARS', {
        'time_min': _iso_utc(now),
        'time_max': _iso_utc(now + timedelta(days=CALENDAR_WINDOW_DAYS)),
        'single_events': True,
    })
    events = [
        {
            'title': item.get('title') or '(no title)',
            'start': item.get('start'),
            'end': item.get('end'),
            'all_day': bool(item.get('is_all_day')),
            'calendar': item.get('calendar'),
        }
        for item in (data.get('summary_view') or [])
    ]
    events.sort(key=lambda event: event['start'] or '')
    return events


def fetch_tasks():
    data = mcp_execute('GOOGLETASKS_LIST_ALL_TASKS', {})
    by_list = {}
    for task in (data.get('tasks') or []):
        if task.get('status') == 'completed' or task.get('deleted'):
            continue
        by_list.setdefault(task.get('tasklist_id'), []).append({
            'id': task.get('id'),
            'title': task.get('title') or '(untitled)',
            'due': task.get('due'),
            'list_id': task.get('tasklist_id'),
        })

    folders = []
    for task_list in (data.get('tasklists') or []):
        items = by_list.get(task_list.get('id'), [])
        if not items:
            continue
        items.sort(key=lambda task: task['due'] or '9999')
        folders.append({
            'list_id': task_list.get('id'),
            'list_title': task_list.get('title') or 'Tasks',
            'tasks': items,
        })
    return folders


def get_calendar():
    if not mcp_configured():
        return {'events': None}
    now = time.monotonic()
    with data_lock:
        cached = calendar_cache['payload']
        if cached is not None and now < calendar_cache['expires_at']:
            return cached
        try:
            payload = {'events': fetch_calendar()}
            ttl = CALENDAR_CACHE_SECONDS
            calendar_cache['fails'] = 0
        except Exception as error:
            log_error('calendar fetch failed', error)
            calendar_cache['fails'] += 1
            payload = cached if cached is not None else {'events': None}
            ttl = min(NEGATIVE_TTL_BASE * 2 ** (calendar_cache['fails'] - 1), NEGATIVE_TTL_MAX)
        calendar_cache['payload'] = payload
        calendar_cache['expires_at'] = now + ttl
        return payload


def get_tasks():
    if not mcp_configured():
        return {'folders': None}
    now = time.monotonic()
    with data_lock:
        cached = tasks_cache['payload']
        if cached is not None and now < tasks_cache['expires_at']:
            return cached
        try:
            payload = {'folders': fetch_tasks()}
            ttl = TASKS_CACHE_SECONDS
            tasks_cache['fails'] = 0
        except Exception as error:
            log_error('tasks fetch failed', error)
            tasks_cache['fails'] += 1
            payload = cached if cached is not None else {'folders': None}
            ttl = min(NEGATIVE_TTL_BASE * 2 ** (tasks_cache['fails'] - 1), NEGATIVE_TTL_MAX)
        tasks_cache['payload'] = payload
        tasks_cache['expires_at'] = now + ttl
        return payload


def complete_task(list_id, task_id):
    with data_lock:
        mcp_execute('GOOGLETASKS_PATCH_TASK', {
            'tasklist_id': list_id,
            'task_id': task_id,
            'status': 'completed',
        })
        tasks_cache['expires_at'] = 0.0


def clamp_percent(value):
    if value is None:
        return None
    return round(max(0.0, min(100.0, float(value))), 1)


def read_system_boot_time():
    if psutil:
        try:
            return float(psutil.boot_time())
        except (AttributeError, OSError, ValueError):
            pass

    if platform.system() == 'Linux':
        try:
            uptime = float(Path('/proc/uptime').read_text().split()[0])
            return time.time() - uptime
        except (IndexError, OSError, ValueError):
            pass

    if platform.system() == 'Darwin':
        executable = shutil.which('sysctl')
        if executable:
            try:
                output = subprocess.run(
                    [executable, '-n', 'kern.boottime'],
                    capture_output=True,
                    check=True,
                    text=True,
                    timeout=1.5,
                ).stdout
                match = re.search(r'sec\s*=\s*(\d+)', output)
                if match:
                    return float(match.group(1))
            except (OSError, subprocess.SubprocessError):
                pass

    return None


SYSTEM_BOOT_TIME = read_system_boot_time()


def get_system_uptime():
    if SYSTEM_BOOT_TIME is None:
        return max(0, int(time.monotonic()))
    return max(0, int(time.time() - SYSTEM_BOOT_TIME))


def read_cpu():
    if psutil:
        return clamp_percent(psutil.cpu_percent(interval=0.1))

    try:
        one_minute_load = os.getloadavg()[0]
        return clamp_percent(one_minute_load / (os.cpu_count() or 1) * 100)
    except (AttributeError, OSError):
        return None


def read_memory():
    if psutil:
        memory = psutil.virtual_memory()
        return {
            'value': clamp_percent(memory.percent),
            'used_bytes': memory.used,
            'total_bytes': memory.total,
        }

    if platform.system() == 'Linux':
        try:
            values = {}
            for line in Path('/proc/meminfo').read_text().splitlines():
                key, raw = line.split(':', 1)
                values[key] = int(raw.strip().split()[0]) * 1024
            total = values['MemTotal']
            available = values.get('MemAvailable', values.get('MemFree', 0))
            used = total - available
            return {
                'value': clamp_percent(used / total * 100),
                'used_bytes': used,
                'total_bytes': total,
            }
        except (KeyError, OSError, ValueError, ZeroDivisionError):
            pass

    return {'value': None, 'used_bytes': None, 'total_bytes': None}


def read_apple_gpu():
    executable = shutil.which('ioreg')
    if platform.system() != 'Darwin' or not executable:
        return None

    for accelerator_class in ('AGXAccelerator', 'IOAccelerator'):
        try:
            output = subprocess.run(
                [executable, '-r', '-d', '1', '-c', accelerator_class],
                capture_output=True,
                check=True,
                text=True,
                timeout=1.5,
            ).stdout
            match = re.search(r'"Device Utilization %"\s*=\s*(\d+(?:\.\d+)?)', output)
            if match:
                return clamp_percent(match.group(1))
        except (OSError, subprocess.SubprocessError):
            continue
    return None


def read_nvidia_gpu():
    executable = shutil.which('nvidia-smi')
    if not executable:
        return None, None

    try:
        output = subprocess.run(
            [
                executable,
                '--query-gpu=utilization.gpu,temperature.gpu',
                '--format=csv,noheader,nounits',
            ],
            capture_output=True,
            check=True,
            text=True,
            timeout=1.5,
        ).stdout.splitlines()[0]
        utilization, temperature = (float(part.strip()) for part in output.split(',')[:2])
        return clamp_percent(utilization), round(temperature, 1)
    except (IndexError, OSError, subprocess.SubprocessError, ValueError):
        return None, None


def read_linux_gpu():
    for path in glob.glob('/sys/class/drm/card*/device/gpu_busy_percent'):
        try:
            return clamp_percent(Path(path).read_text().strip())
        except (OSError, ValueError):
            continue
    return None


def read_gpu():
    nvidia_usage, nvidia_temperature = read_nvidia_gpu()
    if nvidia_usage is not None:
        return nvidia_usage, nvidia_temperature, 'NVIDIA GPU'

    apple_usage = read_apple_gpu()
    if apple_usage is not None:
        return apple_usage, None, 'Apple GPU'

    linux_usage = read_linux_gpu()
    if linux_usage is not None:
        return linux_usage, None, 'System GPU'

    return None, None, 'Sensor unavailable'


def read_temperature(gpu_temperature=None):
    readings = []

    if psutil and hasattr(psutil, 'sensors_temperatures'):
        try:
            for group, sensors in psutil.sensors_temperatures().items():
                for sensor in sensors:
                    if sensor.current is not None and 0 < sensor.current < 130:
                        readings.append((float(sensor.current), sensor.label or group))
        except (AttributeError, OSError):
            pass

    if not readings:
        for path in glob.glob('/sys/class/thermal/thermal_zone*/temp'):
            try:
                value = float(Path(path).read_text().strip())
                if value > 1000:
                    value /= 1000
                if 0 < value < 130:
                    readings.append((value, 'System sensor'))
            except (OSError, ValueError):
                continue

    if gpu_temperature is not None:
        readings.append((gpu_temperature, 'GPU sensor'))

    if not readings:
        return None, 'Sensor unavailable'

    temperature, source = max(readings, key=lambda reading: reading[0])
    return round(temperature, 1), source


def format_memory(used_bytes, total_bytes):
    if used_bytes is None or total_bytes is None:
        return 'Sensor unavailable'
    gib = 1024 ** 3
    return f'{used_bytes / gib:.1f} / {total_bytes / gib:.1f} GB'


def determine_status(cpu, gpu, memory, temperature):
    percentages = [value for value in (cpu, gpu, memory) if value is not None]
    if not percentages and temperature is None:
        return {'level': 'unknown', 'label': 'Unavailable'}

    if any(value >= 98 for value in percentages) or (temperature is not None and temperature >= 100):
        return {'level': 'critical', 'label': 'Critical'}

    if any(value >= 90 for value in percentages) or (temperature is not None and temperature >= 90):
        return {'level': 'danger', 'label': 'Overload'}

    if any(value >= 70 for value in percentages) or (temperature is not None and temperature >= 75):
        return {'level': 'warning', 'label': 'Elevated'}

    return {'level': 'healthy', 'label': 'Normal'}


def collect_device_stats():
    cpu = read_cpu()
    memory = read_memory()
    gpu, gpu_temperature, gpu_label = read_gpu()
    temperature, temperature_source = read_temperature(gpu_temperature)

    return {
        'hostname': socket.gethostname().split('.')[0],
        'updated_at': datetime.now(timezone.utc).isoformat(),
        'status': determine_status(cpu, gpu, memory['value'], temperature),
        'metrics': {
            'cpu': {
                'value': cpu,
                'unit': '%',
                'detail': f'{os.cpu_count() or 1} logical cores',
            },
            'gpu': {
                'value': gpu,
                'unit': '%',
                'detail': gpu_label,
            },
            'memory': {
                'value': memory['value'],
                'unit': '%',
                'detail': format_memory(memory['used_bytes'], memory['total_bytes']),
            },
            'temperature': {
                'value': temperature,
                'unit': '°C',
                'detail': temperature_source,
            },
        },
    }


NET_PROBE_HOSTS = (('1.1.1.1', 443), ('8.8.8.8', 443))
NET_CACHE_SECONDS = 2.5
net_cache = {'payload': None, 'expires_at': 0.0}
net_lock = threading.Lock()


def probe_network():
    for host, port in NET_PROBE_HOSTS:
        start = time.monotonic()
        try:
            socket.create_connection((host, port), timeout=2).close()
            return {'online': True, 'latency_ms': round((time.monotonic() - start) * 1000, 1)}
        except OSError:
            continue
    return {'online': False, 'latency_ms': None}


def get_network():
    now = time.monotonic()
    with net_lock:
        if net_cache['payload'] is not None and now < net_cache['expires_at']:
            return net_cache['payload']
        payload = probe_network()
        net_cache['payload'] = payload
        net_cache['expires_at'] = now + NET_CACHE_SECONDS
        return payload


LIVE_SECONDS = 2
WINDOW_SAMPLE_SECONDS = 30
WINDOW_MINUTES = 30
HISTORY_BLOCKS = 12
HISTORY_FILE = os.environ.get('PANEL_HISTORY_FILE') or str(Path.home() / '.panel' / 'history.json')

history_lock = threading.Lock()
history_state = {'latest': None, 'frozen': [], 'current': None}


def read_sample():
    metrics = collect_device_stats()['metrics']
    net = get_network()
    return {
        'cpu': metrics['cpu']['value'],
        'gpu': metrics['gpu']['value'],
        'ram': metrics['memory']['value'],
        'temp': metrics['temperature']['value'],
        'wifi': net.get('latency_ms'),
        'online': bool(net.get('online')),
    }


def slot_start(moment):
    minute = (moment.minute // WINDOW_MINUTES) * WINDOW_MINUTES
    return int(moment.replace(minute=minute, second=0, microsecond=0).timestamp())


def p95(values):
    clean = sorted(value for value in values if value is not None)
    if not clean:
        return None
    index = max(0, min(len(clean) - 1, math.ceil(0.95 * len(clean)) - 1))
    return clean[index]


def average(values):
    clean = [value for value in values if value is not None]
    if not clean:
        return None
    return round(sum(clean) / len(clean), 1)


def aggregate_window(window, reducer):
    samples = window['samples']
    block = {'start': window['start']}
    for key in ('cpu', 'gpu', 'ram', 'temp'):
        block[key] = reducer([sample[key] for sample in samples])
    block['wifi'] = reducer([
        sample['wifi'] for sample in samples
        if sample.get('online') and sample['wifi'] is not None
    ])
    return block


def freeze_window(window):
    return aggregate_window(window, p95)


def average_window(window):
    return aggregate_window(window, average)


def persist_history():
    # Caller holds history_lock.
    try:
        path = Path(HISTORY_FILE)
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_name(path.name + '.tmp')
        tmp.write_text(json.dumps({'frozen': history_state['frozen'], 'current': history_state['current']}))
        os.replace(tmp, path)
    except OSError:
        pass


def load_history():
    try:
        data = json.loads(Path(HISTORY_FILE).read_text())
    except (OSError, ValueError):
        return
    now_slot = slot_start(datetime.now())
    cutoff = now_slot - HISTORY_BLOCKS * WINDOW_MINUTES * 60
    frozen = [b for b in (data.get('frozen') or []) if isinstance(b, dict) and b.get('start', 0) > cutoff]
    current = data.get('current')
    if current and current.get('start') == now_slot:
        history_state['current'] = current
    elif current and current.get('start', 0) < now_slot and current.get('samples'):
        frozen.append(freeze_window(current))
    history_state['frozen'] = frozen[-(HISTORY_BLOCKS - 1):]


def sampler_loop():
    last_window_sample = 0.0
    while True:
        started = time.monotonic()
        try:
            sample = read_sample()
        except Exception:
            sample = None
        cur_slot = slot_start(datetime.now())
        with history_lock:
            if sample is not None:
                history_state['latest'] = sample
            current = history_state['current']
            if current is None:
                current = history_state['current'] = {'start': cur_slot, 'samples': []}
            elif current['start'] != cur_slot:
                if current['samples']:
                    history_state['frozen'].append(freeze_window(current))
                    history_state['frozen'] = history_state['frozen'][-(HISTORY_BLOCKS - 1):]
                current = history_state['current'] = {'start': cur_slot, 'samples': []}
                persist_history()
            if sample is not None and started - last_window_sample >= WINDOW_SAMPLE_SECONDS:
                current['samples'].append(sample)
                last_window_sample = started
                persist_history()
        time.sleep(max(0.0, LIVE_SECONDS - (time.monotonic() - started)))


def get_history():
    step = WINDOW_MINUTES * 60
    now_slot = slot_start(datetime.now())
    with history_lock:
        by_start = {b['start']: b for b in history_state['frozen']}
        current = history_state['current']
        blocks = []
        for offset in range(HISTORY_BLOCKS - 1, -1, -1):
            slot = now_slot - offset * step
            if slot == now_slot:
                blocks.append(average_window(current) if current and current['samples'] else {'start': slot})
            else:
                blocks.append(by_start.get(slot) or {'start': slot})
        return {
            'latest': history_state['latest'] or {},
            'blocks': blocks,
            'uptime_seconds': get_system_uptime(),
        }


LOCAL_HOSTS = {'localhost', '127.0.0.1', '::1'}
LOOPBACK_CLIENTS = {'127.0.0.1', '::1', '::ffff:127.0.0.1'}


class PanelHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def send_json(self, payload, status=200):
        body = json.dumps(payload).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def is_local_request(self):
        if self.client_address[0] not in LOOPBACK_CLIENTS:
            return False
        host = self.headers.get('Host', '')
        if host.startswith('['):
            hostname = host[1:host.find(']')] if ']' in host else host
        else:
            hostname = host.split(':', 1)[0]
        if hostname not in LOCAL_HOSTS:
            return False
        origin = self.headers.get('Origin')
        if origin is not None and urlparse(origin).hostname not in LOCAL_HOSTS:
            return False
        return True

    def do_GET(self):
        path = unquote(urlparse(self.path).path)

        if any(part.startswith('.') for part in path.split('/') if part):
            self.send_error(404)
            return

        if path.startswith('/api/') and not self.is_local_request():
            self.send_error(403)
            return

        if path == '/api/device':
            try:
                self.send_json(collect_device_stats())
            except Exception as error:
                self.send_json({'error': str(error)}, status=500)
            return

        if path == '/api/greeting':
            self.send_json(get_greeting())
            return

        if path == '/api/calendar':
            self.send_json(get_calendar())
            return

        if path == '/api/tasks':
            self.send_json(get_tasks())
            return

        if path == '/api/net':
            self.send_json(get_network())
            return

        if path == '/api/history':
            self.send_json(get_history())
            return

        super().do_GET()

    def do_POST(self):
        path = unquote(urlparse(self.path).path)

        if path != '/api/tasks/complete':
            self.send_error(404)
            return

        if not self.is_local_request():
            self.send_error(403)
            return

        if not self.headers.get('Content-Type', '').startswith('application/json'):
            self.send_json({'error': 'Invalid request'}, status=400)
            return

        if not mcp_configured():
            self.send_json({'error': 'Tasks are not configured'}, status=503)
            return

        try:
            length = int(self.headers.get('Content-Length') or 0)
            if not 0 < length <= 8 * 1024:
                raise ValueError('bad length')
            payload = json.loads(self.rfile.read(length))
            list_id = payload['list_id']
            task_id = payload['task_id']
            if not isinstance(list_id, str) or not isinstance(task_id, str):
                raise ValueError('bad ids')
        except Exception:
            self.send_json({'error': 'Invalid request'}, status=400)
            return

        try:
            complete_task(list_id, task_id)
            self.send_json({'ok': True})
        except Exception:
            self.send_json({'error': 'Task update failed'}, status=502)


def main():
    host = os.environ.get('PANEL_HOST', '127.0.0.1')
    port = int(os.environ.get('PANEL_PORT') or os.environ.get('PORT') or '8642')
    load_history()
    threading.Thread(target=sampler_loop, daemon=True).start()
    print(f'Panel running at http://localhost:{port}')
    http.server.ThreadingHTTPServer((host, port), PanelHandler).serve_forever()


if __name__ == '__main__':
    main()
