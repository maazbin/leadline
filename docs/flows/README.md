# Flows

The main lane is one step at a time. `next_action` is the authority. These pages say what "done" means when you edit a team.

1. [Understand](understand.md) — the profile exists.
2. [GTM](gtm.md) — a campaign exists and the person has started it.
3. [Discover](discover.md) — a lead is saved and judged.
4. [Reach](reach.md) — a draft, an approval, one send, a follow-up.
5. [Create](create.md) — parallel. Posts are not a gate on sending.
6. [Browser](browser.md) — how a page is driven, and how a wall is remembered.
7. [Trace](trace.md) — where the run stopped. It does not send.
8. [Ledger](ledger.md) — the master reviews the crew every 20 seconds. It does not send.
9. [Ship](ship.md) — GitHub runs `test`, Copilot reviews, and GitHub merges into main when the check is green.
10. [Fix](fix.md) — names the stop, opens a branch, and does not send or merge.

Do not add a worker that sends on a timer. The brain calls `execute_send` for one row.
