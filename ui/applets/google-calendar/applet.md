# Calendar

Read your connected calendars, and keep your own events on this computer. Access is requested only when you connect.

## Runtime

- Stable identity: `app-google-calendar`; provider: `google-calendar`.
- Executable configuration: [runtime.json](runtime.json). This Markdown describes the contract; it is not executable code.
- Mode: **scheduled**.
- Google Calendar API (or the authorized native Calendar adapter). Read the next 30 days with pagination, preserving exact start/end, cancellation and all-day semantics. Scripts filter cancelled/declined and ended events conservatively; S extracts evidence-backed candidates in fresh batches using `prompts/extract.md`, then central M synthesis combines them with other Applets. The Google adapter currently reads the primary calendar.

## Local events

Owner request 2026-10-06: Calendar matches Apple Calendar, and the person can add, change and delete events. Worldlet
has no write access to a connected calendar, so these events live in this World only: the `calendar_events` table of
world.sqlite (rules in `core/applets/calendar-events.ts`, host in `platform/electron/src/modules/calendar/`). The
practice world keeps its events in memory for the session.

- Day and Week are a time grid (`grid.ts`): an hour gutter, an all-day strip, overlapping events side by side, a
  red line at the current time, Today and + on the date row.
- Drag on empty time to make an event; double-click empty time for an hour there; + makes an hour from the next
  full hour (9 AM on another day). In Month, or on the all-day strip, a double-click makes an all-day event.
- Drag an own event to another time or day, drag its lower edge to change its end; in Month, drag it to another
  day. Times snap to 15 minutes.
- Click an own event for its details beside it: title, location, all-day, start, end, notes. Done or a click
  elsewhere saves; Esc leaves it as it was. Delete (the button or the Delete key) removes it at once, with Undo on
  the date row for a few seconds, and no confirmation.
- Own events are terracotta and say "On this computer"; synced events stay sage and read only, and open their
  original as before.
- Repeat: Never, Every Day, Every Week or Every Month (a monthly event on the 31st skips shorter months). Each time
  shows on its own; moving or editing one changes the whole event. Delete on one time asks Delete This Event (that
  day is skipped) or Delete All.
- Alert: 10 minutes before, or None; a timed event alerts by default, an all-day one never. While Worldlet runs the
  alert is a Mac or Windows notification, and clicking it shows that day in Calendar.
- Attention: what is on in the next day stands in Coming Up (at most five, in time order with the synced events),
  here and on the phone; an event whose alert has come leads it. Opening one shows its day.
- Fox works with them through `manage_calendar` (`core/tools/calendar.ts`, gateway `calendar/list|add|change|delete`):
  it lists, adds and changes events, and deletes one only when the person asked in their own words this turn.
  `google-calendar/draft` stays for the Mac's Calendar app only.

Checks: `scripts/calendar-events-check.ts` (rules, repeats, alerts, world.sqlite and Fox's tool, PR CI),
`scripts/calendar-events-ui-check.ts` (the gestures, repeat and alert, RC `test:ui`) and
`scripts/calendar-attention-ui-check.ts` (Coming Up and opening its day, RC `test:ui`).

## Status

Use the [shared runtime status and lifecycle contract](../../../docs/APPLET-RUNTIME.md#status-and-presentation).
No Applet-specific status override. The mode and capability declarations above
never imply additional authorization or background work.
