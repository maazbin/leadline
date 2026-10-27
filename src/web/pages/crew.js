// src/web/pages/crew.js — the crew as a graph.
//
// Owns: /crew. The graph is the lanes. The side list opens the other screens.
// Must not: send, approve, or change a mode. Does not run a new review on GET.
// Reads: agent_ledger, open stalls, and recent events.

import { agentMode, fullPower } from '../../kernel/desk.js';
import { recentEvents } from '../../kernel/events.js';
import { LEDGER_LABEL, ledgerSummary, listLedger } from '../../kernel/ledger.js';
import { clip, esc } from '../../kernel/text.js';
import { activityLine, when } from '../format.js';
import { flash, shell } from '../layout.js';
import { stallSection } from './stalls.js';

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
 * @param {ReturnType<typeof listLedger>} lanes
 * @param {boolean} power
 */
function graph(lanes, power) {
  const byAgent = new Map(lanes.map((row) => [row.agent, row]));
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
  const day = [
    ['understand', 'Understand', '/setup'],
    ['gtm', 'GTM', '/gtm'],
    ['discover', 'Discover', '/discover'],
    ['reach', 'Reach', '/reach'],
    ['trace', 'Trace', '#trace'],
  ].map((item, index) => place(item[0], item[1], item[2], 16 + index * (NODE_W + gap), 16));
  const sideX = 16 + (NODE_W + gap);
  const side = [
    ['create', 'Create', '/create'],
    ['virality', 'Virality', '/results'],
  ].map((item, index) => place(item[0], item[1], item[2], sideX + index * (NODE_W + gap), 16 + NODE_H + 48));
  return [...day, ...side];
}

/**
 * @param {ReturnType<typeof graph>} nodes
 */
function draw(nodes) {
  const day = ['understand', 'gtm', 'discover', 'reach', 'trace'];
  const at = new Map(nodes.map((item) => [item.id, item]));
  const lines = day.slice(0, -1).map((id, index) => {
    const a = at.get(id);
    const b = at.get(day[index + 1]);
    const y = a.cy;
    return `<line class="edge day" x1="${a.x + a.w + 3}" y1="${y}" x2="${b.x - 3}" y2="${y}"/>`;
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

/**
 * @param {ReturnType<typeof recentEvents>} events
 */
function activityPath(events) {
  const steps = [...events].reverse();
  if (!steps.length) return '<p class="muted">Nothing recorded yet.</p>';
  return `<ol class="activity-path">${steps.map((row, index) => `${index ? '<li class="arrow" aria-hidden="true">→</li>' : ''}<li>${esc(clip(activityLine(row), 72))}</li>`).join('')}</ol>`;
}

/**
 * @param {Record<string, string>} query
 */
export function crewPage(query) {
  const lanes = listLedger();
  const power = fullPower();
  const checked = lanes.find((row) => row.reviewedAt);
  const whenChecked = checked ? when(checked.reviewedAt) : '';
  const intro = whenChecked
    ? `The master checked the crew at ${whenChecked}. The graph is the lanes, in day order. Create and Virality sit beside that path. Plan, Questions, Persona, Trends, Results, and Tracking are in the list on the left.`
    : 'The master has not checked the crew yet. The check runs about every 20 seconds while the desk is open. The graph is the lanes. The other screens are in the list on the left.';
  const stuck = lanes.filter((row) => row.status === 'stuck');
  const stuckList = stuck.length
    ? `<ul class="log">${stuck.map((row) => `<li><strong>${esc(row.label)}</strong> — ${esc(row.detail)}</li>`).join('')}</ul>`
    : '';
  const body = `
    ${flash(query)}
    <section class="card">
      <p class="kicker">Master</p>
      <h2>The crew</h2>
      <p>${esc(intro)}</p>
      <p>${esc(ledgerSummary(lanes))}</p>
      <p class="muted">${power
        ? 'Full power is on. Reach sends an Allow message and does not wait for an approval.'
        : 'Full power is off. Reach asks before each send.'}</p>
      ${stuckList}
    </section>
    ${draw(graph(lanes, power))}
    <p class="legend"><span class="working">Working</span><span class="waiting">Waiting on you</span><span class="stuck">Needs a look</span><span class="off">Off</span><span class="paused">Paused</span></p>
    <section class="card">
      <h2>What just happened</h2>
      <p class="muted">The latest steps, oldest first. Tracking keeps the longer list.</p>
      ${activityPath(recentEvents(6))}
    </section>
    <div id="trace">${stallSection()}</div>`;
  return shell({ team: 'kernel', title: 'Crew', kicker: 'Desk', nav: 'Crew', body });
}
