// src/web/pages/crew.js — the agent monitoring screen.
//
// Owns: /crew. One card per lane from the last master review.
// Must not: send, approve, or change a mode. Does not run a new review on GET.
// Reads: agent_ledger and open stalls.

import { agentMode, fullPower } from '../../kernel/desk.js';
import { LEDGER_LABEL, ledgerSummary, listLedger } from '../../kernel/ledger.js';
import { esc } from '../../kernel/text.js';
import { when } from '../format.js';
import { flash, shell } from '../layout.js';
import { stallSection } from './stalls.js';

/**
 * @param {string} mode
 * @param {boolean} power
 * @param {string} agent
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
 * @param {Record<string, string>} query
 */
export function crewPage(query) {
  const lanes = listLedger();
  const power = fullPower();
  const checked = lanes.find((row) => row.reviewedAt);
  const whenChecked = checked ? when(checked.reviewedAt) : '';
  const intro = whenChecked
    ? `The master checked the crew at ${whenChecked}. Required lanes are Understand, Discover, GTM, Reach, and Trace. Create and Virality may stay off.`
    : 'The master has not checked the crew yet. The check runs about every 20 seconds while the desk is open.';
  const cards = lanes.filter((row) => row.status).map((row) => {
    const mode = agentMode(row.agent);
    return `<article class="card">
        <p class="kicker">${esc(LEDGER_LABEL[row.status] || row.status)}${row.required ? ' · Required' : ''}</p>
        <h2>${esc(row.label)}</h2>
        <p>${esc(row.detail)}</p>
        <p class="muted">${esc(row.job)} Switch: ${esc(switchLabel(row.agent, mode, power))}.</p>
      </article>`;
  }).join('');
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
    </section>
    ${cards ? `<section class="grid">${cards}</section>` : ''}
    ${stallSection()}`;
  return shell({ team: 'kernel', title: 'Agents', kicker: 'Desk', nav: 'Agents', body });
}
