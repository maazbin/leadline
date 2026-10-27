# Ship

Main is protected by a repository ruleset. A direct push to `main` is rejected. A pull request can merge when the check named `test` is green. No review approval is required.

The check is the job `test` in `.github/workflows/test.yml`. It runs `npm test`.

## Steps

1. Branch from `main`. Do not commit on `main`.
2. Open a pull request into `main`.
3. Wait until the check named `test` is green.
4. Merge the pull request. A finished green pull request does not stay open.
5. Leave the ruleset on. Do not force-push `main` or delete `main`.

Read the ruleset with `gh api repos/maazbin/leadline/rulesets`. If `test` fails, fix the branch. Do not merge a red check, and do not turn the ruleset off to get around it.
