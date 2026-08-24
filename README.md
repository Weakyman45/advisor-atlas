# Advisor Atlas

Advisor Atlas is a private Fall 2027 PhD-outreach tracker built from the screened professor workbook. It combines the 141-person roster with a searchable pipeline for outreach, replies, meetings, and applications.

## Open it on this Mac

Double-click `Launch Advisor Atlas.command`. The launcher opens the tracker at <http://127.0.0.1:4173> and keeps a small Terminal window running while you use it.

Local updates are stored in that browser on this Mac. Use the same browser and address each time. Download a JSON backup periodically from the tracker, especially before clearing browser data or moving to another computer.

If macOS blocks the launcher the first time, Control-click it, choose **Open**, and confirm. You can also run:

```bash
npm start
```

Then open <http://127.0.0.1:4173>.

## What you can track

- Search and filter by professor, institution, region, tier, research track, contact route, and pipeline stage.
- Record contact details, email and follow-up dates, replies, disposition, meetings, planned applications, next actions, and notes.
- See automatic 14-day follow-up reminders and pipeline totals.
- Export a complete JSON backup or a spreadsheet-friendly CSV.
- Import a JSON backup to restore or move your progress.

## Storage modes

- **Saved on this device:** the local launcher stores updates in browser local storage.
- **Cloud saved:** the private deployed version stores updates in a Cloudflare D1 database.
- **This tab only:** the browser has blocked local storage; export a JSON backup before closing the tab.

The private deployment remains owner-only. The local mode sends no progress data to a server.

## Development and verification

The dependency-free production worker is generated from `site/`, `worker/runtime.js`, and the embedded professor dataset.

```bash
npm run lint
npm test
npm run build
```

The D1 schema is in `drizzle/0000_professor_progress.sql`. The Sites project binding is declared in `.openai/hosting.json`.
