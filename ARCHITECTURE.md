# Architecture

Leadline is a local go-to-market desk. A coding agent is the brain. This repo is the control plane, the Chrome hands, and the memory.

Jobpilot (`github.com/maazbin/jobpilot`) showed the shape worth keeping: the user's real Chrome, one concrete tool per action, and a record of the page that got stuck. It was not on disk at `../jobpilot`, so that reading came from the public repo. Two of its habits are deliberately not copied. A worker and a brain that can both send will double-send. JSON profiles plus a WASM database rewrite lose updates when two processes save. Leadline has one sender, and one SQLite file.

## Why SQLite

`node:sqlite` is the real library, already in Node 24. WAL mode lets the web server and the MCP process write without clobbering each other. Full-text search covers the lead list. A backup is copying `data/leadline.db`. JSON files are easier to start and worse the moment two processes update an answer.

Path memory, permissions, follow-ups, encounters, and the business profile are tables. `docs/flows/` explains the work. It is not a second database.

## Teams

```
Understand   what is sold, from the setup form or from a PDF, the person's site, and social profiles that are already signed in
Discover     who might buy, from the open web and signed-in pages
Reach        drafts, approval, one send, a follow-up
Create       posts and assets, published by the person
GTM          the campaign that points at the other four
Trace        where the run stopped. It does not find people, write a note, or send
Ledger       the master's review of that crew. It does not send or change a switch
```

`src/kernel` holds the database, the next step, and the context slices. `src/browser` holds Chrome. `src/web` is the only place a person approves a send or changes a mode. Each desk screen is its own route and its own file. The rail lists every screen under Desk, Work, and Control. The front uses those same groups and shows the pipeline. `/pipeline` is that view on its own. Crew keeps the lane graph, plus the check. Every page shows a breadcrumb. `src/mcp/tools.js` is the agent's door, and it does not wrap the human-only functions. When Full power is on, Reach writes the next note and sends it, Create publishes LinkedIn and X, and Virality posts one pattern. The desk still asks before each send when Full power is off.

## One step

`next_action` returns one tool, one id, and the slice to read. Slices are cut at 6000 characters. The agent is not handed the whole history.

The order on the main lane is fixed:

1. Finish the profile.
2. Create a draft campaign. The person presses Start.
3. If a message is waiting for approval, stop.
4. If one message is allowed out, send that one and stop on a wall.
5. Otherwise draft, qualify, or search. Never all three.

Create is a separate lane. It does not sit in front of outreach. With Full power on, it publishes the LinkedIn or X draft after the words are in the box.

## Chrome

Debug Chrome uses a profile under `data/chrome-profile` and port 9333, so it does not fight Jobpilot's port 9222 or the daily browser. The flags only stop Chrome from freezing a background window. There is no stealth plugin.

When a site shows a check only because the debug port is open, the learned path is a normal window on the same profile, with the port closed, and the person passing the check. That is the Jobpilot lesson for Indeed and Glassdoor, applied here without pretending the check can be skipped.

## Follow-ups

Sending a first message inserts one empty follow-up due after the campaign's delay. It is not sent. The brain writes the body. The same gate applies. A reply, a win, or a loss cancels anything still open.

## Limits

`execute_send` can miss a send button that is only an icon. It then sends nothing and leaves the row approved, so the person can send it and press "I sent this". A click that finds an exact "Send" is treated as sent. The person can see that Chrome window. A captcha after the click does not mark the row sent.
