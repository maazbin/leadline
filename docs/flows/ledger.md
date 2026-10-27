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

Create and Virality may stay Off. That row is `off`, and it is not a fault.

## Status

| Status | Plain words | Meaning |
| --- | --- | --- |
| `working` | Working | The lane is on, and its job is moving or correctly finished |
| `waiting` | Waiting on you | A person has to press Start, publish, or allow a send |
| `stuck` | Needs a look | A required lane is Off, a marked person has no message, or Send was not clicked because the note is not in the box |
| `off` | Off | An optional lane is Off |
| `paused` | Paused | Run is off. No lane is expected to move |

`fine` is true when no row is `stuck`.

When Full power is on, Reach is not waiting on an approval. An Allow message can go. Prepare and Off still wait. The monitoring screen is `/crew`. It draws the lanes as a graph. Click a lane to open it. The other screens stay in the side list. Recent activity is a path under the graph.

## Steps

1. Call `review_ledger` if Today says a lane needs a look, or if this pass has not reviewed yet.
2. Read `lanes`. Use `status` and `detail`. Do not infer health from a missing event.
3. A `stuck` required lane comes before a new search.
4. You cannot turn a lane on. Say which Settings switch, and stop on that lane.

## Must not

Send because a row says Reach is stuck. Approve. Change `agent_permissions`. Clear a stall that is still true.
