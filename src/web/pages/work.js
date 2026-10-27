// src/web/pages/work.js — Discover, Reach, Create, and GTM.
//
// Owns: the four team pages and the form posts that stay inside those teams.
// Must not: let a form skip the send gate. Approve and I sent this call the same checks as the tools.
// Writes: leads, messages, content_drafts, campaigns, through those modules.

import { CHANNEL_IDS } from '../../kernel/enums.js';
import { esc } from '../../kernel/text.js';
import { saveContent, listContent, setContentStatus } from '../../create/drafts.js';
import { listLeads, saveLead, setFit, setLeadOutcome } from '../../discover/leads.js';
import { redditPublicSearch } from '../../discover/reddit.js';
import { channelHome, discoverHints } from '../../discover/sources.js';
import { campaignView, createCampaign, listCampaigns, setCampaignStatus } from '../../gtm/campaigns.js';
import { profileGaps } from '../../understand/profile.js';
import { canSend, channelMode } from '../../reach/gate.js';
import { approveMessage, cancelMessage, markSent } from '../../reach/messages.js';
import { listMessages } from '../../reach/rows.js';
import { openUrl } from '../../browser/act.js';
import { ERRORS } from '../copy.js';
import { many, redirect } from '../http.js';
import { field, flash, shell } from '../layout.js';

/**
 * @param {Record<string, string>} query
 * @param {{ reddit?: Record<string, unknown>, redditQuery?: string }} [extra]
 */
export function discoverPage(query, extra = {}) {
  const ready = profileGaps().length === 0;
  const hints = ready ? discoverHints() : { queries: [], urls: [] };
  const leads = listLeads({ limit: 25 });
  const reddit = extra.reddit;
  const redditBlock = !reddit ? '' : reddit.ok
    ? (reddit.candidates || []).map((row) => `
        <form method="post" action="/discover/save" class="card">
          <strong>${esc(row.name || row.handle || 'Reddit')}</strong>
          <p>${esc(row.snippet)}</p>
          <p class="muted">${esc(row.source_url)}</p>
          <input type="hidden" name="source" value="reddit">
          <input type="hidden" name="source_url" value="${esc(row.source_url)}">
          <input type="hidden" name="name" value="${esc(row.name)}">
          <input type="hidden" name="handle" value="${esc(row.handle)}">
          <input type="hidden" name="company" value="${esc(row.company)}">
          <input type="hidden" name="snippet" value="${esc(row.snippet)}">
          <button type="submit">Save as a lead</button>
        </form>`).join('') || '<p class="muted">No public posts came back.</p>'
    : `<p class="banner bad">${esc(reddit.detail || ERRORS[reddit.code] || reddit.code)}</p>`;

  const body = `
    ${flash(query)}
    <div class="split">
      <section class="card">
        <h2>Where to look</h2>
        ${ready ? '' : '<p class="muted">Finish Understand first. Hints use the offer and the audience.</p>'}
        ${hints.urls.length ? `<ul class="log">${hints.urls.map((item) => `<li><span class="chip">${esc(item.source)}</span> <a href="${esc(item.url)}">${esc(item.query)}</a></li>`).join('')}</ul>` : '<p class="muted">No hints yet.</p>'}
        <form method="post" action="/discover/reddit">
          ${field('Reddit public search', 'query', extra.redditQuery || '', { hint: 'Saves nothing by itself. You choose what becomes a lead.' })}
          <button type="submit" class="quiet">Search Reddit</button>
        </form>
        ${redditBlock}
      </section>
      <form method="post" action="/discover/save" class="card">
        <h2>Add someone</h2>
        <label class="field"><span>Source</span><select name="source">${['web', ...CHANNEL_IDS].map((id) => `<option>${id}</option>`).join('')}</select></label>
        ${field('Page URL', 'source_url', '', { required: true })}
        ${field('Name', 'name', '')}
        ${field('Company', 'company', '')}
        ${field('Role', 'role', '')}
        ${field('Email', 'email', '')}
        ${field('Handle', 'handle', '')}
        ${field('Why they are here', 'snippet', '', { multiline: true })}
        <label class="field"><span>Fit</span><select name="fit"><option>unreviewed</option><option>yes</option><option>maybe</option><option>no</option></select></label>
        ${field('Reason', 'fit_reason', '')}
        <button type="submit">Save lead</button>
      </form>
    </div>
    <section class="card">
      <h2>Leads</h2>
      ${leads.length ? `<table><thead><tr><th>Who</th><th>Fit</th><th></th></tr></thead><tbody>
        ${leads.map((lead) => `<tr>
          <td><strong>${esc(lead.name || lead.handle || lead.email || 'Unknown')}</strong><br>
            <span class="muted">${esc(lead.company)} · ${esc(lead.source)}</span><br>
            <span class="muted">${esc(String(lead.snippet || '').slice(0, 140))}</span></td>
          <td><span class="chip">${esc(lead.fit)}</span> <span class="chip">${esc(lead.status)}</span><br>${esc(lead.fit_reason)}</td>
          <td>
            <form method="post" action="/discover/fit" class="row">
              <input type="hidden" name="id" value="${lead.id}">
              <select name="fit">${['unreviewed', 'yes', 'maybe', 'no'].map((fit) => `<option ${lead.fit === fit ? 'selected' : ''}>${fit}</option>`).join('')}</select>
              <input name="reason" value="${esc(lead.fit_reason)}" placeholder="Why">
              <button type="submit" class="quiet">Save</button>
            </form>
            <form method="post" action="/discover/outcome" class="row">
              <input type="hidden" name="id" value="${lead.id}">
              <select name="status"><option>replied</option><option>won</option><option>lost</option></select>
              <button type="submit" class="quiet">Close</button>
            </form>
          </td>
        </tr>`).join('')}
      </tbody></table>` : '<p class="muted">No leads yet.</p>'}
    </section>`;
  return shell({ team: 'discover', title: 'Discover', kicker: 'Discover', body });
}

