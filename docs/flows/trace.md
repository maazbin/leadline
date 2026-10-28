# Trace

Folder: `src/trace/`. Lane: `trace`. Tool: `trace_stalls`.

Trace sits under the master with Understand, Discover, Reach, Create, GTM, Virality, and Fix. It writes down where the run stopped. Fix reads that stop. Trace does not find people, write a note, or send.

## Done

An open stall matches the desk. A stall is cleared when that step has moved.

## Steps

1. Call `trace_stalls` when `next_action` names the same step again and nothing was written.
2. Read the open lines. `no_message` means a person is marked yes and no message exists yet. With Full power on, the desk writes that note on the next pass.
3. `composer` means a LinkedIn or X page is open and the note is not in the box. Send was not clicked.
4. Do the one step `next_action` names. Call `trace_stalls` again after it. The line clears on its own.

## Must not

Send, approve, or change a mode. Clear a stall while the step is still true. Click Send from `browser_click`.
