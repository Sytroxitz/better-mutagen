# Changelog

## 0.3.0

- Check GitHub for newer Mutagen releases when the version is set to `latest` and prompt to update (with an option to skip a version).
- Switch the installed Mutagen version from the settings: the chosen release is installed and the previous one removed, so only the newest (or explicitly pinned) version is kept.
- Download the binary via `fetch` with an `https` fallback, fixing "Parse Error" install failures behind some proxies/antivirus setups.
- Honor the `mutagen.binary.version` and `mutagen.binary.customPath` settings (previously read under the wrong key and ignored), and fall back to `latest` if a pinned version can't be installed.

## 0.2.1

- Add an extension icon.

## 0.2.0

- Add the ability to edit existing sync sessions.

## 0.1.2

- Add the MIT license.

## 0.1.1

- Add an automated release workflow that builds and publishes to the Visual Studio Marketplace.

## 0.1.0

Initial version.

- Self-contained Mutagen binary management: downloads and installs `mutagen` into the extension's own folder, with a `vscode:uninstall` hook that stops the daemon so nothing is left behind on uninstall.
- Sync Sessions view in the Activity Bar with color-coded status, expandable per-session details, and pause/resume/terminate/reset/flush actions.
- Aggregate status bar item with a quick-pick action menu.
- Create Sync Session wizard (local folder picker or manual path/URL for SSH/Docker targets).
- Hide/unhide sessions to declutter the view.
- Export/Import sessions as a shareable Mutagen project YAML file.
- Optional per-workspace `.mutagen.yml` project file with auto-start on workspace open.