/** @param {import('node:http').ServerResponse} res @param {Record<string, string>} fields */
export function discoverSave(res, fields) {
  const saved = saveLead(fields);
  if (!saved.ok) return redirect(res, `/discover?error=${saved.code}`);
  if (fields.fit && fields.fit !== 'unreviewed') {
    const fit = setFit(saved.id, fields.fit, fields.fit_reason || fields.reason || '');
    if (!fit.ok) return redirect(res, `/discover?error=${fit.code}`);
  }
  redirect(res, '/discover?ok=lead');
}

/** @param {import('node:http').ServerResponse} res @param {Record<string, string>} fields */
export function discoverFit(res, fields) {
  const result = setFit(Number(fields.id), fields.fit, fields.reason || '');
  redirect(res, result.ok ? '/discover?ok=fit' : `/discover?error=${result.code}`);
}

/** @param {import('node:http').ServerResponse} res @param {Record<string, string>} fields */
export function discoverOutcome(res, fields) {
  const result = setLeadOutcome(Number(fields.id), fields.status, 'person');
  redirect(res, result.ok ? '/discover?ok=replied' : `/discover?error=${result.code}`);
}

/** @param {Record<string, string>} fields */
export function discoverReddit(fields) {
  return redditPublicSearch(String(fields.query || ''));
}

/**
 * @param {Record<string, string>} query
 */
export function reachPage(query) {
  const open = listMessages({ open: true, limit: 20 });
  const sent = listMessages({ status: 'sent', limit: 8 });
  const body = `
    ${flash(query)}
    <section class="card">
      <h2>Waiting</h2>
      <p class="muted">Approve is yours. The agent cannot approve, and it cannot change a channel mode. Auto, if you turned it on, still stops on a captcha and on the daily cap.</p>
      ${open.length ? open.map(messageCard).join('') : '<p class="muted">No drafts. Discover people, then the agent writes one message at a time.</p>'}
    </section>
    <section class="card">
      <h2>Sent</h2>
      ${sent.length ? sent.map((row) => `<p><span class="chip">${esc(row.channel)}</span> <strong>${esc(row.lead_name || row.lead_company || 'Lead')}</strong> <span class="muted">${esc(row.sent_at || '')}</span><br>${esc(String(row.body || '').slice(0, 180))}</p>`).join('') : '<p class="muted">Nothing sent.</p>'}
    </section>`;
  return shell({ team: 'reach', title: 'Reach', kicker: 'Reach', body });
}

