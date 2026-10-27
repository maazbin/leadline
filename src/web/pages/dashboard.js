// src/web/pages/dashboard.js — the one desk screen. Tabs switch the panel. The route stays /.
//
// Owns: the day's plan, questions, the persona, trend charts, what worked, and the tracking log.
// Must not: send, approve, or start a campaign.
// Writes: the plan for today, when the person saves the Plan form.
// Reads: the plan, profile, answers, sources, events, and tracking tallies.

import { scoreboard } from '../../kernel/brief.js';
import { listEvents } from '../../kernel/events.js';
import { getPlan, localDay, saveDayPlan } from '../../kernel/plan.js';
import { dashboard } from '../../kernel/stats.js';
import { resultBoard, trendSeries } from '../../kernel/tracking.js';
import { esc } from '../../kernel/text.js';
import { getBusiness, listAnswers, openQuestions } from '../../understand/profile.js';
import { listSources } from '../../understand/sources.js';
import { redirect } from '../http.js';
import { listStalls, STALL_LABEL } from '../../trace/stalls.js';
import { flash } from '../layout.js';

const TABS = [
  ['today', 'Today'],
  ['plan', 'Plan'],
  ['questions', 'Questions'],
  ['persona', 'Persona'],
  ['trends', 'Trends'],
  ['results', 'Results'],
  ['tracking', 'Tracking'],
];

const ANSWER_LABELS = {
  offer: 'Offer',
  audience: 'Who it is for',
  problem: 'Problem',
  proof: 'Proof',
  price_band: 'Price band',
  geos: 'Places you sell',
  tone: 'Tone',
  do_not_contact: 'Do not contact',
  extra: 'Notes',
};

/**
 * @param {string | undefined} raw
 */
export function deskTab(raw) {
  return TABS.some(([id]) => id === raw) ? String(raw) : 'today';
}

/**
 * @param {string} tab
 */
export function deskTitle(tab) {
  return TABS.find(([id]) => id === tab)?.[1] || 'Today';
}

/**
 * @param {Record<string, string>} query
 * @param {string} todayHtml
 */
export function deskBody(query, todayHtml) {
  const tab = deskTab(query.tab);
  const panel = tab === 'today' ? todayHtml
    : tab === 'plan' ? planPanel()
      : tab === 'questions' ? questionsPanel()
      : tab === 'persona' ? personaPanel()
        : tab === 'trends' ? trendsPanel()
          : tab === 'results' ? resultsPanel()
            : trackingPanel();
  return { tabs: deskTabs(tab), body: `${flash(query)}${panel}` };
}

/** Open stalls from Trace. Empty when the run can move. */
export function stallSection() {
  const rows = listStalls('open');
  const body = rows.length
    ? `<ul class="log">${rows.map((row) => `<li><strong>${esc(STALL_LABEL[row.code] || row.code)}</strong> — ${esc(row.detail)}</li>`).join('')}</ul>`
    : '<p class="muted">Nothing is stuck.</p>';
  return `<section class="card">
      <h2>Where it stuck</h2>
      <p class="muted">Trace writes a line when the run cannot move. The line clears when that step is done.</p>
      ${body}
    </section>`;
}

export function deskTabs(tab) {
  return `<nav class="tabbar" role="tablist" aria-label="Desk">
    ${TABS.map(([id, label]) => `<a role="tab" aria-selected="${id === tab ? 'true' : 'false'}" href="/?tab=${id}">${label}</a>`).join('')}
  </nav>`;
}

function planPanel() {
  const plan = getPlan(localDay());
  const lines = plan.items.length
    ? plan.items.map((item) => `<div class="plan-item">
        <input type="hidden" name="item" value="${esc(item.id)}">
        <label class="plan-done"><input type="checkbox" name="done" value="${esc(item.id)}"${item.done ? ' checked' : ''}><span>Done</span></label>
        <textarea name="body_${esc(item.id)}" rows="2">${esc(item.body)}</textarea>
        <label class="plan-remove"><input type="checkbox" name="remove" value="${esc(item.id)}"><span>Remove</span></label>
      </div>`).join('')
    : '<p class="muted">Nothing planned yet.</p>';
  return `<form method="post" action="/desk/plan" class="card">
      <h2>Today's plan</h2>
      <p class="muted">${esc(plan.day)}. Change any line, mark it done, add one, or remove one. Then save.</p>
      <label class="field"><span>Note</span><textarea name="note" rows="3">${esc(plan.note)}</textarea></label>
      ${lines}
      <label class="field"><span>Add a line</span><textarea name="new_body" rows="2"></textarea></label>
      <button type="submit">Save plan</button>
    </form>`;
}

