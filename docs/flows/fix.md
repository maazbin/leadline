# Fix

Lane: `fix`. Screen: `/fix`.

Fix sits after Trace, under the master. It reads the open stop and names how a change leaves the repo: a new branch, a pull request into main, and a merge only after the check named `test` is green. It does not send, and it does not merge. The desk does not open a pull request on the 20-second pass.

The ruleset stays on. Read it with `gh api repos/maazbin/leadline/rulesets/25993042`. The ship steps are in [ship.md](ship.md).

## Done

The crew graph shows Fix, and the line into it says what crosses: the stop. `/fix` lists the open stops and the ship rules. Turning Fix off while the desk is running is Needs a look. An open stop with Fix on stays Working, and the detail names that stop. Fix is not stuck merely because Reach is stuck.

## Steps

1. Read the open lines on `/fix`.
2. Branch from `main`. Do not commit on `main`.
3. Open a pull request into `main`.
4. Leave the merge to GitHub. Do not merge a red `test` check. Do not turn the ruleset off.
5. Do not force-push `main` or delete `main`.

## Must not

Send. Merge from the desk. Call `gh` from the harness. Turn the ruleset off. Click Send to clear a stall that is still true.
