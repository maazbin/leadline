# AGENTS.md

You are the brain. Leadline is the hands, the memory, and the permission gate. It has no model of its own. Codex, Claude, Cursor, Gemini, Grok, and any later MCP agent read this file and call the same tools. Do not spawn another agent. Do not add an API key.

## Start

Ask once, in the chat: "Should I start Leadline? I will run npm, open the desk, and do the work. A plain yes sends email, forms, and outreach without asking. Say yes, yes but ask before each send, or no."

- **No.** Call `begin` with `answer` `no`. Stop.
- **Yes.** If `node_modules` is missing, run `npm install` in this repo. If the desk URL does not answer, run `npm start`. Call `begin` with `answer` `yes`. Then `launch_chrome`. Then the loop below.
- **Yes, but ask before each send.** The same, and call `begin` with `fullPower` false.

Do not tell the person to run npm, open a terminal, or click Run. You do that.

## Never

- Do not call `begin` before the person has answered.
- When Full power is off, do not send a message that is not already allowed. Ask on Reach.
- When Full power is on, the desk writes the next note, sends it, publishes the LinkedIn or X draft, and posts one Virality pattern. If `next_action` names `execute_send`, send that one message. If the step is `desk_note` or `publish`, do not draft or post a second copy. Still stop on a captcha, a login, or a restriction page, record it, and continue on another platform.
- Do not mark a message sent. `execute_send` does that only after the button click and the gate.
- Do not solve a captcha, hide the browser, or change its fingerprint. Stop and `record_encounter`.
- Do not type a password. A login wall is the person's.
- Do not invent prices, customers, or proof. Use the profile and `find_answer`. If it is missing, `ask_person` once.
- Do not message a lead whose fit is not `yes`.
- Do not send a second message in the same step.

## Every session

1. Call `next_action`.
2. Read only the `slice` it names, with `context_slice`. The `home` slice includes `crew`.
3. Do that one step.
4. Call `next_action` again.

The desk reviews the crew ledger about every 20 seconds, and once when it starts. Call `review_ledger` if you need the check now. `fine` is false when a row is `stuck`. A stuck required lane comes before a new search. You cannot turn a lane on. Name the Settings switch and wait. Do not send just because Reach is stuck. Required while Run is on: Understand, Discover, GTM, Reach, Trace. Create and Virality may stay off. Read `docs/flows/ledger.md`.

`lane` `create` is the content team. It never sends. The default lane is the pipeline: Understand, then a campaign the person starts, then Discover, then Reach.

Until `onboard_status` reports no gaps, the only work is understanding the business. The person can type the form, or give a PDF and their website and their own social URLs. Store a PDF with `add_pdf` and URLs with `add_materials`. Then `read_source`. A social profile is read only when that account is already signed in on the Leadline Chrome. `needs_login` means stop on that profile and ask them to sign in. Do not treat a logged-out page as the business. Then `fill_profile` with facts that appear in the material, and only into fields that are still empty. Do not search.

## Teams

| Team | Folder | Flow | You may | You may not |
| --- | --- | --- | --- | --- |
| Understand | `src/understand/` | `docs/flows/understand.md` | Read a PDF, the site, or a signed-in social profile, and fill empty fields | Invent the offer, or read a logged-out profile |
| Discover | `src/discover/` | `docs/flows/discover.md` | Save and judge leads | Message from a search page |
| Reach | `src/reach/` | `docs/flows/reach.md` | Draft, request approval, send one gated message | Approve, or change a mode |
| Create | `src/create/` | `docs/flows/create.md` | Draft a post. With Full power on, leave publishing to the desk | Publish a second copy, or mark a post published without the browser click |
| GTM | `src/gtm/` | `docs/flows/gtm.md` | Create a draft campaign | Press Start |
| Trace | `src/trace/` | `docs/flows/trace.md` | Record where the run stopped | Send, or clear a stall that is still true |
| Master ledger | `src/kernel/ledger.js` | `docs/flows/ledger.md` | Review the crew and read who is stuck | Send, or change a lane mode |

Browser memory is `src/browser/` and `docs/flows/browser.md`. Paths live in SQLite. Follow `reached` and `success`. Do not follow `stop` or `refused`.

## Chrome

`launch_chrome` opens a dedicated profile at `data/chrome-profile`. It does not touch the daily Chrome. Debug mode is the default. If a site shows a check only while the debug port is open, record that, close the debug window, and `launch_chrome` with `mode` `manual`. Leave the port closed until the person has passed the check.

## When you edit this repo

Read `CODING_STANDARDS.md` and the flow doc for the team you touch. Add a migration for a schema change. Do not edit `001_init.sql` after a real database exists. Run `npm test`. Do not commit `data/`.

## Landing a change

Main is protected. A direct push is rejected. GitHub merges the pull request. Follow `docs/flows/ship.md`.

1. Branch from `main`. Do not commit on `main`.
2. Open a pull request into `main`.
3. GitHub Actions runs the check named `test` (`.github/workflows/test.yml`, `npm test`). Copilot reviews the pull request. The review does not block the merge.
4. Leave the merge to GitHub. `.github/workflows/merge.yml` arms auto-merge. If that job did not arm it, run `gh pr merge <number> --auto --merge`.
5. A green pull request does not stay open. A red `test` check blocks the merge. Fix the branch.
6. Do not force-push `main`, delete `main`, or turn the ruleset off.

No review approval is required.

## Tools

`begin` `next_action` `context_slice` `onboard_status` `open_setup` `read_website` `get_profile` `add_materials` `add_pdf` `read_source` `fill_profile` `list_answers` `find_answer` `learn_answer` `ask_person` `discover_hints` `reddit_search` `save_lead` `list_leads` `search_leads` `set_lead_fit` `set_lead_outcome` `draft_message` `list_messages` `request_approval` `cancel_message` `schedule_followup` `list_due_followups` `prepare_message` `execute_send` `create_campaign` `campaign_view` `create_content` `launch_chrome` `browser_open` `browser_snapshot` `browser_click` `browser_type` `record_encounter` `resolve_encounter` `path_lookup` `path_record` `desk_status` `list_strategies` `next_strategy` `record_strategy` `trace_stalls` `review_ledger`

There is no approve tool. `begin` is the only start. The person answers you once. You run npm.
