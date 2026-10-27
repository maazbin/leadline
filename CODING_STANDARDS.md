# Coding standards

These rules are for the next coding agent. A person should be able to read a file, but the file header is the contract.

## File header

Every file under `src/` starts with:

- the path and one line on what it owns
- Must not
- Reads / Writes when it touches SQLite or Chrome

## Modules

- ESM only. Named exports.
- One team per directory: `understand`, `discover`, `reach`, `create`, `gtm`. Shared mechanics live in `kernel` and `browser`.
- A team module does not do another team's job. GTM links rows. It does not find people or send.
- Return `{ ok: false, code }` for a refused action. Do not throw across a tool or a page handler.
- No personal data, seeds, or sample leads in source.

## State

- Operational state is SQLite, `data/leadline.db`. No JSON state files.
- Screenshots under `data/encounters/` are evidence. The row in `encounters` is the state.
- New columns go in the next file under `src/kernel/migrations/`. Do not edit a migration that has already run.
- Human-only writes check `actor === 'person'` and have no MCP tool:
  - `approveMessage`
  - `setChannelMode`
  - `setCampaignStatus` for anything but the draft insert
  - `setContentStatus` for approved, published, or killed
  - `answerQuestion`

## Context

- Tools return a capped slice. Do not add a tool that dumps every row.
- `next_action` names one tool. Do not make a tool that runs the whole pipeline.
- There is no background sender. `execute_send` sends one gated message when the brain calls it.

## Browser

- Real Chrome, dedicated profile, no stealth flags, no captcha solving.
- `browser_click` must keep refusing send-shaped labels.
- A wall returns `captcha` or `login` and records an encounter.

## Web

- Escape every value that enters HTML with `esc`.
- Pages call team modules. They do not open SQL of their own except the browser and memory pages, which only read.
- One screen, one file, one route under `src/web/pages/`. The desk screens are `/`, `/plan`, `/questions`, `/persona`, `/trends`, `/results`, `/tracking`, and `/crew`. Do not put those screens back into one file or one `?tab=` page.
- A page file stays readable in one pass. A helper two screens share goes in a small module such as `src/web/format.js` or `src/web/pages/stalls.js`. Do not grow one file until it holds the whole desk.
- Bind `127.0.0.1` only.

## Checks

- `npm test` covers the gate, dedup, the human-only actor, the context cap, and the pages.
- Add a test when you change who is allowed to send.
- GitHub Actions runs that same test as the check named `test`. Main accepts a merge only after it is green. Auto-merge is armed on the pull request, and GitHub merges it. Copilot reviews, and that review does not replace the check. See `docs/flows/ship.md`.
