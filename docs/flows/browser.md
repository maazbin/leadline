# Browser

Folder: `src/browser/`. Page: `/browser` and `/learn`.

## Done

The page was read, or a wall was stored as an encounter, or a hop was stored on the path for that site.

## Steps

1. `path_lookup` for the host.
2. `launch_chrome` if `onboard_status` says the debug port is down.
3. `browser_open`, then `browser_snapshot`.
4. `browser_click` and `browser_type` for anything that is not a send. Sends go through `execute_send`.
5. On a captcha or a login wall, stop. `record_encounter`. Do not click through it.
6. If the wall appears only while the debug port is open, record that outcome as `stop`, have the person close the debug window, and use `launch_chrome` mode `manual`. Do not attach Playwright while they pass the check.
7. `path_record` the hop you actually saw. Correct a hop that the next run proves wrong.

## Must not

Add stealth flags, a fake user agent, or a captcha solver. Use the person's daily Chrome profile. Kill every Chrome process to free a lock. Type a password through `browser_type`.
