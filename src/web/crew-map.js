// src/web/crew-map.js — the lane graph on the front and on Crew.
//
// Owns: the drawing of Understand, GTM, Discover, Reach, Trace, Create, and Virality.
// Must not: send, approve, or change a mode. Does not run a new review.
// Reads: agent_ledger.

import { agentMode } from '../kernel/desk.js';
import { LEDGER_LABEL, listLedger } from '../kernel/ledger.js';
import { esc } from '../kernel/text.js';

const NODE_W = 164;
const NODE_H = 76;

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
 * @param {string} id
 * @param {string} label
 * @param {string} href
 * @param {number} cx
 * @param {number} cy
 * @param {string} sub
 * @param {string} title
 * @param {string} status
 */
function node(id, label, href, cx, cy, sub, title, status) {
  return {
    id, label, href, cx, cy, sub, title, status,
    x: cx - NODE_W / 2,
    y: cy - NODE_H / 2,
    w: NODE_W,
    h: NODE_H,
  };
}

/**
 * The lanes, in day order, with Create and Virality beside that row.
 * @param {boolean} power
 */
export function crewMap(power) {
  const byAgent = new Map(listLedger().map((row) => [row.agent, row]));
  const place = (id, label, href, x, y) => {
    const row = byAgent.get(id);
    const mode = agentMode(id);
    const sub = row?.status ? (LEDGER_LABEL[row.status] || row.status) : 'Not checked';
    const title = row
      ? `${row.job} Switch: ${switchLabel(id, mode, power)}. ${row.detail}`.trim()
      : label;
    return node(id, label, href, x + NODE_W / 2, y + NODE_H / 2, sub, title, row?.status || 'room');
  };
  const gap = 24;
  const dayIds = ['understand', 'gtm', 'discover', 'reach', 'trace'];
  const day = [
    ['understand', 'Understand', '/setup'],
    ['gtm', 'GTM', '/gtm'],
    ['discover', 'Discover', '/discover'],
    ['reach', 'Reach', '/reach'],
    ['trace', 'Trace', '/crew#trace'],
  ].map((item, index) => place(item[0], item[1], item[2], 16 + index * (NODE_W + gap), 16));
  const sideX = 16 + (NODE_W + gap);
  const side = [
    ['create', 'Create', '/create'],
    ['virality', 'Virality', '/results'],
  ].map((item, index) => place(item[0], item[1], item[2], sideX + index * (NODE_W + gap), 16 + NODE_H + 48));
  const nodes = [...day, ...side];
  const at = new Map(nodes.map((item) => [item.id, item]));
  const lines = dayIds.slice(0, -1).map((id, index) => {
    const a = at.get(id);
    const b = at.get(dayIds[index + 1]);
    return `<line class="edge day" x1="${a.x + a.w + 3}" y1="${a.cy}" x2="${b.x - 3}" y2="${b.cy}"/>`;
  }).join('');
  const shapes = nodes.map((item) => `<a href="${esc(item.href)}">
      <title>${esc(item.title)}</title>
      <rect class="node ${esc(item.status)}" x="${item.x}" y="${item.y}" width="${item.w}" height="${item.h}" rx="16"/>
      <text x="${item.cx}" y="${item.cy - 6}" text-anchor="middle">${esc(item.label)}</text>
      <text class="sub" x="${item.cx}" y="${item.cy + 16}" text-anchor="middle">${esc(item.sub)}</text>
    </a>`).join('');
  const width = 16 + 5 * NODE_W + 4 * 24 + 16;
  const height = 16 + NODE_H + 48 + NODE_H + 16;
  return `<div class="crew-scroll"><svg class="crew-map" viewBox="0 0 ${width} ${height}" aria-label="Crew">${lines}${shapes}</svg></div>`;
}
