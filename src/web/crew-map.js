// src/web/crew-map.js — the lane graph on Crew, and the handoff hint on each lane.
//
// Owns: the drawing, the hop list, and the one-line hint a lane shows.
// Must not: send, approve, or change a mode. Does not run a new review.
// Reads: agent_ledger.

import { agentMode } from '../kernel/desk.js';
import { LEDGER_LABEL, listLedger } from '../kernel/ledger.js';
import { clip, esc } from '../kernel/text.js';

const NODE_W = 168;
const NODE_H = 104;
const GAP = 96;
const PAD = 24;

/** What each lane hands to the next. The short word is the label on the line. */
const HOPS = [
  { from: 'understand', to: 'gtm', what: 'the profile', short: 'profile', kind: 'day' },
  { from: 'gtm', to: 'discover', what: 'who to find', short: 'who to find', kind: 'day' },
  { from: 'discover', to: 'reach', what: 'who fits', short: 'who fits', kind: 'day' },
  { from: 'reach', to: 'trace', what: 'where it stuck', short: 'stuck', kind: 'day' },
  { from: 'gtm', to: 'create', what: 'the campaign', short: 'campaign', kind: 'hub' },
  { from: 'gtm', to: 'virality', what: 'one pattern', short: 'one pattern', kind: 'hub' },
];

const PLACE = {
  understand: ['Understand', '/setup'],
  gtm: ['GTM', '/gtm'],
  discover: ['Discover', '/discover'],
  reach: ['Reach', '/reach'],
  trace: ['Trace', '/crew#trace'],
  create: ['Create', '/create'],
  virality: ['Virality', '/results'],
};

/**
 * @param {string} agent
 * @param {string} mode
 * @param {boolean} power
 */
function switchLabel(agent, mode, power) {
  if (agent === 'reach' && power && mode !== 'off') return 'Sends without asking';
  if (mode === 'off') return 'Off';
  if (mode === 'draft') return 'Prepare';
  if (mode === 'approve') return 'Ask first';
  if (mode === 'auto') return 'On';
  return mode;
}

/**
 * @param {string} detail
 */
function shortHint(detail) {
  const text = String(detail || '').replace(/\s+/g, ' ').trim();
  if (!text) return 'Not checked yet';
  if (text.length <= 34) return text;
  const cut = text.slice(0, 34);
  const space = cut.lastIndexOf(' ');
  return `${(space > 16 ? cut.slice(0, space) : cut).trim()}…`;
}

/**
 * @param {string} id
 * @param {string} label
 * @param {string} href
 * @param {number} cx
 * @param {number} cy
 * @param {string} sub
 * @param {string} hint
 * @param {string} title
 * @param {string} status
 */
function node(id, label, href, cx, cy, sub, hint, title, status) {
  return {
    id, label, href, cx, cy, sub, hint, title, status,
    x: cx - NODE_W / 2,
    y: cy - NODE_H / 2,
    w: NODE_W,
    h: NODE_H,
  };
}

/**
 * @param {ReturnType<typeof node>} from
 * @param {ReturnType<typeof node>} to
 * @param {string} label
 * @param {string} kind
 */
function edge(from, to, label, kind) {
  const horizontal = Math.abs(from.cy - to.cy) < 8;
  const x1 = horizontal ? from.x + from.w + 4 : from.cx;
  const y1 = horizontal ? from.cy : from.y + from.h + 4;
  const x2 = horizontal ? to.x - 4 : to.cx;
  const y2 = horizontal ? to.cy : to.y - 4;
  const lx = horizontal ? (x1 + x2) / 2 : (x1 + x2) / 2;
  const ly = horizontal ? y1 - 10 : (y1 + y2) / 2 - 8;
  return `<line class="edge ${esc(kind)}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>
    <text class="edge-label" x="${lx}" y="${ly}" text-anchor="middle">${esc(label)}</text>`;
}

/**
 * The lanes, in day order, with Create and Virality fed by GTM.
 * @param {boolean} power
 */
