# My Monthly Budget

Static, installable expense checklist in English, hosted on GitHub Pages.

- Add/edit/remove fixed or flexible monthly expenses, amounts and due days.
- Filter all, paid, unpaid and overdue items. Due days beyond month end use that month's last day.
- Manage recurring expenses with effective-month plans. Changes affect future unsaved months from the selected month; saved months are snapshots and must be edited directly.
- Edit monthly income or use it as the default for future unsaved months.
- Check/uncheck payments with dated activity, including edits and removal. Older imported payment flags have no invented dates.
- Open any past month and export/restore all records as JSON, including recurring plans and activity. Restore replaces the current data after confirmation. Legacy v1 monthly backups are supported.
- Local PIN screen lock; the data and backups are not encrypted. No account, server storage, or automatic device sync.

## Install

Open the published URL in Safari on iPhone: Share → Add to Home Screen. On Android Chrome: ⋮ → Install app / Add to Home screen. After loading online once, the app works offline. Use a regular browser profile, not private browsing.

## Keep records safe

Data is saved only in this browser on this device. Export backups regularly and before clearing website data or changing phones. Restore your backup in the new browser. PIN is not included in backups. Keep your PIN safe; there is no PIN recovery. The app locks on reload and after returning from more than a minute in the background.

## Local verification

Run `npm test` for model tests. Serve the folder over HTTP (for example `python3 -m http.server 8000`) for browser testing. No build dependencies are required. Deploy the repository root from main using GitHub Pages.
