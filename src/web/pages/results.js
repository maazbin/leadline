// src/web/pages/results.js — what worked and what did not.
//
// Owns: /results.
// Must not: write a verdict. Memory is where a step is marked wrong.
// Reads: strategies, paths, and message tallies.

import { esc } from '../../kernel/text.js';
import { resultBoard } from '../../kernel/tracking.js';
import { stat } from '../format.js';
import { flash, shell } from '../layout.js';

/**
 * @param {Array<Record<string, unknown>>} rows
 * @param {string} empty
 */
function stepList(rows, empty) {
  if (!rows.length) return `<p class="muted">${esc(empty)}</p>`;
  return `<ul class="log">${rows.map((row) => `<li><strong>${esc(row.platform)}</strong> — ${esc(row.step)}${row.evidence || row.human_note ? `<br><span class="muted">${esc(row.evidence || row.human_note)}</span>` : ''}</li>`).join('')}</ul>`;
}

/**
 * @param {string} label
 * @param {number} n
 * @param {Record<string, number>} all
 */
function meter(label, n, all) {
  const max = Math.max(1, ...Object.values(all).map(Number));
  const width = Math.round((n / max) * 100);
  return `<span class="meter"><span>${esc(label)}</span><span class="meter-track"><span style="width:${width}%"></span></span><strong>${n}</strong></span>`;
}

/**
 * @param {Record<string, string>} query
 */
export function resultsPage(query) {
  const board = resultBoard();
  const worked = board.strategies.filter((row) => row.result === 'worked' && row.human_verdict !== 'wrong');
  const failed = board.strategies.filter((row) => row.result === 'failed' || row.human_verdict === 'wrong');
  const untried = board.strategies.filter((row) => row.result === 'open' && row.human_verdict !== 'wrong');
  const pathCount = Object.fromEntries(board.paths.map((row) => [row.outcome, Number(row.n)]));
  const messageCount = Object.fromEntries(board.messages.map((row) => [row.status, Number(row.n)]));
  const body = `
    ${flash(query)}
    <section class="statgrid">
      ${stat('Worked', worked.length)}
      ${stat('Did not work', failed.length)}
      ${stat('Not tried', untried.length)}
      ${stat('Sent', messageCount.sent || 0)}
    </section>
    <section class="grid">
      <article class="card">
        <h2>What worked</h2>
        ${stepList(worked, 'Nothing has worked yet. A step lands here after a real attempt that succeeded.')}
      </article>
      <article class="card">
        <h2>What did not work</h2>
        ${stepList(failed, 'Nothing has failed yet. A failed step, or one you mark wrong, lands here.')}
      </article>
    </section>
    <section class="card">
      <h2>Paths and messages</h2>
      <p>${meter('Reached', pathCount.reached || 0, pathCount)} ${meter('Success', pathCount.success || 0, pathCount)} ${meter('Stopped', pathCount.stop || 0, pathCount)} ${meter('Refused', pathCount.refused || 0, pathCount)}</p>
      <p class="muted">Messages: ${messageCount.sent || 0} sent, ${messageCount.failed || 0} failed, ${messageCount.cancelled || 0} cancelled, ${(messageCount.draft || 0) + (messageCount.awaiting_approval || 0)} still drafts. ${untried.length} playbook steps are still untried. <a href="/learn">Open memory</a>.</p>
    </section>`;
  return shell({ team: 'kernel', title: 'Results', kicker: 'Desk', nav: 'Results', body });
}
