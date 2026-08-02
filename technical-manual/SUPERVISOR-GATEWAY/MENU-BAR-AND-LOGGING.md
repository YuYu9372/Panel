# Menu Bar and Logging

## Menu Bar

The menu bar display is part of Panel's Electron process, not a second App and
not the existing Python or Objective-C++ NetWatch menu-bar implementation.

```text
Panel — NetWatch
Panel 1.1.0 · Release 2026.8.2

Status: Connected

Ping avg: 023.42 ms
Ping max: 081.17 ms

Open Log
Quit Menu Bar Display
Quit Panel
```

The menu bar reads the shared Gateway network session. It must not start a
second ping loop.

Proposed states and colors:

- gray: Starting or Unavailable
- green: Connected
- yellow: High Latency
- orange: Unstable
- red: Offline

`Quit Menu Bar Display` destroys only the Tray display and leaves Panel and its
Gateway running. Settings provides the persistent Menu Bar Display switch so it
can be enabled again. `Quit Panel` closes the complete App and its managed
services.

The proposed Ping average and maximum use a rolling sixty-second session window.
The exact window remains an open decision.

## Network integration

Useful behavior from NetWatch will be moved into Panel's Gateway:

- multiple fixed probe targets
- consecutive-failure offline debounce
- consecutive-success recovery
- high-latency debounce
- transition-based instability detection
- outage duration
- bounded event history

Panel should retain broadly reachable fixed targets and avoid relying only on
DNS port 53, which some networks block. Latency severity must use Panel's
validated status-color configuration rather than NetWatch's fixed 300 ms value.

## Logs

Panel and network logs remain separate:

```text
~/Library/Logs/Panel/panel.log
~/Library/Logs/Panel/network.log
```

Panel Log records:

- App startup and shutdown
- Supervisor and Gateway lifecycle
- module start, stop, restart, and failure
- Runtime activation and rollback
- Safe Mode and crash recovery
- Renderer and Python service errors

Network Log records:

- connected and offline transitions
- high latency and instability
- rolling Ping summary
- outage start, recovery, and duration
- fixed probe-target result summaries

The NetWatch menu item `Open Log` opens Network Log. Settings Recovery opens
Panel Log. The Network module row may also expose `Open Network Log`.

Logs require bounded size, rotation, owner-only access, and redaction. They must
not contain API keys, tokens, private user content, full environment variables,
or arbitrary request bodies.

The bundled `ping.mp3` asset must not enter a public Panel release until its
origin and redistribution rights are confirmed. A system notification sound is
the safe fallback.
