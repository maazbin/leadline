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

const NAV = [
  ['/', 'Today', 'kernel'],
  ['/settings', 'Settings', 'kernel'],
  ['/setup', 'Understand', 'understand'],
  ['/discover', 'Discover', 'discover'],
  ['/reach', 'Reach', 'reach'],
  ['/create', 'Create', 'create'],
  ['/gtm', 'GTM', 'gtm'],
  ['/browser', 'Browser', 'kernel'],
  ['/learn', 'Memory', 'kernel'],
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
        ? 'Email, LinkedIn, and X send without asking. A captcha still waits for you.'
        : 'Turn this on and email, forms, and outreach go out without a question each time. Prepare and Off still wait.'}</p>
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
 * @param {{ team: string, title: string, kicker: string, body: string }} page
 */
export function shell(page) {
  const step = plan();
  const nav = NAV.map(([href, label, team]) => {
    const kernelActive = page.team === 'kernel' && label.toLowerCase() === String(page.nav || page.title).toLowerCase();
    const on = page.team !== 'kernel'
      ? (team === page.team ? ' class="active"' : '')
      : (kernelActive ? ' class="active"' : '');
    return `<a href="${href}" data-team="${team}"${on}>${label}</a>`;
  }).join('');
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
      <div class="brand">Leadline<small>Local go-to-market</small></div>
      <nav>${nav}</nav>
      <p>Full power sends without asking. A captcha waits for you, and the rest of the desk keeps moving.</p>
    </aside>
    <main>
      <header class="top">
        <div>
          <p class="kicker">${esc(page.kicker)}</p>
          <h1>${esc(page.title)}</h1>
        </div>
        <div class="flow">${esc(step.flow)} · ${esc(STEPS[step.step] || step.step)}</div>
      </header>
      ${page.tabs || ''}
      ${powerBar()}
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
