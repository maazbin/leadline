// src/web/pages/today.js — Today and Understand.
//
// Owns: the home summary and the setup form.
// Must not: send, approve, or change a channel mode. The front shows the graph and a door for every screen.
// Writes: business, answers, and questions, through the understand module.

import { fullPower, getSettings, startConsent } from '../../kernel/desk.js';
import { plan } from '../../kernel/flows.js';
import { ledgerSummary, listLedger } from '../../kernel/ledger.js';
import { esc } from '../../kernel/text.js';
import { crewMap } from '../crew-map.js';
import { answerQuestion, getBusiness, openQuestions, profileGaps, saveBusiness } from '../../understand/profile.js';
import { addLinks, addPdf, listSources, readSource } from '../../understand/sources.js';
import { listPages, readWebsite } from '../../understand/website.js';
import { STEPS } from '../copy.js';
import { readMultipart, redirect } from '../http.js';
import { field, flash, shell } from '../layout.js';

/**
 * @param {Record<string, string>} query
 */
export function homePage(query) {
  const consent = startConsent();
  const start = consent === 'yes' ? '' : `<section class="next">
      <h2>Should the agent start?</h2>
      <p>${consent === 'no' ? 'You said no. The agent is stopped.' : 'The agent runs npm, opens this desk, and does the work. You do not open a terminal.'} Say yes or no in the chat, or answer here.</p>
      <div class="row">
        <form method="post" action="/desk/begin"><input type="hidden" name="answer" value="yes"><input type="hidden" name="fullPower" value="1"><button type="submit">Yes. Send without asking</button></form>
        <form method="post" action="/desk/begin"><input type="hidden" name="answer" value="yes"><input type="hidden" name="fullPower" value="0"><button type="submit" class="quiet">Yes, but ask before each send</button></form>
        <form method="post" action="/desk/begin"><input type="hidden" name="answer" value="no"><button type="submit" class="quiet">No</button></form>
      </div>
    </section>`;
  return shell({
    team: 'kernel',
    title: 'Today',
    kicker: 'Desk',
    nav: 'Today',
    showPower: true,
    body: `${start}${flash(query)}${todayPanel()}`,
  });
}

const GROUPS = [
  ['desk', 'Desk', [
    ['/crew', 'Crew', 'Open the crew', 'kernel'],
    ['/plan', 'Plan', "Today's lines", 'kernel'],
    ['/questions', 'Questions', 'Answers', 'kernel'],
    ['/persona', 'Persona', 'Who it is for', 'kernel'],
    ['/trends', 'Trends', 'Charts', 'kernel'],
    ['/results', 'Results', 'What worked', 'kernel'],
    ['/tracking', 'Tracking', 'Counts and the log', 'kernel'],
  ]],
  ['work', 'Work', [
    ['/setup', 'Understand', 'What you sell', 'understand'],
    ['/discover', 'Discover', 'Who to talk to', 'discover'],
    ['/reach', 'Reach', 'One message', 'reach'],
    ['/create', 'Create', 'Posts you publish', 'create'],
    ['/gtm', 'GTM', 'The campaign', 'gtm'],
  ]],
  ['control', 'Control', [
    ['/settings', 'Settings', 'Run and the switches', 'kernel'],
    ['/permissions', 'Permissions', 'Who may be contacted', 'kernel'],
    ['/browser', 'Browser', 'The signed-in Chrome', 'kernel'],
    ['/learn', 'Memory', 'Walls and the playbook', 'kernel'],
  ]],
];

function doorGrid(rows) {
  return rows.map(([href, label, text, team]) => `<a class="door" data-team="${team}" href="${href}"><strong>${esc(label)}</strong><span>${esc(text)}</span></a>`).join('');
}

