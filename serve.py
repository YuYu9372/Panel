import glob
import http.server
import json
import os
import platform
import re
import shutil
import socket
import subprocess
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
        f'{context} One short warm line (max 8 words) for a dashboard greeting bar, '
        f'after "Good {period.capitalize()}!". No repeat greeting, no quotes, no emoji.'
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
        except Exception:
            payload = {'line': None, 'source': 'fallback'}
            ttl = 120

        greeting_cache['payload'] = payload
        greeting_cache['expires_at'] = now + ttl
        greeting_cache['period'] = period
        return payload


CALENDAR_CACHE_SECONDS = 600
TASKS_CACHE_SECONDS = 300
CALENDAR_WINDOW_DAYS = 7
calendar_cache = {'payload': None, 'expires_at': 0.0}
tasks_cache = {'payload': None, 'expires_at': 0.0}
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
            raise ValueError('Tool execution failed')
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
        except Exception:
            payload = cached if cached is not None else {'events': None}
            ttl = 120
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
        except Exception:
            payload = cached if cached is not None else {'folders': None}
            ttl = 120
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
    port = int(os.environ.get('PANEL_PORT', '8642'))
    print(f'Panel running at http://localhost:{port}')
    http.server.ThreadingHTTPServer((host, port), PanelHandler).serve_forever()


if __name__ == '__main__':
    main()
