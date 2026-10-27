// src/web/styles.js — the control-plane stylesheet.
//
// Owns: layout and color. Team color is a rail mark, not a decoration on every card.
// Must not: read the database. Pages pass data in, this file returns CSS.

export const CSS = `
:root {
  --bg: #12140f;
  --rail: #0c0e0a;
  --card: #1b1f17;
  --card-2: #23281e;
  --line: #343b2d;
  --text: #f3f1e7;
  --muted: #b4b09f;
  --understand: #8eb6ff;
  --discover: #7dcea0;
  --reach: #e0a15a;
  --create: #c7b4f5;
  --gtm: #e6c15a;
  --kernel: #d7d2c4;
  --bad: #e07a62;
  --good: #8fce8f;
  --shadow: 0 16px 40px rgba(0, 0, 0, 0.28);
  font-family: "Segoe UI", "Aptos", sans-serif;
  color: var(--text);
  background: var(--bg);
}
* { box-sizing: border-box; }
body { margin: 0; min-height: 100vh; }
a { color: inherit; }
button, input, textarea, select { font: inherit; color: inherit; }
.app { display: grid; grid-template-columns: 232px 1fr; min-height: 100vh; }
.rail {
  background: var(--rail);
  border-right: 1px solid var(--line);
  padding: 22px 16px;
  display: flex;
  flex-direction: column;
  gap: 18px;
}
.brand { font-family: Georgia, "Iowan Old Style", serif; font-size: 28px; letter-spacing: -0.03em; }
.brand small { display: block; margin-top: 4px; color: var(--muted); font-family: "Segoe UI", sans-serif; font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; }
nav { display: flex; flex-direction: column; gap: 2px; }
nav a {
  text-decoration: none;
  padding: 8px 10px;
  border-radius: 8px;
  color: var(--muted);
}
nav a.active { color: var(--text); background: var(--card); }
nav a[data-team="understand"].active { box-shadow: inset 3px 0 0 var(--understand); }
nav a[data-team="discover"].active { box-shadow: inset 3px 0 0 var(--discover); }
nav a[data-team="reach"].active { box-shadow: inset 3px 0 0 var(--reach); }
nav a[data-team="create"].active { box-shadow: inset 3px 0 0 var(--create); }
nav a[data-team="gtm"].active { box-shadow: inset 3px 0 0 var(--gtm); }
nav a[data-team="kernel"].active { box-shadow: inset 3px 0 0 var(--kernel); }
.rail p { color: var(--muted); font-size: 13px; line-height: 1.45; margin-top: auto; }
main { padding: 28px 32px 64px; max-width: 1080px; }
.top { display: flex; justify-content: space-between; gap: 16px; align-items: flex-end; margin-bottom: 22px; }
.kicker { margin: 0 0 6px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.12em; font-size: 12px; }
h1, h2 { font-family: Georgia, "Iowan Old Style", serif; font-weight: 500; letter-spacing: -0.03em; }
h1 { margin: 0; font-size: 40px; }
h2 { margin: 0 0 12px; font-size: 26px; }
.flow {
  border: 1px solid var(--line);
  background: var(--card);
  border-radius: 999px;
  padding: 8px 14px;
  color: var(--muted);
  font-size: 13px;
  max-width: 320px;
}
.banner { padding: 12px 14px; border-radius: 10px; margin: 0 0 16px; }
.banner.bad { background: #3a221c; color: #ffd2c8; }
.banner.good { background: #1d3324; color: #d5f5d8; }
.grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.grid5 { display: grid; grid-template-columns: repeat(5, 1fr); gap: 12px; margin: 16px 0 22px; }
.team, .card, .next {
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: 16px;
  padding: 16px;
}
.team { text-decoration: none; display: flex; flex-direction: column; gap: 6px; min-height: 140px; }
.team .stat { font-family: Georgia, serif; font-size: 28px; }
.team[data-team="understand"] .stat { color: var(--understand); }
.team[data-team="discover"] .stat { color: var(--discover); }
.team[data-team="reach"] .stat { color: var(--reach); }
.team[data-team="create"] .stat { color: var(--create); }
.team[data-team="gtm"] .stat { color: var(--gtm); }
.team span:last-child, .muted { color: var(--muted); }
.next { box-shadow: var(--shadow); margin-bottom: 16px; }
.next p { line-height: 1.5; }
.row { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
.field { display: flex; flex-direction: column; gap: 6px; margin-bottom: 12px; }
.field span { font-size: 13px; color: var(--muted); }
.field i { color: var(--reach); font-style: normal; }
input, textarea, select {
  background: var(--card-2);
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 10px 12px;
}
textarea { resize: vertical; min-height: 90px; }
.button, button {
  background: var(--reach);
  color: #1a1208;
  border: 0;
  border-radius: 999px;
  padding: 9px 14px;
  text-decoration: none;
  cursor: pointer;
  font-weight: 650;
}
.button.quiet, button.quiet { background: transparent; color: var(--text); border: 1px solid var(--line); }
.checks { display: flex; flex-wrap: wrap; gap: 10px 16px; margin: 8px 0 14px; }
.checks label { display: flex; gap: 6px; align-items: center; }
table { width: 100%; border-collapse: collapse; }
th, td { text-align: left; padding: 8px 6px; border-bottom: 1px solid var(--line); vertical-align: top; font-size: 14px; }
th { color: var(--muted); font-weight: 550; }
.chip { display: inline-block; border: 1px solid var(--line); border-radius: 999px; padding: 2px 8px; font-size: 12px; color: var(--muted); }
pre.preview {
  white-space: pre-wrap;
  background: var(--card-2);
  border-radius: 12px;
  padding: 12px;
  min-height: 72px;
  color: var(--muted);
}
.log { list-style: none; padding: 0; margin: 0; }
.log li { padding: 8px 0; border-bottom: 1px solid var(--line); }
.split { display: grid; grid-template-columns: 1.1fr 0.9fr; gap: 16px; }
.status { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-bottom: 16px; }
.pill { border: 1px solid var(--line); border-radius: 999px; padding: 6px 12px; color: var(--muted); font-size: 13px; }
.pill.on { color: #1a1208; background: var(--reach); border-color: var(--reach); }
.stats { margin-bottom: 16px; }
.statbox { background: var(--card); border: 1px solid var(--line); border-radius: 16px; padding: 14px 16px; display: flex; flex-direction: column; gap: 4px; }
.statbox .stat { font-family: "Segoe UI", sans-serif; font-size: 32px; font-weight: 650; font-variant-numeric: lining-nums; }
.recs { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 8px; }
.rec a { text-decoration: none; display: block; padding: 10px 12px; border-radius: 12px; background: var(--card-2); line-height: 1.45; }
.rec.now a { box-shadow: inset 3px 0 0 var(--reach); }
.rec.learn a { box-shadow: inset 3px 0 0 var(--understand); }
.rec.keep a { box-shadow: inset 3px 0 0 var(--discover); }
.powerbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 20px;
  margin: 0 0 20px;
  padding: 18px 20px;
  border-radius: 16px;
  border: 2px solid var(--reach);
  background: #2c2418;
}
.powerbar.on { border-color: var(--good); background: #17261b; }
.powerbar h2 { margin: 0 0 4px; font-size: 32px; }
.powerbar p { margin: 0; color: var(--muted); max-width: 62ch; line-height: 1.45; }
.powerbar button { font-size: 18px; padding: 14px 22px; white-space: nowrap; }
.powerbar.on button { background: transparent; color: var(--text); border: 1px solid var(--line); }
.switches { display: grid; grid-template-columns: 1fr; gap: 10px; margin: 12px 0; }
.switch { display: grid; grid-template-columns: 22px 1fr; gap: 12px; align-items: start; padding: 12px; border: 1px solid var(--line); border-radius: 14px; background: var(--card-2); }
.switch strong { display: block; font-size: 18px; }
.switch small, .lane p { color: var(--muted); }
.lanes { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.lane, .play { border: 1px solid var(--line); border-radius: 14px; padding: 12px; margin-bottom: 10px; background: var(--card-2); }
.radios { display: flex; flex-wrap: wrap; gap: 8px; }
.radio { display: flex; gap: 6px; align-items: center; padding: 6px 8px; border-radius: 999px; border: 1px solid var(--line); }
.platform { display: grid; grid-template-columns: 1.2fr 1.4fr 110px; gap: 12px; align-items: center; padding: 12px 0; border-bottom: 1px solid var(--line); }
.cap { display: flex; flex-direction: column; gap: 4px; color: var(--muted); font-size: 13px; }
.answer { margin-bottom: 12px; }
@media (max-width: 980px) {
  .app { grid-template-columns: 1fr; }
  .rail { border-right: 0; border-bottom: 1px solid var(--line); }
  .grid, .grid5, .split, .lanes, .platform, .powerbar { grid-template-columns: 1fr; }
  .powerbar { flex-direction: column; align-items: stretch; }
  .powerbar h2 { font-size: 28px; }
  main { padding: 20px 16px 48px; }
  h1 { font-size: 32px; }
}
`;
