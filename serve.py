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
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse
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


CHAT_MAX_MESSAGES = 20
CHAT_MAX_CHARS = 4000
CHAT_DEFAULT_MODEL = 'claude-haiku-4-5'
CHAT_MODELS = {
    'claude-haiku-4-5': {'label': 'Claude Haiku 4.5', 'tier': 'normal'},
    'claude-sonnet-4-6': {'label': 'Claude Sonnet 4.6', 'tier': 'better'},
    'claude-opus-4-8': {'label': 'Claude Opus 4.8', 'tier': 'best'},
}
CHAT_SYSTEM_PROMPT = (
    'You are the chat assistant of Panel, a personal dashboard on a small screen. '
    'Answer directly in one or two short sentences; go longer only when clearly '
    'needed. Never introduce yourself or explain what you are. '
    'Plain text only: no markdown, no emoji.'
)


def build_chat_messages(payload):
    messages = payload.get('messages')
    if not isinstance(messages, list) or not messages:
        raise ValueError('messages required')

    cleaned = []
    for message in messages[-CHAT_MAX_MESSAGES:]:
        role = message.get('role')
        content = message.get('content')
        if role not in ('user', 'assistant') or not isinstance(content, str) or not content.strip():
            raise ValueError('invalid message')
        cleaned.append({'role': role, 'content': content[:CHAT_MAX_CHARS]})

    while cleaned and cleaned[0]['role'] != 'user':
        cleaned.pop(0)
    if not cleaned:
        raise ValueError('messages required')
    return cleaned


def fetch_chat_reply(messages, model):
    body = {
        'model': model,
        'system': CHAT_SYSTEM_PROMPT,
        'messages': messages,
        'max_tokens': 300,
    }
    if model != 'claude-haiku-4-5':
        body['thinking'] = {'type': 'disabled'}
        body['output_config'] = {'effort': 'low'}

    request = Request(
        ANTHROPIC_URL,
        data=json.dumps(body).encode('utf-8'),
        headers={
            'x-api-key': os.environ['ANTHROPIC_API_KEY'],
            'anthropic-version': '2023-06-01',
            'Content-Type': 'application/json',
        },
    )
    with urlopen(request, timeout=30) as response:
        data = json.loads(response.read())

    reply = '\n'.join(
        block['text'] for block in data['content'] if block.get('type') == 'text'
    ).strip()
    if not reply:
        raise ValueError('Empty chat reply')
    return reply


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

    def do_GET(self):
        path = urlparse(self.path).path

        if any(part.startswith('.') for part in path.split('/') if part):
            self.send_error(404)
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

        if path == '/api/chat':
            self.send_json({
                'models': [{'id': mid, **info} for mid, info in CHAT_MODELS.items()],
                'default': CHAT_DEFAULT_MODEL,
            })
            return

        super().do_GET()

    def do_POST(self):
        path = urlparse(self.path).path

        if path != '/api/chat':
            self.send_error(404)
            return

        if not os.environ.get('ANTHROPIC_API_KEY'):
            self.send_json({'error': 'AI is not configured'}, status=503)
            return

        try:
            length = int(self.headers.get('Content-Length') or 0)
            if not 0 < length <= 64 * 1024:
                raise ValueError('bad length')
            payload = json.loads(self.rfile.read(length))
            messages = build_chat_messages(payload)
            model = payload.get('model') or CHAT_DEFAULT_MODEL
            if model not in CHAT_MODELS:
                raise ValueError('unknown model')
        except Exception:
            self.send_json({'error': 'Invalid chat request'}, status=400)
            return

        try:
            self.send_json({'reply': fetch_chat_reply(messages, model)})
        except Exception:
            self.send_json({'error': 'AI request failed'}, status=502)


def main():
    host = os.environ.get('PANEL_HOST', '127.0.0.1')
    port = int(os.environ.get('PANEL_PORT', '8642'))
    print(f'Panel running at http://localhost:{port}')
    http.server.ThreadingHTTPServer((host, port), PanelHandler).serve_forever()


if __name__ == '__main__':
    main()
