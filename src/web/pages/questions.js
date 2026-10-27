// src/web/pages/questions.js — open questions and saved answers.
//
// Owns: /questions.
// Must not: invent an answer. The form posts to /desk/answer.
// Reads: questions and answers.

import { esc } from '../../kernel/text.js';
import { listAnswers, openQuestions } from '../../understand/profile.js';
import { flash, shell } from '../layout.js';

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
 * @param {Record<string, string>} query
 */
export function questionsPage(query) {
  const open = openQuestions();
  const saved = listAnswers();
  const openBlock = open.length
    ? open.map((item) => `<form method="post" action="/desk/answer" class="answer">
        <input type="hidden" name="id" value="${item.id}">
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
  const body = `
    ${flash(query)}
    <section class="card">
      <h2>Open questions</h2>
      <p class="muted">An answer is kept and used next time. The run does not stop while you type.</p>
      ${openBlock}
    </section>
    <section class="card">
      <h2>Saved answers</h2>
      ${savedBlock}
      <p class="muted"><a href="/setup">Edit the business form</a></p>
    </section>`;
  return shell({ team: 'kernel', title: 'Questions', kicker: 'Desk', nav: 'Questions', body });
}