function messageCard(row) {
  const gate = canSend(row.id);
  const mode = channelMode(row.channel).mode;
  const reason = gate.ok ? 'Ready to send.' : (ERRORS[gate.code] || gate.code);
  return `<article class="card" style="margin-bottom:12px">
    <div class="row">
      <span class="chip">${esc(row.channel)}</span>
      <span class="chip">${esc(row.kind)}</span>
      <span class="chip">${esc(row.status)}</span>
      <span class="chip">${esc(mode)}</span>
    </div>
    <h2>${esc(row.lead_name || row.lead_email || 'Lead')} <span class="muted">${esc(row.lead_company || '')}</span></h2>
    ${row.subject ? `<p><strong>${esc(row.subject)}</strong></p>` : ''}
    <p>${esc(row.body)}</p>
    <p class="muted">${esc(reason)}${row.due_at ? ` · due ${esc(row.due_at)}` : ''}</p>
    <div class="row">
      ${row.status === 'draft' || row.status === 'awaiting_approval' ? `<form method="post" action="/reach/approve"><input type="hidden" name="id" value="${row.id}"><button type="submit">Approve send</button></form>` : ''}
      ${gate.ok ? `<form method="post" action="/reach/sent"><input type="hidden" name="id" value="${row.id}"><button type="submit" class="quiet">I sent this</button></form>` : ''}
      <form method="post" action="/reach/cancel"><input type="hidden" name="id" value="${row.id}"><button type="submit" class="quiet">Cancel</button></form>
    </div>
  </article>`;
}

/** @param {import('node:http').ServerResponse} res @param {Record<string, string>} fields */
export function reachApprove(res, fields) {
  const result = approveMessage(Number(fields.id), 'person');
  redirect(res, result.ok ? '/reach?ok=approved' : `/reach?error=${result.code}`);
}

/** @param {import('node:http').ServerResponse} res @param {Record<string, string>} fields */
export function reachSent(res, fields) {
  const result = markSent(Number(fields.id));
  redirect(res, result.ok ? '/reach?ok=sent' : `/reach?error=${result.code}`);
}

/** @param {import('node:http').ServerResponse} res @param {Record<string, string>} fields */
export function reachCancel(res, fields) {
  const result = cancelMessage(Number(fields.id));
  redirect(res, result.ok ? '/reach?ok=cancelled' : `/reach?error=${result.code}`);
}

/**
 * @param {Record<string, string>} query
 */
export function createPage(query) {
  const drafts = listContent({ limit: 20 });
  const body = `
    ${flash(query)}
    <div class="split">
      <form method="post" action="/create" class="card">
        <h2>New draft</h2>
        <p class="muted">Writing is in here. Publishing is not. Post it yourself, then mark it published.</p>
        <label class="field"><span>Channel</span><select name="channel">${CHANNEL_IDS.map((id) => `<option>${id}</option>`).join('')}</select></label>
        ${field('Title', 'title', '')}
        ${field('Body', 'body', '', { multiline: true, rows: 8 })}
        <button type="submit">Save draft</button>
      </form>
      <section>
        ${drafts.length ? drafts.map((draft) => `<article class="card" style="margin-bottom:12px">
          <div class="row"><span class="chip">${esc(draft.channel)}</span><span class="chip">${esc(draft.status)}</span></div>
          <h2>${esc(draft.title || draft.channel)}</h2>
          <p>${esc(draft.body)}</p>
          <div class="row">
            ${draft.status === 'draft' || draft.status === 'idea' ? `<form method="post" action="/create/status"><input type="hidden" name="id" value="${draft.id}"><input type="hidden" name="status" value="approved"><button type="submit" class="quiet">Approve</button></form>` : ''}
            ${draft.status !== 'published' && draft.status !== 'killed' ? `<form method="post" action="/create/status"><input type="hidden" name="id" value="${draft.id}"><input type="hidden" name="status" value="published"><button type="submit">I published this</button></form>` : ''}
            ${draft.status !== 'killed' && draft.status !== 'published' ? `<form method="post" action="/create/status"><input type="hidden" name="id" value="${draft.id}"><input type="hidden" name="status" value="killed"><button type="submit" class="quiet">Kill</button></form>` : ''}
            ${channelHome(draft.channel) ? `<form method="post" action="/create/open"><input type="hidden" name="channel" value="${esc(draft.channel)}"><button type="submit" class="quiet">Open composer</button></form>` : ''}
          </div>
        </article>`).join('') : '<p class="muted">No drafts.</p>'}
      </section>
    </div>`;
  return shell({ team: 'create', title: 'Create', kicker: 'Create', body });
}

/** @param {import('node:http').ServerResponse} res @param {Record<string, string>} fields */
export function createPost(res, fields) {
  const result = saveContent({ channel: fields.channel, title: fields.title, body: fields.body });
  redirect(res, result.ok ? '/create?ok=content' : `/create?error=${result.code}`);
}

