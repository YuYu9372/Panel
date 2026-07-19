# Panel

## Run

```bash
python3 serve.py
```

Then open [http://localhost:8642](http://localhost:8642).

The Python server exposes local CPU, GPU, RAM, and temperature data to the device-status widget, and proxies the Anthropic API for the greeting line and chat widget. Unsupported sensors are shown as unavailable.

## About

A personal info dashboard, always on, shown fullscreen on a small screen.

See [plan.md](plan.md) for goals, stack, and roadmap.

## Version

Current: **0.3.0**

- 2 × 2 fullscreen layout: clock, weather, AI chat, device status
- Time-based greeting bar with AI-generated line (local fallback)
- AI chat widget backed by the Anthropic API
- Device alert states: green / yellow / red / purple

Full version history in [plan.md](plan.md).

## Coworkers
- YuYu9372
- Claude
