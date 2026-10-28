// src/web/pages/fix.js — the Fix lane.
//
// Owns: /fix. The open stops, and the ship rules in plain words.
// Must not: send, merge, open a pull request, or change a mode.
// Reads: the ledger hint and the open stalls.

import { laneHint } from '../crew-map.js';
import { flash, shell } from '../layout.js';
import { stallSection } from './stalls.js';

/**
 * @param {Record<string, string>} query
 */
export function fixPage(query) {
  const body = `
    ${flash(query)}
    ${laneHint('fix')}
    <section class="card">
      <h2>The stop becomes a branch</h2>
      <p>Fix reads the stop from Trace. A change leaves on a new branch and a pull request into main. GitHub merges it when the check named test is green. Fix does not send, and it does not merge.</p>
      <p class="muted">The desk does not open that pull request on the 20-second pass. The coding agent does, after the stop is named.</p>
    </section>
    ${stallSection()}
    <section class="card">
      <h2>The ship rules</h2>
      <ol class="rules">
        <li>Branch from main. Do not commit on main.</li>
        <li>Open a pull request into main.</li>
        <li>Leave the merge to GitHub. The check named test must be green.</li>
        <li>Do not merge a red check. Do not turn the ruleset off.</li>
        <li>Do not force-push main or delete main.</li>
      </ol>
    </section>`;
  return shell({ team: 'fix', title: 'Fix', kicker: 'Work', nav: 'Fix', body });
}
