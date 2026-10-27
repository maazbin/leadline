// src/web/pages/crew.js — the crew as a graph.
//
// Owns: /crew. The graph is the lanes. The front shows the same graph and a door for every screen.
// Must not: send, approve, or change a mode. Does not run a new review on GET.
// Reads: agent_ledger, open stalls, and recent events.

import { fullPower } from '../../kernel/desk.js';
import { recentEvents } from '../../kernel/events.js';
import { ledgerSummary, listLedger } from '../../kernel/ledger.js';
import { clip, esc } from '../../kernel/text.js';
import { crewMap } from '../crew-map.js';
import { activityLine, when } from '../format.js';
import { flash, shell } from '../layout.js';
import { stallSection } from './stalls.js';

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
    ? `The master checked the crew at ${whenChecked}. The same graph is on the front. Create and Virality sit beside the day. The other screens are on the front, and in the list.`
    : 'The master has not checked the crew yet. The check runs about every 20 seconds while the desk is open. The same graph is on the front.';
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
    ${crewMap(power)}
    <p class="legend"><span class="working">Working</span><span class="waiting">Waiting on you</span><span class="stuck">Needs a look</span><span class="off">Off</span><span class="paused">Paused</span></p>
    <section class="card">
      <h2>What just happened</h2>
      <p class="muted">The latest steps, oldest first. Tracking keeps the longer list.</p>
      ${activityPath(recentEvents(6))}
    </section>
    <div id="trace">${stallSection()}</div>`;
  return shell({ team: 'kernel', title: 'Crew', kicker: 'Desk', nav: 'Crew', body });
}
