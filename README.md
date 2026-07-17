# Better Mutagen

Manage [Mutagen](https://mutagen.io) file-synchronization sessions from VS Code.

## Self-contained by design

Better Mutagen downloads and manages its **own** copy of the `mutagen` binary, stored inside this extension's own install folder (`<extension dir>/bin/`) — it is never installed system-wide. Uninstalling the extension removes the binary with it: VS Code deletes the whole extension folder on uninstall, and a `vscode:uninstall` hook stops the Mutagen daemon first so nothing is left locked or orphaned on Windows.

Your sync session configuration/history (Mutagen's own daemon state under your user profile) is left untouched by uninstall — only the extension-managed binary and daemon process are cleaned up.

## Features

- **Sync Sessions** view in the Activity Bar: each session expands to show its alpha/beta endpoints, mode, successful cycles, creation time, and any conflicts/errors, all color-coded (green/yellow/red) by health.
- Act on sessions (pause, resume, terminate, reset, flush, view details) via the context menu.
- Aggregate status bar item — colored on warnings/errors, click for a quick-pick menu of sessions and actions.
- **Create Sync Session** wizard: pick alpha/beta endpoints (local folder picker or manual path/URL for SSH/Docker targets), sync mode, ignores, and any extra `mutagen sync create` flags.
- **Hide/unhide sessions** to declutter the view without terminating them (view title has a toggle to reveal hidden sessions again).
- **Export/Import Sessions**: export selected sessions to a shareable mutagen project YAML file, and import one to recreate/start those sessions — a simple way to hand a sync setup to someone else.
- Optional per-workspace project file (default `.mutagen.yml`, configurable) — if present, its sessions can auto-start when the workspace opens, using Mutagen's own `mutagen project` orchestration.
- All executed commands and their output are logged to the "Mutagen" output channel (**Mutagen: Show Logs**).

## Settings

| Setting | Default | Description |
|---|---|---|
| `mutagen.binary.version` | `"latest"` | Mutagen release to install (`"latest"` or a tag like `"v0.18.1"`). |
| `mutagen.binary.customPath` | `""` | Use a manually installed `mutagen` executable instead of the extension-managed one. |
| `mutagen.autoStartDaemon` | `true` | Start the Mutagen daemon automatically on activation. |
| `mutagen.projectConfigFile` | `".mutagen.yml"` | Project file name (relative to the workspace root). |
| `mutagen.autoStartProjectOnOpen` | `true` | Auto-start the project file's sessions when the workspace opens. |
| `mutagen.refreshIntervalMs` | `2000` | Poll interval (ms) for the Sync Sessions view while it's visible. |

## Development

```
npm install
npm run compile   # or: npm run watch
npm run lint      # or: npm run lint:fix
```

Press `F5` in VS Code to launch an Extension Development Host with the extension loaded. Run `npm run package` to produce a `.vsix` for local installation.

Code style (enforced by `npm run lint`): tabs for indentation, braces on their own line (Allman style), and a one-line JSDoc description above every function/class.
