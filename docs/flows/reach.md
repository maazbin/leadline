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
8. With Full power on, after the note, the post, and the community look, the desk tries one learned step: a reply on X, a comment on LinkedIn or Instagram, or a DM on X, LinkedIn, or Instagram. The words are the campaign's first sentence and its link. It tries each step that is still open before it repeats one that worked. It skips a step marked failed or wrong, a path marked stop or refused, and a DM while that channel is held. A captcha, or an X chat passcode, holds the step. A login or a Premium wall fails it. An X inbox that shows Not Now, an X Number, or no message box is remembered, the X DM step fails, and the next try is another platform. Nothing starts a trial, and the passcode is never typed.

A reply uses `set_lead_outcome`. That cancels open messages.

## Must not

Call `approveMessage` or `setChannelMode`. Change the gate so a draft mode can send. Click Send from `browser_click`. Start a Premium trial from a comment or a DM.
