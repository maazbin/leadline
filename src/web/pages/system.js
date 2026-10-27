// src/web/pages/system.js — permissions, the Chrome window, and learned paths.
//
// Owns: the pages a person uses to allow a channel, open Chrome, and close an encounter.
// Must not: expose setChannelMode or approveMessage to the agent. Those calls pass actor "person".
// Writes: channel_permissions, encounters, and the Chrome process.

import { CHANNELS } from '../../kernel/enums.js';
import { all, get } from '../../kernel/db.js';
import { esc } from '../../kernel/text.js';
import { openUrl } from '../../browser/act.js';
import { launchChrome } from '../../browser/chrome.js';
import { listEncounters, resolveEncounter } from '../../browser/encounters.js';
import { pathLookup } from '../../browser/paths.js';
import { listStrategies, trainStrategy } from '../../kernel/strategies.js';
import { listPermissions, setChannelMode } from '../../reach/gate.js';
import { redirect } from '../http.js';
import { flash, shell } from '../layout.js';

/**
 * @param {Record<string, string>} query
 */
export function permissionsPage(query) {
  const rows = listPermissions();
  const body = `
    ${flash(query)}
    <form method="post" action="/permissions" class="card">
      <h2>Who may be contacted</h2>
      <p class="muted">Off never sends. Draft only writes. Approve waits for a button on Reach. Auto lets the agent send one draft at a time, up to the cap, and still stops on a captcha. Leave Auto off unless you want that.</p>
      <table>
        <thead><tr><th>Channel</th><th>Mode</th><th>Cap / day</th><th>Sent today</th></tr></thead>
        <tbody>
          ${rows.map((row) => `<tr>
            <td>${esc(row.channel)}<br><span class="muted">${esc(row.note)}</span></td>
            <td><select name="mode_${esc(row.channel)}">${['off', 'draft', 'approve', 'auto'].map((mode) => `<option ${mode === row.mode ? 'selected' : ''}>${mode}</option>`).join('')}</select></td>
            <td><input name="cap_${esc(row.channel)}" type="number" min="0" max="200" value="${Number(row.daily_cap)}"></td>
            <td>${Number(row.sent_today)}</td>
          </tr>`).join('')}
        </tbody>
      </table>
      <button type="submit">Save permissions</button>
    </form>`;
  return shell({ team: 'kernel', title: 'Permissions', kicker: 'Control', body });
}

/** @param {import('node:http').ServerResponse} res @param {Record<string, string>} fields */
export function permissionsPost(res, fields) {
  for (const channel of CHANNELS) {
    const result = setChannelMode(channel.id, fields[`mode_${channel.id}`], Number(fields[`cap_${channel.id}`]), 'person');
    if (!result.ok) return redirect(res, `/permissions?error=${result.code}`);
  }
  redirect(res, '/permissions?ok=permission');
}

/**
 * @param {Record<string, string>} query
 */
export function browserPage(query) {
  const state = get('SELECT * FROM browser_state WHERE id = 1');
  const body = `
    ${flash(query)}
    <section class="card">
      <h2>Leadline Chrome</h2>
      <p>This is a separate Chrome profile in <span class="muted">data/chrome-profile</span>. It does not take over your daily browser. Sign in to Gmail, LinkedIn, X, and the rest once in that window.</p>
      <p>Some sites show a check only when the debug port is open. Close the debug window, then open the normal window and pass the check yourself. Leadline does not hide the browser or solve the check.</p>
      <p><span class="chip">${esc(state?.mode || 'down')}</span> <span class="muted">${esc(state?.title || '')} ${esc(state?.url || '')}</span></p>
      ${state?.blocker ? `<p class="banner bad">${esc(state.blocker)}</p>` : ''}
      <div class="row">
        <form method="post" action="/browser/launch"><input type="hidden" name="mode" value="debug"><button type="submit">Open debug Chrome</button></form>
        <form method="post" action="/browser/launch"><input type="hidden" name="mode" value="manual"><button type="submit" class="quiet">Open normal window</button></form>
      </div>
      <form method="post" action="/browser/open" class="row" style="margin-top:14px">
        <input name="url" placeholder="https://" style="min-width:280px">
        <button type="submit" class="quiet">Open URL</button>
      </form>
    </section>`;
  return shell({ team: 'kernel', title: 'Browser', kicker: 'Hands', body });
}

/** @param {import('node:http').ServerResponse} res @param {Record<string, string>} fields */
export async function browserLaunch(res, fields) {
  const result = await launchChrome({ mode: fields.mode === 'manual' ? 'manual' : 'debug' });
  redirect(res, result.ok ? '/browser?ok=launched' : `/browser?error=${result.code}`);
}

