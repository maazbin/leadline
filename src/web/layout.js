// src/web/layout.js — the shell around every page.
//
// Owns: navigation, the next-step pill, form controls, and the site-read script.
// Must not: write the database. plan() is a read.
// Callers pass body HTML they already escaped.

import { getSettings } from '../kernel/desk.js';
import { plan } from '../kernel/flows.js';
import { esc } from '../kernel/text.js';
import { ERRORS, OKS, STEPS } from './copy.js';
import { CSS } from './styles.js';

const DESK = [
  ['/', 'Today', 'kernel'],
  ['/crew', 'Crew', 'kernel'],
  ['/pipeline', 'Pipeline', 'kernel'],
  ['/plan', 'Plan', 'kernel'],
  ['/questions', 'Questions', 'kernel'],
  ['/persona', 'Persona', 'kernel'],
  ['/trends', 'Trends', 'kernel'],
  ['/results', 'Results', 'kernel'],
  ['/tracking', 'Tracking', 'kernel'],
];

const WORK = [
  ['/setup', 'Understand', 'understand'],
  ['/discover', 'Discover', 'discover'],
  ['/reach', 'Reach', 'reach'],
  ['/create', 'Create', 'create'],
  ['/gtm', 'GTM', 'gtm'],
];

const CONTROL = [
  ['/settings', 'Settings', 'kernel'],
  ['/permissions', 'Permissions', 'kernel'],
  ['/browser', 'Browser', 'kernel'],
  ['/learn', 'Memory', 'kernel'],
];

const PLACES = [
  { label: 'Today' },
  { label: 'Crew', group: 'Desk', groupHref: '/#desk' },
  { label: 'Pipeline', group: 'Desk', groupHref: '/#desk' },
  { label: 'Plan', group: 'Desk', groupHref: '/#desk' },
  { label: 'Questions', group: 'Desk', groupHref: '/#desk' },
  { label: 'Persona', group: 'Desk', groupHref: '/#desk' },
  { label: 'Trends', group: 'Desk', groupHref: '/#desk' },
  { label: 'Results', group: 'Desk', groupHref: '/#desk' },
  { label: 'Tracking', group: 'Desk', groupHref: '/#desk' },
  { label: 'Understand', group: 'Work', groupHref: '/#work' },
  { label: 'Discover', group: 'Work', groupHref: '/#work' },
  { label: 'Reach', group: 'Work', groupHref: '/#work' },
  { label: 'Create', group: 'Work', groupHref: '/#work' },
  { label: 'GTM', group: 'Work', groupHref: '/#work' },
  { label: 'Settings', group: 'Control', groupHref: '/#control' },
  { label: 'Browser', group: 'Control', groupHref: '/#control' },
  { label: 'Memory', group: 'Control', groupHref: '/#control' },
  { label: 'Permissions', group: 'Control', groupHref: '/#control', parent: { href: '/settings', label: 'Settings' } },
];

/**
 * @param {Record<string, string>} query
 */
export function flash(query) {
  if (query.error) return `<p class="banner bad">${esc(ERRORS[query.error] || query.error)}</p>`;
  if (query.ok) return `<p class="banner good">${esc(OKS[query.ok] || 'Saved.')}</p>`;
  return '';
}

/**
 * @param {string} label
 * @param {string} name
 * @param {unknown} value
 * @param {{ required?: boolean, hint?: string, multiline?: boolean, type?: string, rows?: number }} [opts]
 */
function powerBar() {
  const on = Number(getSettings().full_power) === 1;
  return `<form class="powerbar${on ? ' on' : ''}" method="post" action="/desk/power">
    <div>
      <h2>${on ? 'Full power is on' : 'Full power'}</h2>
      <p>${on
        ? 'Reach writes and sends. Create publishes LinkedIn and X. Virality posts one pattern. A captcha still stops that page.'
        : 'Turn this on and the lanes do the work. Reach sends, Create publishes, and Virality posts one pattern.'}</p>
    </div>
    <button type="submit" name="power" value="${on ? '0' : '1'}">${on ? 'Turn off' : 'Turn on full power'}</button>
  </form>`;
}

