// src/web/pages/crew.js — the crew as a graph.
//
// Owns: /crew. Each node opens one screen. The day path is Understand, GTM, Discover, Reach, Trace.
// Must not: send, approve, or change a mode. Does not run a new review on GET.
// Reads: agent_ledger, open stalls, and recent events.

import { agentMode, fullPower } from '../../kernel/desk.js';
import { recentEvents } from '../../kernel/events.js';
import { LEDGER_LABEL, ledgerSummary, listLedger } from '../../kernel/ledger.js';
import { clip, esc } from '../../kernel/text.js';
import { activityLine, when } from '../format.js';
import { flash, shell } from '../layout.js';
import { stallSection } from './stalls.js';

const NODE_W = 128;
const NODE_H = 52;

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
  const lane = (id, label, href, cx, cy) => {
    const row = byAgent.get(id);
    const mode = agentMode(id);
    const sub = row?.status ? (LEDGER_LABEL[row.status] || row.status) : 'Not checked';
    const title = row
      ? `${row.job} Switch: ${switchLabel(id, mode, power)}. ${row.detail}`.trim()
      : label;
    return node(id, label, href, cx, cy, sub, title, row?.status || 'room');
  };
  const room = (id, label, href, cx, cy, sub) => node(id, label, href, cx, cy, sub, `${label}. ${sub}`, 'room');
  return [
    node('you', 'You', '/', 150, 48, 'Answer once', 'You answer once. The master does the day.', 'you'),
    node('master', 'Master', '/crew', 370, 48, 'Checks the crew', 'The coding agent. It calls one lane at a time.', 'master'),
    room('browser', 'Browser', '/browser', 640, 48, 'Chrome'),
    room('memory', 'Memory', '/learn', 850, 48, 'Walls'),
    lane('understand', 'Understand', '/setup', 100, 180),
    lane('gtm', 'GTM', '/gtm', 290, 180),
    lane('discover', 'Discover', '/discover', 480, 180),
    lane('reach', 'Reach', '/reach', 670, 180),
    lane('trace', 'Trace', '#trace', 860, 180),
    room('questions', 'Questions', '/questions', 100, 310, 'Answers'),
    room('plan', 'Plan', '/plan', 290, 310, 'Today'),
    room('trends', 'Trends', '/trends', 480, 310, 'Charts'),
    room('tracking', 'Tracking', '/tracking', 860, 310, 'Counts'),
    room('persona', 'Persona', '/persona', 100, 420, 'Who it is for'),
    lane('create', 'Create', '/create', 480, 420),
    lane('virality', 'Virality', '/results', 670, 420),
    room('results', 'Results', '/results', 860, 420, 'Worked or not'),
  ];
}

/**
 * @param {ReturnType<typeof graph>} nodes
 */
function draw(nodes) {
  const at = new Map(nodes.map((item) => [item.id, item]));
  const edges = [
    ['you', 'master', 'edge'],
    ['master', 'browser', 'edge'],
    ['master', 'memory', 'edge'],
    ['master', 'understand', 'edge hub'],
    ['master', 'gtm', 'edge hub'],
    ['master', 'discover', 'edge hub'],
    ['master', 'reach', 'edge hub'],
    ['master', 'trace', 'edge hub'],
    ['understand', 'gtm', 'edge day'],
    ['gtm', 'discover', 'edge day'],
    ['discover', 'reach', 'edge day'],
    ['reach', 'trace', 'edge day'],
    ['understand', 'questions', 'edge'],
    ['understand', 'persona', 'edge'],
    ['gtm', 'plan', 'edge'],
    ['discover', 'trends', 'edge'],
    ['reach', 'create', 'edge'],
    ['reach', 'virality', 'edge'],
    ['trace', 'tracking', 'edge'],
    ['trace', 'results', 'edge'],
  ];
  const lines = edges.map(([from, to, kind]) => {
    const a = at.get(from);
    const b = at.get(to);
    return `<line class="${kind}" x1="${a.cx}" y1="${a.cy}" x2="${b.cx}" y2="${b.cy}"/>`;
  }).join('');
  const shapes = nodes.map((item) => `<a href="${esc(item.href)}">
      <title>${esc(item.title)}</title>
      <rect class="node ${esc(item.status)}" x="${item.x}" y="${item.y}" width="${item.w}" height="${item.h}" rx="14"/>
      <text x="${item.cx}" y="${item.cy - 4}" text-anchor="middle">${esc(item.label)}</text>
      <text class="sub" x="${item.cx}" y="${item.cy + 14}" text-anchor="middle">${esc(item.sub)}</text>
    </a>`).join('');
  return `<svg class="crew-map" viewBox="0 0 980 470" aria-label="Crew">${lines}${shapes}</svg>`;
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
    ? `The master checked the crew at ${whenChecked}. Click a node to open that screen. The day runs Understand, GTM, Discover, Reach, then Trace. Create and Virality sit beside that path.`
    : 'The master has not checked the crew yet. The check runs about every 20 seconds while the desk is open. Click a node to open that screen.';
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