/** @param {import('node:http').ServerResponse} res @param {Record<string, string>} fields */
export async function browserOpen(res, fields) {
  const result = await openUrl(fields.url);
  if (!result.ok) return redirect(res, `/browser?error=${result.code || 'navigation_failed'}`);
  if (result.blocker) return redirect(res, `/browser?error=${result.blocker}`);
  redirect(res, '/browser?ok=opened');
}

/**
 * @param {Record<string, string>} query
 */
export function learnPage(query) {
  const encounters = listEncounters('open');
  const strategies = listStrategies();
  const platforms = [...new Set(strategies.map((row) => String(row.platform)))];
  const sites = all(`SELECT site FROM path_nodes UNION SELECT site FROM path_branches ORDER BY site LIMIT 12`)
    .map((row) => row.site);
  const trees = sites.map((site) => pathLookup(site)).filter((tree) => tree.ok);
  const body = `
    ${flash(query)}
    <section class="card">
      <h2>Stuck pages</h2>
      <p class="muted">A wall is recorded and left for you. The next session reads it before driving that site again. Follow reached and success. Do not follow stop or refused.</p>
      ${encounters.length ? encounters.map((row) => `<form method="post" action="/learn/resolve" class="card" style="margin-bottom:10px">
        <div class="row"><span class="chip">${esc(row.kind)}</span> <strong>${esc(row.site)}</strong></div>
        <p>${esc(row.detail)}</p>
        <p class="muted">${esc(row.url)}</p>
        <input type="hidden" name="id" value="${row.id}">
        <input name="resolution" placeholder="What should happen next time" style="min-width:260px">
        <button type="submit" class="quiet">Resolve</button>
      </form>`).join('') : '<p class="muted">No open encounters.</p>'}
    </section>
    <section class="card">
      <h2>Playbook</h2>
      <p class="muted">Each platform has steps that worked, failed, or are still open. Try this next is your hypothesis. This is wrong blocks that step. The master keeps going with the other steps. Adapt uses the result of a real attempt.</p>
      ${platforms.map((platform) => `<h2>${esc(platform)}</h2>${strategies.filter((row) => row.platform === platform).map((row) => `<article class="play">
        <div class="row"><span class="chip">${esc(row.result)}</span>${row.human_verdict ? `<span class="chip">${esc(row.human_verdict === 'wrong' ? 'blocked by you' : 'try next')}</span>` : ''}<span class="muted">${esc(row.when_text)}</span></div>
        <p>${esc(row.step)}</p>
        ${row.evidence ? `<p class="muted">${esc(row.evidence)}</p>` : ''}
        ${row.human_note ? `<p>You said: ${esc(row.human_note)}</p>` : ''}
        <form method="post" action="/learn/strategy" class="row">
          <input type="hidden" name="id" value="${esc(row.id)}">
          <input name="note" value="${esc(row.human_note)}" placeholder="What might work, or what is wrong" style="min-width:240px">
          <button name="verdict" value="try" class="quiet" type="submit">Try this next</button>
          <button name="verdict" value="wrong" class="quiet" type="submit">This is wrong</button>
          ${row.human_verdict ? '<button name="verdict" value="clear" class="quiet" type="submit">Allow it again</button>' : ''}
        </form>
      </article>`).join('')}`).join('')}
    </section>
    <section class="card">
      <h2>Paths</h2>
      ${trees.length ? trees.map((tree) => `<div>
        <h2>${esc(tree.site)}</h2>
        ${tree.branches.length ? `<ul class="log">${tree.branches.map((branch) => `<li>${esc(branch.from_node)} → ${esc(branch.choice)} → ${esc(branch.to_node)} <span class="chip">${esc(branch.outcome)}</span></li>`).join('')}</ul>` : '<p class="muted">No hops yet.</p>'}
      </div>`).join('') : '<p class="muted">The agent records a hop the first time it finishes a page.</p>'}
    </section>`;
  return shell({ team: 'kernel', title: 'Memory', kicker: 'Memory', body });
}

/** @param {import('node:http').ServerResponse} res @param {Record<string, string>} fields */
export function learnResolve(res, fields) {
  const result = resolveEncounter(Number(fields.id), fields.resolution, 'person');
  redirect(res, result.ok ? '/learn?ok=resolved' : `/learn?error=${result.code}`);
}

/** @param {import('node:http').ServerResponse} res @param {Record<string, string>} fields */
export function strategyPost(res, fields) {
  const verdict = fields.verdict === 'wrong' ? 'wrong' : fields.verdict === 'clear' ? '' : 'try';
  const result = trainStrategy(String(fields.id || ''), verdict, String(fields.note || ''), 'person');
  redirect(res, result.ok ? '/learn?ok=trained' : `/learn?error=${result.code}`);
}