export function crewMap(power) {
  const byAgent = new Map(listLedger().map((row) => [row.agent, row]));
  const place = (id, label, href, x, y) => {
    const row = byAgent.get(id);
    const mode = agentMode(id);
    const sub = row?.status ? (LEDGER_LABEL[row.status] || row.status) : 'Not checked';
    const hint = shortHint(row?.detail || '');
    const title = row
      ? `${row.job} Switch: ${switchLabel(id, mode, power)}. ${row.detail}`.trim()
      : label;
    return node(id, label, href, x + NODE_W / 2, y + NODE_H / 2, sub, hint, title, row?.status || 'room');
  };
  const dayY = 36;
  const day = [
    ['understand', 'Understand', '/setup'],
    ['gtm', 'GTM', '/gtm'],
    ['discover', 'Discover', '/discover'],
    ['reach', 'Reach', '/reach'],
    ['trace', 'Trace', '/crew#trace'],
  ].map((item, index) => place(item[0], item[1], item[2], PAD + index * (NODE_W + GAP), dayY));
  const sideY = dayY + NODE_H + 72;
  const gtmX = PAD + (NODE_W + GAP);
  const side = [
    ['create', 'Create', '/create'],
    ['virality', 'Virality', '/results'],
  ].map((item, index) => place(item[0], item[1], item[2], gtmX + index * (NODE_W + GAP), sideY));
  const nodes = [...day, ...side];
  const at = new Map(nodes.map((item) => [item.id, item]));
  const lines = HOPS.map((hop) => edge(at.get(hop.from), at.get(hop.to), hop.short, hop.kind)).join('');
  const shapes = nodes.map((item) => `<a href="${esc(item.href)}">
      <title>${esc(item.title)}</title>
      <rect class="node ${esc(item.status)}" x="${item.x}" y="${item.y}" width="${item.w}" height="${item.h}" rx="16"/>
      <text x="${item.cx}" y="${item.cy - 22}" text-anchor="middle">${esc(item.label)}</text>
      <text class="sub" x="${item.cx}" y="${item.cy}" text-anchor="middle">${esc(item.sub)}</text>
      <text class="hint" x="${item.cx}" y="${item.cy + 22}" text-anchor="middle">${esc(item.hint)}</text>
    </a>`).join('');
  const width = PAD + 5 * NODE_W + 4 * GAP + PAD;
  const height = sideY + NODE_H + PAD;
  return `<div class="crew-scroll"><svg class="crew-map" viewBox="0 0 ${width} ${height}" aria-label="Crew">${lines}${shapes}</svg></div>`;
}

/** The same handoffs, in words, with the last check on the lane that hands something on. */
export function crewHops() {
  const byAgent = new Map(listLedger().map((row) => [row.agent, row]));
  const items = HOPS.map((hop) => {
    const from = PLACE[hop.from];
    const to = PLACE[hop.to];
    const detail = byAgent.get(hop.from)?.detail || 'Not checked yet.';
    return `<li><a href="${esc(from[1])}">${esc(from[0])}</a> hands ${esc(hop.what)} to <a href="${esc(to[1])}">${esc(to[0])}</a>. <span class="muted">${esc(clip(detail, 160))}</span></li>`;
  });
  items.push('<li>Reach also reads the campaign for the words. Trace records the stop and does not send.</li>');
  return `<ul class="hops">${items.join('')}</ul>`;
}

/**
 * One line on a lane screen: what it reads, what it hands on, and the last check.
 * @param {string} id
 */
export function laneHint(id) {
  const here = PLACE[id];
  if (!here) return '';
  const row = listLedger().find((item) => item.agent === id);
  const inn = HOPS.filter((hop) => hop.to === id);
  const out = HOPS.filter((hop) => hop.from === id);
  const read = inn.length
    ? `Reads ${inn.map((hop) => `${esc(hop.what)} from <a href="${esc(PLACE[hop.from][1])}">${esc(PLACE[hop.from][0])}</a>`).join(' and ')}.`
    : 'This lane starts the day.';
  const hand = out.length
    ? ` Hands ${out.map((hop) => `${esc(hop.what)} to <a href="${esc(PLACE[hop.to][1])}">${esc(PLACE[hop.to][0])}</a>`).join(', ')}.`
    : '';
  const also = id === 'reach' ? ' The note also uses the campaign.' : '';
  const quiet = id === 'trace' ? ' Trace does not send.' : '';
  const detail = row?.detail ? ` ${esc(clip(row.detail, 180))}` : '';
  return `<p class="lane-hint">${read}${hand}${also}${quiet}${detail} <a href="/crew">Crew graph</a>.</p>`;
}
