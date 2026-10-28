# Ledger

File: `src/kernel/ledger.js`. Tool: `review_ledger`.

The master keeps one row per lane in `agent_ledger`. The harness reviews it every 20 seconds, and once when the desk starts. The brain may call `review_ledger` when it needs the check immediately.

## Required lanes

While Run is on, these must not be Off:

1. Understand
2. Discover
3. GTM
4. Reach
5. Trace
6. Fix

Create and Virality may stay Off. That row is `off`, and it is not a fault. Fix may not stay Off. An open stop does not make Fix stuck. The detail names the stop, the branch, and the pull request.

## Status

| Status | Plain words | Meaning |
| --- | --- | --- |
| `working` | Working | The lane is on, and its job is moving or correctly finished |
| `waiting` | Waiting on you | Full power is off, and a person has to press Start, publish, or allow a send |
| `stuck` | Needs a look | A required lane is Off, or Send was not clicked because the note is not in the box. A marked person with no message is stuck only while Full power is off. While it is on, Reach is writing that note. |
| `off` | Off | An optional lane is Off |
| `paused` | Paused | Run is off. No lane is expected to move |

`fine` is true when no row is `stuck`.

When Full power is on, Reach writes and sends, then tries one reply, comment, or DM on X, LinkedIn, or Instagram. Create publishes LinkedIn and X, and Virality posts one pattern. Fix names the stop and stays on. Prepare and Off on a platform still wait. The monitoring screen is `/crew`. It draws the lanes as a graph. Each line is a handoff: the profile, who to find, who fits, where it stuck, the stop, the campaign, and one pattern. The small line in a box is the last check. The same sentence sits on that lane's screen. Click a lane to open it. Fix opens at `/fix`. The other screens stay in the side list. Recent activity is a path under the graph.

## Steps

1. Call `review_ledger` if Today says a lane needs a look, or if this pass has not reviewed yet.
2. Read `lanes`. Use `status` and `detail`. Do not infer health from a missing event.
3. A `stuck` required lane comes before a new search.
4. You cannot turn a lane on. Say which Settings switch, and stop on that lane.

## Must not

Send because a row says Reach is stuck. Approve. Change `agent_permissions`. Clear a stall that is still true.
