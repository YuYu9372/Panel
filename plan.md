# Panel - Personal Dashboard

## Main

### Goal
- A personal home screen showing info I care about.
- Runs on a small screen, always on, fullscreen in a browser.
- Built to last: start small, keep adding widgets.

### Stack
- `HTML` + `CSS` + `JS`, no framework.
- JS calls APIs directly (front-end only). Add a Node backend only if an API blocks front-end access.
- Electron (make `.app`) later if needed. Core stays web, so nothing is wasted.

### Rules
> Adding a new widget should be easy.

- Each widget is a standalone module: fetches, updates, and renders itself.
- Main app only loads widgets, lays them out, and triggers updates on a timer.
- New feature = new widget, no need to touch anything else.

### Files
```
Panel/
├── plan.md
├── index.html         
├── style.css
├── serve.py            # Static server + local device API
├── app.js              
└── widgets/
    ├── greeting.js
    ├── clock.js
    ├── weather.js
    ├── chat.js
    └── device-status.js
```

---

## Version

### 0.1.0
- [x] Clock + date
- [x] Weather
- [x] Greeting bar
- [x] Add git

### 0.2.0
- [x] Time-based greeting bar
- [x] 2 × 2 fullscreen layout
- [x] Clock (top left)
- [x] Weather (top right)
- [x] GitHub contribution count + yearly heatmap (bottom left)
- [x] Device status: CPU, GPU, RAM, temperature (bottom right)
- [x] Green / yellow / red / purple device alert states

### 0.3.0 <- Currently
- [x] AI greeting line via Anthropic API (local fallback)
- [x] Remove GitHub contributions widget
- [x] AI chat widget (bottom left), same API key

---

## Notes
- Weather API: Open-Meteo (free, no key). Location hardcoded to Taipei for now.
- AI: Anthropic API (`claude-haiku-4-5`), key in `.env` as `ANTHROPIC_API_KEY`. Greeting and chat degrade gracefully without it.
- Layout: time-based greeting bar above a fixed 2 × 2 grid.
- Device thresholds: warning at 70% load or 75°C; danger at 90% load or 90°C; critical at 98% load or 100°C.
- Style: soft floating cards on a cream canvas, system fonts, inline SVG weather icons.
