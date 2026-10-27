// src/web/pages/pipeline.js — the day as a pipeline.
//
// Owns: /pipeline, and the same pipeline on Today.
// Must not: send, approve, or change a mode. Does not run a new review.
// Reads: the ledger, counts, the profile, the campaign, and open stalls.

import { newestCampaign } from '../../gtm/campaigns.js';
import { dashboard } from '../../kernel/stats.js';
import { LEDGER_LABEL, listLedger } from '../../kernel/ledger.js';
import { clip, esc } from '../../kernel/text.js';
import { listStalls } from '../../trace/stalls.js';
import { profileGaps } from '../../understand/profile.js';
import { flash, shell } from '../layout.js';

const CAMPAIGN_WORD = { draft: 'Draft', active: 'On', paused: 'Paused', done: 'Done' };

/**
 * @param {Record<string, { status: string, label: string, detail: string, job: string }>} byAgent
 * @param {string} id
 * @param {string} href
 * @param {string} count
 * @param {string} line
 * @param {number} [index]
 */
function card(byAgent, id, href, count, line, index) {
  const row = byAgent[id];
  const status = row?.status || 'room';
  const word = row?.status ? (LEDGER_LABEL[row.status] || row.status) : 'Not checked';
  const step = index ? `<span class="stage-index">${index}</span>` : '';
  return `<a class="stage ${esc(status)}" href="${esc(href)}">
    ${step}
    <span class="kicker">${esc(word)}</span>
    <strong>${esc(row?.label || id)}</strong>
    <span class="stage-count">${esc(count)}</span>
    <span class="stage-line">${esc(clip(line, 140))}</span>
  </a>`;
}

/** The day, left to right, with Create and Virality beside it. */
export function pipelineView() {
  const byAgent = Object.fromEntries(listLedger().map((row) => [row.agent, row]));
  const counts = dashboard();
  const gaps = profileGaps();
  const campaign = newestCampaign();
  const stalls = listStalls('open');
  const openNotes = counts.drafts + counts.waiting;
  const campaignWord = campaign ? (CAMPAIGN_WORD[String(campaign.status)] || String(campaign.status)) : '';
  const day = [
    card(byAgent, 'understand', '/setup', gaps.length ? `${gaps.length} still needed` : 'Ready', gaps.length ? `Still needed: ${gaps.join(', ')}.` : 'The profile can draft a campaign.', 1),
    card(byAgent, 'gtm', '/gtm', campaign ? campaignWord : 'None', campaign ? String(campaign.name || 'Campaign') : 'No campaign yet.', 2),
    card(byAgent, 'discover', '/discover', `${counts.qualified} fit`, `${counts.leads} people on the list. ${counts.unreviewed} still unreviewed.`, 3),
    card(byAgent, 'reach', '/reach', `${openNotes} open`, `${counts.sent} sent. ${counts.waiting} waiting on an approval.`, 4),
    card(byAgent, 'trace', '/crew#trace', stalls.length ? `${stalls.length} stuck` : 'Clear', stalls.length ? stalls[0].detail : 'Nothing is stuck.', 5),
  ];
  const flow = day.map((html, index) => `${index ? '<li class="pipe" aria-hidden="true">→</li>' : ''}<li>${html}</li>`).join('');
  const beside = [
    card(byAgent, 'create', '/create', `${counts.content} drafts`, 'Posts wait for you to publish.'),
    card(byAgent, 'virality', '/results', 'Beside the day', 'Tries one pattern. It does not post.'),
  ].join('');
  return `<ol class="pipeline" aria-label="Pipeline">${flow}</ol>
    <div class="beside">
      <p class="muted">Beside the day. These do not send.</p>
      <div class="beside-row">${beside}</div>
    </div>`;
}

/**
 * @param {Record<string, string>} query
 */
export function pipelinePage(query) {
  const body = `
    ${flash(query)}
    <p>The day moves from left to right. Open a stage to work there.</p>
    ${pipelineView()}
    <p class="legend"><span class="working">Working</span><span class="waiting">Waiting on you</span><span class="stuck">Needs a look</span><span class="off">Off</span><span class="paused">Paused</span></p>
    <p><a href="/crew">Open the crew graph</a></p>`;
  return shell({ team: 'kernel', title: 'Pipeline', kicker: 'Desk', nav: 'Pipeline', body });
}
