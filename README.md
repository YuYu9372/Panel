# Panel

## Run

```bash
python3 serve.py
```

Then open [http://localhost:8642](http://localhost:8642).

The Python server exposes local CPU, GPU, RAM, and temperature data to the system-status readout, calls the Composio MCP directly for Google Calendar and Google Tasks (no LLM), and proxies the Anthropic API only for the greeting line. Unsupported sensors are shown as unavailable.

Set `ANTHROPIC_API_KEY` (greeting) and `COMPOSIO_MCP_URL` / `COMPOSIO_MCP_TOKEN` (calendar + tasks) in `.env` — see [.env.example](.env.example). Everything degrades gracefully when a key is missing.

## About

A personal info dashboard, always on, shown fullscreen on a small screen.

See [plan.md](plan.md) for goals, stack, and roadmap.

## Version

Current: **0.4.2**

- Time-based dark mode (dark 18:00–05:00, light otherwise; auto-switches while running)
- Top bar: time-based greeting (AI line, local fallback) + compact system status
- 2 × 2 grid: clock, weather, calendar, tasks
- Weather: UV index with a color-tier background (blue / green / yellow / red by UV band)
- Calendar: vertical timeline of upcoming Google Calendar events
- Tasks: Google Tasks by folder, with checkboxes that complete and sync back
- Calendar + tasks read the Composio MCP directly — no LLM, zero Anthropic tokens

Full version history in [plan.md](plan.md).

## Coworkers
- YuYu9372
- Claude
