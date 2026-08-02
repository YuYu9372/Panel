# Settings and Notifications

## Single-window rule

Panel will keep one Settings window. It will not open a second Settings window,
modal manager, nested module page, or separate notification configuration
window.

The bottom of Settings will contain an internal page selector:

```text
[ MASTER / NOTIFICATIONS ]
```

Both pages live inside the same Settings document and window. Switching pages
replaces the visible content without changing the window or opening another
layer.

## Master page

```text
SETTINGS

CONNECTIONS
Anthropic API Key
Composio MCP Token
Test Connections

GENERAL
Refresh Time
Update Channel
Menu Bar Display

MODULES
Network Monitor       Healthy
System Monitor        Healthy
Calendar              Blocked
Tasks                 Healthy
Weather               Healthy
Greeting              Healthy

SUPERVISORS
App Supervisor        Healthy
Recovery Supervisor   Healthy
Gateway               Healthy

RECOVERY
Restart Panel
Start in Safe Mode
Rollback Runtime
Open Panel Log

[ MASTER / NOTIFICATIONS ]
```

Each module row displays its short status, last successful update, last error,
and permitted inline actions. Details expand within the same row. Reset and
clear operations use inline `Confirm` and `Cancel` controls instead of dialogs.

## Notifications page

```text
NOTIFICATIONS

macOS Notifications             On
In-App Notifications            On
Network Disconnect Alerts       On
Module Failure Alerts           On
Recovery Notifications          On
Sound                           On

[ MASTER / NOTIFICATIONS ]
```

The visual style remains flat and minimal. Use typography, spacing, separators,
small status dots, and inline controls rather than nested cards.

## Notification policy

Panel will use both macOS and in-app notifications, with severity-based routing:

| Event | In-app | macOS |
| --- | --- | --- |
| Temporary latency | Yes | No |
| Module degraded | Yes | No |
| Successful automatic restart | Yes | Optional |
| Repeated module restart failure | Yes | Yes |
| Network disconnect or recovery | Yes | Yes |
| Gateway failure | Yes | Yes |
| Runtime rollback | Yes | Yes |
| Safe Mode entry | Yes | Yes |

Notifications require stable event IDs, deduplication, cooldowns, and a single
recovery message after an incident. They must never contain credentials,
tokens, private calendar or task contents, arbitrary paths, or stack traces.

Renderer notification permission is not sufficient for recovery reporting. The
Electron App Supervisor and the native Recovery Supervisor must retain a safe
notification path when the GUI is unavailable.