function todayPanel() {
  const step = plan();
  const settings = getSettings();
  const running = Number(settings.running) === 1;
  const adapt = Number(settings.adaptability) === 1;
  const groups = GROUPS.map(([id, label, rows]) => `<section id="${id}"><h2>${label}</h2><div class="front-grid">${doorGrid(rows)}</div></section>`).join('');
  return `
    <section class="status">
      <span class="pill ${running ? 'on' : ''}">${running ? 'Running' : 'Stopped'}</span>
      <span class="pill ${adapt ? 'on' : ''}">${adapt ? 'Adapting' : 'Playbook order'}</span>
    </section>
    <section class="next">
      <p class="kicker">${esc(step.flow)}</p>
      <h2>${esc(STEPS[step.step] || step.step)}</h2>
      <p>${esc(step.why)}</p>
      ${step.url ? `<div class="row"><a class="button" href="${esc(step.url)}">Open this step</a></div>` : ''}
    </section>
    <section>
      <h2>The crew</h2>
      <p class="muted">${esc(ledgerSummary(listLedger()))}</p>
      ${crewMap(fullPower())}
      <p class="legend"><span class="working">Working</span><span class="waiting">Waiting on you</span><span class="stuck">Needs a look</span><span class="off">Off</span><span class="paused">Paused</span></p>
    </section>
    ${groups}`;
}

/**
 * @param {Record<string, string>} query
 */
export function setupPage(query) {
  const business = getBusiness();
  const gaps = profileGaps();
  const questions = openQuestions();
  const pages = listPages();
  const body = `
    ${flash(query)}
    ${gaps.length
      ? `<p class="banner bad">Still needed: ${esc(gaps.join(', '))}. Type the form, or add a PDF and your website and social profiles.</p>`
      : '<p class="banner good">This profile is complete enough to draft a campaign.</p>'}
    <div class="split">
      <form method="post" action="/setup" class="card">
        <h2>The business</h2>
        ${field('Business name', 'name', business.name, { required: true })}
        ${field('Your name on messages', 'sender_name', business.sender_name, { required: true })}
        ${field('Your email', 'sender_email', business.sender_email, { type: 'email', hint: 'Optional. Used when a channel is email.' })}
        ${field('Website', 'website', business.website, { hint: 'Leave blank if you paste notes instead.' })}
        <div class="row">
          <button type="button" id="read-site" class="quiet">Read my website</button>
          <span class="muted">Fills a preview. You still press Save.</span>
        </div>
        <pre class="preview" id="site-preview">${esc(pages[0]?.excerpt || 'Nothing read yet.')}</pre>
        ${field('One sentence', 'one_liner', business.one_liner)}
        ${field('What you sell', 'offer', business.offer, { required: true, multiline: true })}
        ${field('Who it is for', 'audience', business.audience, { required: true, multiline: true })}
        ${field('The problem', 'problem', business.problem, { required: true, multiline: true })}
        ${field('Proof you will actually claim', 'proof', business.proof, { multiline: true, hint: 'The agent must not invent customers or numbers.' })}
        ${field('Price band', 'price_band', business.price_band)}
        ${field('Places you sell', 'geos', business.geos)}
        ${field('Tone', 'tone', business.tone, { hint: 'Plain, warm, direct. The agent copies this.' })}
        ${field('Do not contact', 'do_not_contact', business.do_not_contact, { multiline: true, hint: 'One email, handle, or company per line.' })}
        ${field('Notes, a page, or a deck', 'extra', business.extra, { multiline: true, rows: 6 })}
        ${questions.length ? `<h2>Questions from the agent</h2>${questions.map((q) => field(q.question, `q_${q.id}`, '', { multiline: true })).join('')}` : ''}
        <button type="submit">Save profile</button>
      </form>
      <section class="card">
        <h2>Materials</h2>
        <p>Upload a PDF, your website, and the social profiles that are yours. Sign in to those accounts in the Leadline Chrome before they are read. A logged-out page is skipped.</p>
        <form method="post" action="/setup/materials" enctype="multipart/form-data">
          <label class="field"><span>PDF</span><input name="pdf" type="file" accept="application/pdf,.pdf"><small>A scan with no selectable text cannot fill the profile.</small></label>
          ${field('Website and social profiles', 'links', '', { multiline: true, rows: 5, hint: 'One URL per line. LinkedIn, X, Instagram, Facebook, TikTok, Reddit, and YouTube are read only while you are signed in.' })}
          <button type="submit">Save materials</button>
        </form>
        <h2>Saved materials</h2>
        ${materialsBlock()}
        <h2>Pages read</h2>
        ${pages.length ? pages.map((page) => `<p><strong>${esc(page.title || page.url)}</strong><br><span class="muted">${esc(page.url)}</span></p>`).join('') : '<p class="muted">Nothing read yet.</p>'}
      </section>
    </div>`;
  return shell({ team: 'understand', title: 'Understand', kicker: 'Understand', body });
}

