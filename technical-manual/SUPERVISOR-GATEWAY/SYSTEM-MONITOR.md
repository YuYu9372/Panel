# System Monitor

## Current behavior

Panel currently has a compact twelve-window system dock. Selecting CPU, GPU,
RAM, Temperature, or Wi-Fi opens a full-screen monitor with twenty-four
half-hour windows covering twelve hours.

The detailed monitor displays:

- current value and state
- twelve-hour average
- twelve-hour peak
- data coverage
- host and uptime
- window duration
- last update time

## Gateway direction

System Monitor becomes a Gateway producer. It samples system data once and
publishes a shared snapshot for the dashboard, detailed monitor, menu bar, logs,
and health system. Consumers must not create duplicate sensor loops.

The System Monitor module will publish:

```json
{
  "moduleId": "system-monitor",
  "state": "healthy",
  "updatedAt": "2026-08-02T15:20:02Z",
  "metrics": {
    "cpu": 24,
    "gpu": 18,
    "ram": 72,
    "temperature": 48
  },
  "history": {
    "windowMinutes": 30,
    "windowCount": 24
  },
  "error": null
}
```

If one sensor is unavailable, the module may remain `degraded` while healthy
metrics continue to update. A single unsupported sensor must not restart the
entire Gateway.

## Next design discussion

The next discussion will decide how the System Monitor screen should display:

- module health and restart state
- System Monitor log or event history
- Network session summary
- Gateway and Supervisor health
- inline module controls, if any
- failure and recovery history
- navigation between metric detail and system overview

No UI decision in this section is final until that discussion is complete.
