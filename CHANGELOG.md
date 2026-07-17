# Changelog

## 0.1.0

Initial version.

- Self-contained Mutagen binary management: downloads and installs `mutagen` into the extension's own folder, with a `vscode:uninstall` hook that stops the daemon so nothing is left behind on uninstall.
- Sync Sessions view in the Activity Bar with color-coded status, expandable per-session details, and pause/resume/terminate/reset/flush actions.
- Aggregate status bar item with a quick-pick action menu.
- Create Sync Session wizard (local folder picker or manual path/URL for SSH/Docker targets).
- Hide/unhide sessions to declutter the view.
- Export/Import sessions as a shareable Mutagen project YAML file.
- Optional per-workspace `.mutagen.yml` project file with auto-start on workspace open.