/**
 * Answer one open question. The run stays up.
 * @param {import('node:http').ServerResponse} res
 * @param {Record<string, string>} fields
 */
export function answerPost(res, fields) {
  const result = answerQuestion(Number(fields.id), String(fields.answer || ''), 'person');
  redirect(res, result.ok ? '/questions?ok=saved' : `/questions?error=${result.code}`);
}

/**
 * @param {import('node:http').ServerResponse} res
 * @param {Record<string, string>} fields
 */
export function setupPost(res, fields) {
  const saved = saveBusiness(fields);
  if (!saved.ok) return redirect(res, `/setup?error=${saved.code}`);
  for (const [key, value] of Object.entries(fields)) {
    if (!key.startsWith('q_') || !String(value || '').trim()) continue;
    answerQuestion(Number(key.slice(2)), String(value), 'person');
  }
  redirect(res, '/setup?ok=saved');
}

/**
 * @param {Record<string, unknown>} fields
 */
export async function readSite(fields) {
  return readWebsite(String(fields.url || ''));
}

const SOURCE_STATUS = {
  saved: 'Waiting to be read',
  read: 'Read',
  needs_login: 'Sign in first',
  no_text: 'No text in this PDF',
  failed: 'Could not read',
};

function materialsBlock() {
  const rows = listSources();
  if (!rows.length) return '<p class="muted">No PDF or profile yet.</p>';
  return rows.map((row) => {
    const name = row.label || row.url || row.kind;
    const where = row.kind === 'social' ? row.platform : row.kind;
    const retry = row.status === 'saved' || row.status === 'needs_login' || row.status === 'failed'
      ? `<form method="post" action="/setup/materials/read"><input type="hidden" name="id" value="${esc(row.id)}"><button class="quiet" type="submit">Read</button></form>`
      : '';
    return `<div class="row"><div><strong>${esc(name)}</strong><br><span class="muted">${esc(where)} · ${esc(SOURCE_STATUS[row.status] || row.status)}</span></div>${retry}</div>`;
  }).join('');
}

/**
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 */
export async function materialsPost(req, res) {
  const parsed = await readMultipart(req);
  if (!parsed.ok) return redirect(res, `/setup?error=${parsed.code}`);
  const file = parsed.files.pdf;
  const links = String(parsed.fields.links || '');
  let any = false;
  if (file && file.data.length) {
    const saved = addPdf(file.data, file.filename || 'upload.pdf');
    if (!saved.ok) return redirect(res, `/setup?error=${saved.code}`);
    any = true;
  }
  if (links.trim()) {
    const saved = addLinks(links);
    if (!saved.ok && !any) return redirect(res, `/setup?error=${saved.code}`);
    any = any || saved.ok;
  }
  if (!any) return redirect(res, '/setup?error=empty');
  redirect(res, '/setup?ok=materials');
}

/**
 * @param {import('node:http').ServerResponse} res
 * @param {Record<string, string>} fields
 */
export async function readMaterialPost(res, fields) {
  const result = await readSource(Number(fields.id));
  redirect(res, result.ok ? '/setup?ok=materials' : `/setup?error=${result.code || 'missing'}`);
}
