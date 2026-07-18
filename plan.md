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
└── app.js
```

---

## Version

### 0.1.0 <-Currently
- [ ] Clock + date
- [ ] Weather
- [ ] Add git

### 0.2.0 
- [ ] To-do list
- [ ] Calendar
- [ ] Expenses / monthly total
- [ ] Exchange rates
- [ ] Stocks
- [ ] Habit tracker (GitHub-style grid)
- [ ] Tracked GitHub repo stars
- [ ] Server / device status

---

## Notes
- Weather API source: TBD.
- Layout colors and style: TBD.