/** @param {import('node:http').ServerResponse} res @param {Record<string, string>} fields */
export function createStatus(res, fields) {
  const result = setContentStatus(Number(fields.id), fields.status, 'person');
  redirect(res, result.ok ? '/create?ok=content' : `/create?error=${result.code}`);
}

/** @param {import('node:http').ServerResponse} res @param {Record<string, string>} fields */
export async function createOpen(res, fields) {
  const url = channelHome(fields.channel);
  if (!url) return redirect(res, '/create?error=bad_channel');
  const result = await openUrl(url);
  if (!result.ok) return redirect(res, `/create?error=${result.code}`);
  if (result.blocker) return redirect(res, `/create?error=${result.blocker}`);
  redirect(res, '/create?ok=opened');
}

/**
 * @param {Record<string, string>} query
 */
export function gtmPage(query) {
  const campaigns = listCampaigns();
  const view = campaignView();
  const body = `
    ${flash(query)}
    <div class="split">
      <form method="post" action="/gtm" class="card">
        <h2>New campaign</h2>
        <p class="muted">A campaign is the folder. It does not find people or send. You press Start when it should go live.</p>
        ${field('Name', 'name', '', { required: true })}
        ${field('Goal', 'goal', '', { multiline: true })}
        ${field('Offer in this campaign', 'offer_summary', '')}
        ${field('Who it is for', 'icp_summary', '')}
        ${field('Days before a follow-up', 'followup_days', '4', { type: 'number' })}
        <div class="checks">${CHANNEL_IDS.map((id) => `<label><input type="checkbox" name="channels" value="${id}" ${id === 'email' || id === 'linkedin' ? 'checked' : ''}> ${id}</label>`).join('')}</div>
        <button type="submit">Create draft</button>
      </form>
      <section class="card">
        <h2>Live view</h2>
        ${view.ok ? `<p><strong>${esc(view.campaign.name)}</strong> <span class="chip">${esc(view.campaign.status)}</span></p>
          <p class="muted">${esc(view.channels.join(', ') || 'No channels')}</p>
          <p>${view.counts.leads} leads · ${view.counts.qualified} fit · ${view.counts.sent} sent · ${view.counts.waiting} waiting · ${view.counts.content} posts</p>` : '<p class="muted">No campaign yet.</p>'}
      </section>
    </div>
    <section class="card">
      <h2>Campaigns</h2>
      ${campaigns.length ? campaigns.map((campaign) => `<div class="row" style="margin-bottom:10px">
        <strong>${esc(campaign.name)}</strong> <span class="chip">${esc(campaign.status)}</span>
        ${campaign.status !== 'active' ? `<form method="post" action="/gtm/status"><input type="hidden" name="id" value="${campaign.id}"><input type="hidden" name="status" value="active"><button type="submit">Start</button></form>` : ''}
        ${campaign.status === 'active' ? `<form method="post" action="/gtm/status"><input type="hidden" name="id" value="${campaign.id}"><input type="hidden" name="status" value="paused"><button type="submit" class="quiet">Pause</button></form>` : ''}
        ${campaign.status !== 'done' ? `<form method="post" action="/gtm/status"><input type="hidden" name="id" value="${campaign.id}"><input type="hidden" name="status" value="done"><button type="submit" class="quiet">Done</button></form>` : ''}
      </div>`).join('') : '<p class="muted">Create one, then start it.</p>'}
    </section>`;
  return shell({ team: 'gtm', title: 'GTM', kicker: 'GTM', body });
}

/** @param {import('node:http').ServerResponse} res @param {Record<string, string | string[]>} fields */
export function gtmPost(res, fields) {
  const result = createCampaign({
    name: String(fields.name || ''),
    goal: String(fields.goal || ''),
    offerSummary: String(fields.offer_summary || ''),
    icpSummary: String(fields.icp_summary || ''),
    followupDays: Number(fields.followup_days || 4),
    channels: many(fields.channels),
  });
  redirect(res, result.ok ? '/gtm?ok=saved' : `/gtm?error=${result.code}`);
}

/** @param {import('node:http').ServerResponse} res @param {Record<string, string>} fields */
export function gtmStatus(res, fields) {
  const result = setCampaignStatus(Number(fields.id), fields.status, 'person');
  const ok = fields.status === 'active' ? 'started' : fields.status === 'paused' ? 'paused' : 'done';
  redirect(res, result.ok ? `/gtm?ok=${ok}` : `/gtm?error=${result.code}`);
}
