# Recovery

## Recovery ladder

Panel will recover at the smallest safe scope first:

```text
Restart module
Restart Gateway
Runtime rollback
Restart Panel
Safe Mode
Manual recovery
```

## Runtime rollback

The current signed Runtime design uses A/B slots. A new Runtime is staged in the
inactive slot, activated, and confirmed only after Python and Renderer health
checks succeed. Failure restores the previous healthy slot.

Runtime rollback changes Runtime code. It must preserve:

- encrypted credentials
- user settings
- Calendar and Tasks data
- Network Log
- System Monitor history

Invalid signatures and incompatible packages are rejected before activation and
therefore do not require rollback.

Future module-aware Runtime packages may identify affected modules and restart
or roll back only those modules. The signed package, anti-replay sequence, trust
boundary, and bounded rollback rules remain mandatory.

## Safe Mode

Safe Mode is a proposed Panel recovery mode, not macOS Safe Mode. It launches the
immutable bundled Baseline with only the components required for diagnosis and
repair:

- supervisors
- minimal Gateway
- Settings
- Update Manager
- Runtime recovery
- basic Renderer

Optional data modules, alerts, recent Runtime modules, and nonessential UI are
disabled until the user retries normal startup.

Safe Mode must not delete credentials, reset settings, clear history, weaken
signature checks, or allow unsigned code.

## Crash-loop handling

The Recovery Supervisor records whole-App restarts. After repeated failures in a
bounded window, it stops normal relaunch attempts and starts Safe Mode. A
proposed initial threshold is three failures within five minutes.

## Update maintenance

Before an expected Runtime activation or Full Version installation, the App
Supervisor sends the Recovery Supervisor a signed or locally authenticated
maintenance lease with a strict deadline. Expected service restarts inside that
window do not count as crashes.

If the deadline expires without healthy App Supervisor, Gateway, and Renderer
heartbeats, recovery proceeds through rollback or a whole-App restart.

## Final authority

- App Supervisor repairs modules and Gateway.
- Recovery Supervisor repairs the whole Panel App.
- macOS `launchd` keeps the Recovery Supervisor available.
- Safe Mode provides a user-visible recovery surface when automatic repair is
  exhausted.
