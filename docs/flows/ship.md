# Ship

Main is protected by a repository ruleset. A direct push to `main` is rejected. GitHub merges a pull request when the check named `test` is green. No review approval is required. Nobody can bypass the ruleset.

The check is the job `test` in `.github/workflows/test.yml`. GitHub Actions runs `npm test`.

GitHub Copilot reviews each pull request. The ruleset rule is `copilot_code_review`, and it reviews again on each push. That review is advice. It is not the required check, and it does not replace `test`.

Auto-merge is on for the repository. `.github/workflows/merge.yml` arms it for every open pull request into `main`. GitHub completes the merge when `test` is green. The Actions token may write so that workflow can arm the merge. `merge.yml` is not a required check.

## Steps

1. Branch from `main`. Do not commit on `main`.
2. Open a pull request into `main`.
3. Leave the merge to GitHub. `merge.yml` arms auto-merge. If that job did not arm it, run `gh pr merge <number> --auto --merge`.
4. Wait until the pull request is merged. A green pull request does not stay open.
5. If `test` is red, fix the branch. Do not merge a red check, and do not turn the ruleset off.
6. Leave the ruleset on. Do not force-push `main` or delete `main`.

Read the ruleset with `gh api repos/maazbin/leadline/rulesets/25993042`.
