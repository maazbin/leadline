# Reach

Folder: `src/reach/`. Page: `/reach`. Gate: `canSend` in `src/reach/gate.js`.

## Done

One message has status `sent`, or it is waiting on the person, or it was cancelled. A first send schedules one empty follow-up. That follow-up is not sent.

## Steps

1. With Full power on, the desk writes one first note from the campaign for the next person whose fit is yes. Do not draft a second note. With Full power off, `draft_message` does that write. One open draft per lead and channel.
2. If the channel mode is `draft` or `off`, stop. The person changes it on `/permissions`.
3. If Full power is on, skip approval. The desk calls `execute_send` when `canSend` is ok. Reach types the note into the box, then clicks Send. When Message is a Premium wall, the same note goes out as a connection invitation. If LinkedIn is out of free notes, the desk waits six hours and does not start a trial. Reach does not ask.
4. If Full power is off and the mode is `approve`, `request_approval` and stop. There is no approve tool.
5. If `next_action` says `execute_send`, call it for that id only.
6. On `captcha` or `login`, `record_encounter` and stop.
7. When a follow-up is due and empty, `schedule_followup` with the body. Then it waits like any other draft. Full power still does not ask for an approval on that follow-up.

A reply uses `set_lead_outcome`. That cancels open messages.

## Must not

Call `approveMessage` or `setChannelMode`. Change the gate so a draft mode can send. Click Send from `browser_click`.
