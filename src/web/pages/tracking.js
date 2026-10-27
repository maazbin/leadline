// src/web/pages/tracking.js — counts, platforms, and the activity log.
//
// Owns: /tracking.
// Must not: send or change a mode.
// Reads: tallies, the scoreboard, and recent events.

import { scoreboard } from '../../kernel/brief.js';
import { listEvents } from '../../kernel/events.js';
import { dashboard } from '../../kernel/stats.js';
import { esc } from '../../kernel/text.js';
import { resultBoard } from '../../kernel/tracking.js';
import { activityLine, stat, when } from '../format.js';
import { flash, shell } from '../layout.js';
import { stallSection } from './stalls.js';

/**
 * @param {Record<string, string>} query
 */
export function trackingPage(query) {
  const counts = dashboard();
  const board = scoreboard();
  const leads = resultBoard().leads;
  const events = listEvents(40);
  const leadLine = leads.length
    ? leads.map((row) => `${row.n} ${row.fit} / ${row.status}`).join(', ')
    : 'No leads yet';
  const body = `
    ${flash(query)}
    <section class="statgrid">
      ${stat('Leads', counts.leads)}
      ${stat('Qualified', counts.qualified)}
      ${stat('Drafts', counts.drafts)}
      ${stat('Waiting', counts.waiting)}
      ${stat('Sent', counts.sent)}
      ${stat('Open questions', counts.questions)}
      ${stat('Campaigns', counts.campaigns)}
      ${stat('Stuck pages', counts.encounters)}
    </section>
    ${stallSection()}
    <section class="card">
      <h2>Platforms today</h2>
      <table>
        <thead><tr><th>Platform</th><th>Now</th><th>Sent today</th><th>Cap</th><th>Next step</th></tr></thead>
        <tbody>${board.map((row) => `<tr>
          <td>${esc(row.label)}</td>
          <td>${esc(row.plain)}</td>
          <td>${row.sent}</td>
          <td>${row.cap}</td>
          <td>${row.step ? esc(row.step) : '<span class="muted">No open step</span>'}</td>
        </tr>`).join('')}</tbody>
      </table>
      <p class="muted">Leads: ${esc(leadLine)}. <a href="/crew">Open Agents</a> for the lane check.</p>
    </section>
    <section class="card">
      <h2>Activity</h2>
      ${events.length ? `<table>
        <thead><tr><th>When</th><th>What</th></tr></thead>
        <tbody>${events.map((row) => `<tr><td>${esc(when(row.at))}</td><td>${esc(activityLine(row))}</td></tr>`).join('')}</tbody>
      </table>` : '<p class="muted">Nothing recorded yet.</p>'}
    </section>`;
  return shell({ team: 'kernel', title: 'Tracking', kicker: 'Desk', nav: 'Tracking', body });
}