/**
 * The person edited today's plan. The agent does not post this form.
 * @param {import('node:http').ServerResponse} res
 * @param {Record<string, unknown>} fields
 */
export function planPost(res, fields) {
  const result = saveDayPlan(localDay(), fields, 'person');
  redirect(res, result.ok ? '/?tab=plan&ok=plan' : `/?tab=plan&error=${result.code || 'missing'}`);
}

function questionsPanel() {
  const open = openQuestions();
  const saved = listAnswers();
  const openBlock = open.length
    ? open.map((item) => `<form method="post" action="/desk/answer" class="answer">
        <input type="hidden" name="id" value="${item.id}">
        <input type="hidden" name="tab" value="questions">
        <label class="field"><span>${esc(item.question)}</span><textarea name="answer" rows="3" required></textarea></label>
        <button type="submit" class="quiet">Save answer</button>
      </form>`).join('')
    : '<p class="muted">No open question. The agent asks here when a fact is still missing.</p>';
  const savedBlock = saved.length
    ? `<table>
        <thead><tr><th>Question</th><th>Answer</th><th>From</th></tr></thead>
        <tbody>${saved.map((row) => `<tr>
          <td>${esc(ANSWER_LABELS[row.question] || row.question)}</td>
          <td>${esc(row.answer)}</td>
          <td>${row.source === 'person' ? 'You' : 'Desk'}</td>
        </tr>`).join('')}</tbody>
      </table>`
    : '<p class="muted">No saved answer yet. The form on Understand writes these.</p>';
  return `<section class="card">
      <h2>Open questions</h2>
      <p class="muted">An answer is kept and used next time. The run does not stop while you type.</p>
      ${openBlock}
    </section>
    <section class="card">
      <h2>Saved answers</h2>
      ${savedBlock}
      <p class="muted"><a href="/setup">Edit the business form</a></p>
    </section>`;
}

function personaPanel() {
  const business = getBusiness();
  const sources = listSources().filter((row) => row.status === 'read');
  const facts = [
    ['Business', business.name],
    ['One sentence', business.one_liner],
    ['Offer', business.offer],
    ['Who it is for', business.audience],
    ['Problem', business.problem],
    ['Proof', business.proof],
    ['Price', business.price_band],
    ['Places', business.geos],
    ['Tone', business.tone],
    ['Do not contact', business.do_not_contact],
    ['Sender', [business.sender_name, business.sender_email].filter(Boolean).join(' · ')],
    ['Website', business.website],
    ['Notes', business.extra],
  ];
  const summary = personaSummary(business);
  const from = sources.length
    ? sources.map((row) => `<li>${esc(row.label || row.url || row.kind)}${row.url ? ` <span class="muted">${esc(row.url)}</span>` : ''}</li>`).join('')
    : '<li class="muted">No material has been read yet.</li>';
  return `<section class="persona">
      <article class="card">
        <p class="kicker">Understood</p>
        <h2>${esc(business.name || 'No business name yet')}</h2>
        <p>${esc(summary)}</p>
      </article>
      <article class="card">
        <h2>On file</h2>
        <dl class="kv">${facts.map(([label, value]) => `<dt>${esc(label)}</dt><dd>${value ? esc(value) : '<span class="muted">Not on file</span>'}</dd>`).join('')}</dl>
      </article>
    </section>
    <section class="card">
      <h2>Read from</h2>
      <ul class="log">${from}</ul>
    </section>`;
}

/**
 * @param {Record<string, string>} business
 */
function personaSummary(business) {
  const parts = [];
  if (business.name && business.offer) parts.push(`${business.name} sells ${business.offer}`);
  else if (business.offer) parts.push(business.offer);
  else if (business.name) parts.push(`${business.name} is on file, and the offer is still blank.`);
  if (business.audience) parts.push(`It is for ${business.audience.replace(/\.$/, '')}`);
  if (business.problem) parts.push(`The problem on file: ${business.problem.replace(/\.$/, '')}`);
  if (business.sender_name) parts.push(`Messages go out as ${business.sender_name}`);
  if (!parts.length) return 'Nothing is understood yet. Add the business on Understand, or hand over a site or a PDF.';
  return `${parts.join('. ')}.`;
}

function trendsPanel() {
  const series = trendSeries(14);
  return `<section class="grid">
      ${chartCard('Activity', 'Events recorded each day', series, 'events', '#8eb6ff')}
      ${chartCard('Leads', 'People saved each day', series, 'leads', '#7dcea0')}
      ${chartCard('Sent', 'Messages marked sent each day', series, 'sent', '#e0a15a')}
    </section>
    <section class="card">
      <h2>The 14 days</h2>
      <table>
        <thead><tr><th>Day</th><th>Events</th><th>Leads</th><th>Sent</th></tr></thead>
        <tbody>${series.map((row) => `<tr><td>${esc(row.day)}</td><td>${row.events}</td><td>${row.leads}</td><td>${row.sent}</td></tr>`).join('')}</tbody>
      </table>
    </section>`;
}