export function field(label, name, value, opts = {}) {
  const required = opts.required ? ' required' : '';
  const hint = opts.hint ? `<small>${esc(opts.hint)}</small>` : '';
  const mark = opts.required ? ' <i>required</i>' : '';
  const control = opts.multiline
    ? `<textarea name="${esc(name)}" rows="${opts.rows || 4}">${esc(value)}</textarea>`
    : `<input name="${esc(name)}" type="${esc(opts.type || 'text')}" value="${esc(value)}"${required}>`;
  return `<label class="field"><span>${esc(label)}${mark}</span>${control}${hint}</label>`;
}

/**
 * @param {Array<[string, string, string]>} items
 * @param {{ team: string, title: string, nav?: string }} page
 */
function navLinks(items, page) {
  return items.map(([href, label, team]) => {
    const kernelActive = page.team === 'kernel' && label.toLowerCase() === String(page.nav || page.title).toLowerCase();
    const on = page.team !== 'kernel'
      ? (team === page.team ? ' class="active"' : '')
      : (kernelActive ? ' class="active"' : '');
    const current = on ? ' aria-current="page"' : '';
    return `<a href="${href}" data-team="${team}"${on}${current}>${esc(label)}</a>`;
  }).join('');
}

/** @param {{ title: string, nav?: string }} page */
function breadcrumb(page) {
  const name = String(page.nav || page.title);
  const place = PLACES.find((row) => row.label.toLowerCase() === name.toLowerCase());
  const trail = [{ href: '/', label: 'Today' }];
  if (place && place.label !== 'Today') {
    if (place.group) trail.push({ href: place.groupHref, label: place.group });
    if (place.parent) trail.push(place.parent);
    trail.push({ label: place.label });
  } else if (!place) {
    trail.push({ label: name });
  }
  const items = trail.map((item, index) => {
    const last = index === trail.length - 1;
    const label = esc(item.label);
    const body = last ? `<span aria-current="page">${label}</span>` : `<a href="${esc(item.href)}">${label}</a>`;
    const sep = index ? '<span class="sep" aria-hidden="true">/</span>' : '';
    return `<li>${sep}${body}</li>`;
  }).join('');
  return `<nav class="crumbs" aria-label="Breadcrumb"><ol>${items}</ol></nav>`;
}

export function shell(page) {
  const step = plan();
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(page.title)} · Leadline</title>
  <style>${CSS}</style>
</head>
<body>
  <div class="app">
    <aside class="rail">
      <a class="brand" href="/">Leadline<small>Local go-to-market</small></a>
      <nav class="rail-nav" aria-label="Desk">
        <p class="rail-label">Desk</p>
        ${navLinks(DESK, page)}
      </nav>
      <nav class="rail-nav" aria-label="Work">
        <p class="rail-label">Work</p>
        ${navLinks(WORK, page)}
      </nav>
      <nav class="rail-nav" aria-label="Control">
        <p class="rail-label">Control</p>
        ${navLinks(CONTROL, page)}
      </nav>
    </aside>
    <main>
      <header class="top">
        <div>
          ${breadcrumb(page)}
          <h1>${esc(page.title)}</h1>
        </div>
        <div class="flow">${esc(step.flow)} · ${esc(STEPS[step.step] || step.step)}</div>
      </header>
      ${page.showPower ? powerBar() : ''}
      ${page.body}
    </main>
  </div>
  <script>
    const readBtn = document.querySelector('#read-site');
    if (readBtn) {
      readBtn.addEventListener('click', async () => {
        const website = document.querySelector('[name=website]').value;
        const box = document.querySelector('#site-preview');
        box.textContent = 'Reading the site…';
        try {
          const res = await fetch('/setup/read-site', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ url: website }),
          });
          const data = await res.json();
          if (!data.ok) {
            box.textContent = data.detail || data.code || 'Could not read that site.';
            return;
          }
          box.textContent = data.pages.map((p) => (p.title || p.url) + '\\n' + (p.excerpt || '').slice(0, 700)).join('\\n\\n');
          const offer = document.querySelector('[name=offer]');
          if (offer && !offer.value && data.suggestedOffer) offer.value = data.suggestedOffer;
        } catch {
          box.textContent = 'Could not read that site.';
        }
      });
    }
  </script>
</body>
</html>`;
}
