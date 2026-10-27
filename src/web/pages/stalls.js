// src/web/pages/stalls.js — the open Trace lines, shared by Today and Agents.
//
// Owns: the "Where it stuck" card.
// Must not: clear a stall or send.
// Reads: open stalls.

import { esc } from '../../kernel/text.js';
import { listStalls, STALL_LABEL } from '../../trace/stalls.js';

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
