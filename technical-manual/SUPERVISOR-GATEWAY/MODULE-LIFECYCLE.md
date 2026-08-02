# Module Lifecycle

## Standard module contract

Every managed module will expose a consistent identity and health snapshot:

```json
{
  "id": "network",
  "name": "Network Monitor",
  "version": "1.0.0",
  "state": "healthy",
  "enabled": true,
  "autoRestart": true,
  "startedAt": "2026-08-02T14:00:00Z",
  "lastHeartbeat": "2026-08-02T14:05:21Z",
  "lastSuccess": "2026-08-02T14:05:21Z",
  "restartCount": 0,
  "dependencies": ["gateway"],
  "actions": ["restart", "stop", "reset"],
  "error": null
}
```

## States

- `starting`
- `healthy`
- `degraded`
- `failed`
- `restarting`
- `stopped`
- `disabled`
- `blocked`

`blocked` means that the module is not broken but cannot work because a
dependency, credential, or required service is unavailable.

## Action semantics

- `Restart` stops and starts the module without deleting data.
- `Stop` lasts for the current Panel session.
- `Disable` persists across Panel restarts.
- `Reset Configuration` restores only that module's safe defaults.
- `Clear Cache` does not remove credentials or history.
- `Clear History` is a separate destructive action with inline confirmation.
- `Clear Log` is a separate destructive action with inline confirmation.

Reset must never silently delete API keys, tokens, user data, history, or logs.

## Automatic recovery

The Watchdog detects failure. The Supervisor chooses and performs recovery.

Recommended initial policy:

1. Mark a module `degraded` after repeated functional health failures.
2. Attempt restart after a short grace period.
3. Retry with bounded backoff.
4. Open a circuit breaker after three failed restarts in five minutes.
5. Mark the module `failed`, notify the user, and wait for manual action.

Suggested backoff is one second, five seconds, then fifteen seconds. These
values remain proposals until implementation testing establishes appropriate
thresholds for each module.

User-stopped and disabled modules must not be automatically restarted.

## Dependencies

Examples:

- Menu Bar depends on Gateway status.
- Network history depends on Network Monitor.
- Calendar and Tasks depend on network access and Composio configuration.
- Greeting depends on network access and optional Anthropic configuration.
- Recovery and signature verification are protected core modules.

If a dependency fails, a dependent module becomes `blocked` rather than
creating an unnecessary restart loop.

## Protected core

Settings must not expose Stop or Disable for:

- App Supervisor
- Recovery Supervisor
- signature and trust verification
- Update Manager
- secure settings storage
- recovery controls

These components may expose read-only health information and carefully scoped
recovery actions.
