# Reef Keeper

A Vercel-ready reef tank assistant app using the OpenAI API.

## Required Vercel environment variable

```text
OPENAI_API_KEY=your_openai_api_key
```

## Optional model variables

```text
OPENAI_MODEL_QUICK=gpt-5.4-mini
OPENAI_MODEL=gpt-5.4
OPENAI_MODEL_DEEP=gpt-5.5
OPENAI_MODEL_SIMPLE=gpt-5.4-nano
```

## Features

- Ask AI with tank context on by default
- Optional answer styles: quick, balanced, deep, simple
- Parameter logging with magnesium and trend charts
- Tank status summary
- Maintenance/action history
- Simplified Reminder Center
- AI-suggested reminders with approval
- Checkable recurring reminders that reset when due
- Days-off work plan based on A-watch rotation
- Completed history
- Export/import local backup
- Ask AI management commands, such as: “remove all chaeto reactor reminders or plans”

## Deploy

Upload these files to GitHub, connect the repo to Vercel, add `OPENAI_API_KEY`, and redeploy.

Update: Reminder tab delete controls
- Reminder Center items now include a visible delete button.
- Days-Off Work Plan tasks now include a visible delete button.
- Deleting a built-in reminder hides it from the active reminder lists and removes its completion history.
- Deleting a days-off plan task hides it from future plan displays and removes matching completion history.

Update: AI-generated Days-Off Work Plan
- The Days-Off Work Plan can now generate a custom 7-day plan for the current or next days-off block.
- The generated plan uses the latest parameter logs, maintenance/action history, completed history, active reminders, and the app's tank recovery context.
- Regenerate creates a fresh plan for the same block.
- Use Template restores the original non-AI checklist for that block.
- Generated plans, checklist state, and backup/restore are stored locally unless cloud sync is added later.

## Integrated Reef Tasks + Days-Off Plan

This version combines reminders and days-off planning more tightly:

- The Reminders tab now uses **Reef Tasks** as the master task/reminder list.
- Each Reef Task can be scheduled into Day 1–Day 7 of the Days-Off Plan.
- Scheduled Reef Tasks also appear inside the Days-Off Work Plan under the selected day.
- Checking off a scheduled Reef Task from the Days-Off Plan completes the same underlying reminder.
- Checking it off or restoring it in Reef Tasks updates the Days-Off Plan display.
- AI Days-Off Plan generation receives active Reef Tasks as context.
- Backup/restore now includes the Reef Task scheduling map.

## Expanded Tank Memory

This version expands the local tank context sent to the AI when **Use my tank context** is on.

The app now sends:

- Parameter trend summaries, including magnesium
- Up to 20 recent parameter logs
- Up to 30 recent maintenance/action entries
- Up to 30 recent completed reminders/tasks
- Active Reef Tasks and scheduled Days-Off Plan items
- A rolling long-term summary generated from local app history
- Older local history entries that match the user's current question

This is still stored locally in the browser unless you add a cloud database such as Supabase. Use Export Backup regularly if you are not using cloud sync.

## Apex / Home Assistant Manual Sync

This version includes a read-only manual sync path for Neptune Apex data through Home Assistant.

Expected Home Assistant entities:

- `sensor.apex_temperature`
- `sensor.apex_ph`
- `sensor.apex_orp`
- optional: `sensor.apex_salinity`

In Reef Keeper, open **Log → Apex / Home Assistant Manual Sync**, enter:

- Home Assistant URL, for example `http://homeassistant.local:8123`
- Long-lived Home Assistant access token
- the entity IDs above

Then use **Test Connection** and **Sync Apex Now**.

### Browser note

If the deployed Vercel app cannot reach local Home Assistant, the browser may be blocking a local HTTP cross-origin request from an HTTPS page. For local testing, run the app from a local HTTP server on the MacBook, or later expose Home Assistant securely through HTTPS/Tailscale/Nabu Casa. If using a local HTTP server, add its origin to Home Assistant CORS settings if needed.

Example Home Assistant config for local testing:

```yaml
http:
  cors_allowed_origins:
    - http://localhost:8000
    - http://127.0.0.1:8000
```

Restart Home Assistant after changing CORS settings.
