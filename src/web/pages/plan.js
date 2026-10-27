// src/web/pages/plan.js — today's editable plan.
//
// Owns: /plan and the plan form.
// Must not: send or start a campaign.
// Writes: the plan for today, when the person saves the form.
// Reads: the plan.

import { getPlan, localDay, saveDayPlan } from '../../kernel/plan.js';
import { esc } from '../../kernel/text.js';
import { redirect } from '../http.js';
import { flash, shell } from '../layout.js';

/**
 * @param {Record<string, string>} query
 */
export function planPage(query) {
  const plan = getPlan(localDay());
  const lines = plan.items.length
    ? plan.items.map((item) => `<div class="plan-item">
        <input type="hidden" name="item" value="${esc(item.id)}">
        <label class="plan-done"><input type="checkbox" name="done" value="${esc(item.id)}"${item.done ? ' checked' : ''}><span>Done</span></label>
        <textarea name="body_${esc(item.id)}" rows="2">${esc(item.body)}</textarea>
        <label class="plan-remove"><input type="checkbox" name="remove" value="${esc(item.id)}"><span>Remove</span></label>
      </div>`).join('')
    : '<p class="muted">Nothing planned yet.</p>';
  const body = `
    ${flash(query)}
    <form method="post" action="/desk/plan" class="card">
      <h2>Today's plan</h2>
      <p class="muted">${esc(plan.day)}. Change any line, mark it done, add one, or remove one. Then save.</p>
      <label class="field"><span>Note</span><textarea name="note" rows="3">${esc(plan.note)}</textarea></label>
      ${lines}
      <label class="field"><span>Add a line</span><textarea name="new_body" rows="2"></textarea></label>
      <button type="submit">Save plan</button>
    </form>`;
  return shell({ team: 'kernel', title: 'Plan', kicker: 'Desk', nav: 'Plan', body });
}

/**
 * The person edited today's plan. The agent does not post this form.
 * @param {import('node:http').ServerResponse} res
 * @param {Record<string, unknown>} fields
 */
export function planPost(res, fields) {
  const result = saveDayPlan(localDay(), fields, 'person');
  redirect(res, result.ok ? '/plan?ok=plan' : `/plan?error=${result.code || 'missing'}`);
}
