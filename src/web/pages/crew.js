// src/web/pages/crew.js — the crew as a graph.
//
// Owns: /crew. The graph is the lanes and the handoff on each line. The front shows the pipeline and a door for every screen.
// Must not: send, approve, or change a mode. Does not run a new review on GET.
// Reads: agent_ledger, open stalls, and recent events.

import { fullPower } from '../../kernel/desk.js';
import { recentEvents } from '../../kernel/events.js';
import { ledgerSummary, listLedger } from '../../kernel/ledger.js';
import { clip, esc } from '../../kernel/text.js';
import { crewHops, crewMap, laneHint } from '../crew-map.js';
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
    ? `The master checked the crew at ${whenChecked}. Create and Virality take the campaign from GTM. Fix takes the stop from Trace. The lines name what crosses.`
    : 'The master has not checked the crew yet. The check runs about every 20 seconds while the desk is open. Fix takes the stop from Trace. The lines name what crosses.';
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
    <p class="muted">Each line is a handoff. The word on the line is what crosses. The small line in the box is the last check.</p>
    ${crewMap(power)}
    <p class="legend"><span class="working">Working</span><span class="waiting">Waiting on you</span><span class="stuck">Needs a look</span><span class="off">Off</span><span class="paused">Paused</span></p>
    <section class="card">
      <h2>What crosses</h2>
      ${crewHops()}
    </section>
    <section class="card">
      <h2>What just happened</h2>
      <p class="muted">The latest steps, oldest first. Tracking keeps the longer list.</p>
      ${activityPath(recentEvents(6))}
    </section>
    <div id="trace">${laneHint('trace')}${stallSection()}</div>`;
  return shell({ team: 'kernel', title: 'Crew', kicker: 'Desk', nav: 'Crew', body });
}
