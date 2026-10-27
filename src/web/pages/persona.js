// src/web/pages/persona.js — what the desk understood.
//
// Owns: /persona.
// Must not: fill or overwrite the profile.
// Reads: the business row and materials already marked read.

import { esc } from '../../kernel/text.js';
import { getBusiness } from '../../understand/profile.js';
import { listSources } from '../../understand/sources.js';
import { flash, shell } from '../layout.js';

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

/**
 * @param {Record<string, string>} query
 */
export function personaPage(query) {
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
  const from = sources.length
    ? sources.map((row) => `<li>${esc(row.label || row.url || row.kind)}${row.url ? ` <span class="muted">${esc(row.url)}</span>` : ''}</li>`).join('')
    : '<li class="muted">No material has been read yet.</li>';
  const body = `
    ${flash(query)}
    <section class="persona">
      <article class="card">
        <p class="kicker">Understood</p>
        <h2>${esc(business.name || 'No business name yet')}</h2>
        <p>${esc(personaSummary(business))}</p>
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
  return shell({ team: 'kernel', title: 'Persona', kicker: 'Desk', nav: 'Persona', body });
}