/**
 * @param {string} title
 * @param {string} caption
 * @param {Array<Record<string, unknown>>} series
 * @param {string} key
 * @param {string} color
 */
function chartCard(title, caption, series, key, color) {
  const total = series.reduce((sum, row) => sum + Number(row[key]), 0);
  return `<article class="card">
    <h2>${esc(title)}</h2>
    <p class="muted">${esc(caption)}. ${total} in this window.</p>
    ${bars(series, key, color)}
  </article>`;
}

/**
 * @param {Array<Record<string, unknown>>} series
 * @param {string} key
 * @param {string} color
 */
function bars(series, key, color) {
  const max = Math.max(1, ...series.map((row) => Number(row[key])));
  const width = 640;
  const height = 168;
  const gap = 8;
  const barWidth = (width - gap * (series.length - 1)) / series.length;
  const shapes = series.map((row, index) => {
    const value = Number(row[key]);
    const barHeight = Math.round((value / max) * (height - 28));
    const x = index * (barWidth + gap);
    const y = height - 22 - Math.max(barHeight, 2);
    return `<rect x="${x.toFixed(1)}" y="${y}" width="${barWidth.toFixed(1)}" height="${Math.max(barHeight, 2)}" rx="4" fill="${color}"></rect>
      <text x="${(x + barWidth / 2).toFixed(1)}" y="${height - 6}" text-anchor="middle" fill="#b4b09f" font-size="10">${esc(String(row.label))}</text>`;
  }).join('');
  return `<svg class="chart" viewBox="0 0 ${width} ${height}" role="img">${shapes}</svg>`;
}

function resultsPanel() {
  const board = resultBoard();
  const worked = board.strategies.filter((row) => row.result === 'worked' && row.human_verdict !== 'wrong');
  const failed = board.strategies.filter((row) => row.result === 'failed' || row.human_verdict === 'wrong');
  const untried = board.strategies.filter((row) => row.result === 'open' && row.human_verdict !== 'wrong');
  const pathCount = Object.fromEntries(board.paths.map((row) => [row.outcome, Number(row.n)]));
  const messageCount = Object.fromEntries(board.messages.map((row) => [row.status, Number(row.n)]));
  return `<section class="statgrid">
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
}

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

function trackingPanel() {
  const counts = dashboard();
  const board = scoreboard();
  const leads = resultBoard().leads;
  const events = listEvents(40);
  const leadLine = leads.length
    ? leads.map((row) => `${row.n} ${row.fit} / ${row.status}`).join(', ')
    : 'No leads yet';
  return `<section class="statgrid">
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
      <p class="muted">Leads: ${esc(leadLine)}.</p>
    </section>
    <section class="card">
      <h2>Activity</h2>
      ${events.length ? `<table>
        <thead><tr><th>When</th><th>What</th></tr></thead>
        <tbody>${events.map((row) => `<tr><td>${esc(when(row.at))}</td><td>${esc(activity(row))}</td></tr>`).join('')}</tbody>
      </table>` : '<p class="muted">Nothing recorded yet.</p>'}
    </section>`;
}

/**
 * @param {string} label
 * @param {number} value
 */
function stat(label, value) {
  return `<div class="statbox"><span class="stat">${esc(value)}</span><span>${esc(label)}</span></div>`;
}

/**
 * @param {string} iso
 */
function when(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return String(iso || '');
  return date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/**
 * @param {Record<string, string>} row
 */
function activity(row) {
  if (row.kind === 'desk') return 'Settings updated';
  if (row.kind === 'lane') return `${row.ref} set to ${row.detail}`;
  if (row.kind === 'permission') return `${row.ref}: ${row.detail}`;
  if (row.kind === 'train') return `Playbook updated for ${row.ref}`;
  if (row.kind === 'strategy') return `${row.ref}: ${row.detail}`;
  if (row.kind === 'material') return `Material saved: ${row.detail}`;
  if (row.kind === 'plan') return `Plan ${row.detail}`;
  if (row.kind === 'stall') return `Trace: ${STALL_LABEL[row.detail] || row.detail}`;
  if (row.kind === 'stall_cleared') return 'Trace cleared a stall';
  const detail = row.detail ? ` — ${row.detail}` : '';
  return `${row.team} ${row.kind}${detail}`;
}
