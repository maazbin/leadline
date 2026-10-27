// src/web/pages/desk.js — the settings a person can understand in one pass.
//
// Owns: the settings form. Actor is always "person".
// Must not: let an agent call these handlers. There is no MCP tool for them.
// Writes: desk_settings, agent_permissions, channel_permissions, and a draft campaign's status.

import { CHANNEL_PLATFORM, CHANNELS, LANES } from '../../kernel/enums.js';
import { agentMode, begin, getSettings, saveAgentMode, saveDesk } from '../../kernel/desk.js';
import { newestCampaign, setCampaignStatus } from '../../gtm/campaigns.js';
import { listPermissions, setChannelMode } from '../../reach/gate.js';
import { esc } from '../../kernel/text.js';
import { redirect } from '../http.js';
import { flash, shell } from '../layout.js';

const SIMPLE = new Set(['understand', 'discover', 'gtm', 'trace']);

/**
 * @param {string} lane
 * @param {string} choice
 */
function choiceLabel(lane, choice) {
  if (lane === 'create' && choice === 'auto') return 'Publish';
  if (lane === 'virality' && choice === 'auto') return 'Post it';
  if (lane === 'create' && choice === 'approve') return 'Ask first';
  if (lane === 'virality' && choice === 'approve') return 'Ask first';
  if (choice === 'off') return 'Off';
  if (choice === 'draft') return 'Prepare';
  if (choice === 'auto') return 'On';
  return 'Ask me';
}

/**
 * @param {string} mode
 */
function platformChoice(mode) {
  if (mode === 'off') return 'off';
  if (mode === 'draft') return 'draft';
  return 'allow';
}

/**
 * @param {string} name
 * @param {string} value
 * @param {string} current
 * @param {string} label
 */
function radio(name, value, current, label) {
  return `<label class="radio"><input type="radio" name="${esc(name)}" value="${esc(value)}" ${value === current ? 'checked' : ''}>${esc(label)}</label>`;
}

/**
 * @param {Record<string, string>} query
 */
export function settingsPage(query) {
  const settings = getSettings();
  const power = Number(settings.full_power) === 1;
  const perms = listPermissions();
  const reach = agentMode('reach');
  const reachPlain = reach === 'off' ? 'Reach is off.'
    : power ? 'Full power is on. Reach sends an Allow message. It does not ask you to approve it.'
      : reach === 'auto' ? 'Reach sends on its own.'
        : 'Reach asks before each send.';
  const body = `
    ${flash(query)}
    <form method="post" action="/settings">
      <section class="next">
        <h2>The desk</h2>
        <p class="muted">The agent asks once, then runs npm and sets these. Full power sends email, forms, and outreach without asking. Adapt prefers what worked. A step you mark wrong stays blocked. Change a switch here if you want a different rule.</p>
        <div class="switches">
          <label class="switch"><input type="checkbox" name="running" value="1" ${Number(settings.running) === 1 ? 'checked' : ''}><span><strong>Run</strong><small>Keep going after you leave this page. Stop clears this.</small></span></label>
          <label class="switch"><input type="checkbox" name="full_power" value="1" ${power ? 'checked' : ''}><span><strong>Full power</strong><small>Reach writes and sends. Create publishes LinkedIn and X. Virality posts one pattern. Off on a platform stays off.</small></span></label>
          <label class="switch"><input type="checkbox" name="adaptability" value="1" ${Number(settings.adaptability) === 1 ? 'checked' : ''}><span><strong>Adapt</strong><small>Use the step that worked. Skip a failed one. Your correction still wins.</small></span></label>
        </div>
        <p class="muted">${esc(reachPlain)} Sends are spaced so a platform does not see a burst. A captcha or a restriction page waits for you, and the other platforms continue.</p>
      </section>
      <section class="card">
        <h2>Lanes</h2>
        <p class="muted"><a href="/crew">Crew</a> is the graph. Click a lane to open it. The master checks about every 20 seconds. Understand, Discover, GTM, Reach, and Trace should be on while the desk is running. Full power also turns Create and Virality on. They publish and post.</p>
        <div class="lanes">
          ${LANES.map((lane) => {
            const mode = agentMode(lane.id);
            const choices = SIMPLE.has(lane.id) ? ['off', 'draft', 'auto'] : ['off', 'draft', 'approve', 'auto'];
            return `<div class="lane">
              <strong>${esc(lane.label)}</strong>
              <p class="muted">${esc(lane.hint)}</p>
              <div class="radios">${choices.map((choice) => radio(`lane_${lane.id}`, choice, mode, choiceLabel(lane.id, choice))).join('')}</div>
            </div>`;
          }).join('')}
        </div>
      </section>
      <section class="card">
        <h2>Platforms</h2>
        <p class="muted">Allow plus Full power sends. Allow without Full power asks you on Reach. Prepare only writes the draft. Turning Full power on moves Email, LinkedIn, and X from Prepare to Allow. You can switch them back before you save.</p>
        ${perms.map((row) => {
          const choice = platformChoice(String(row.mode));
          const name = `platform_${row.channel}`;
          return `<div class="platform">
            <div><strong>${esc(CHANNEL_PLATFORM[row.channel] || row.channel)}</strong><div class="muted">${esc(row.note)} ${Number(row.sent_today)} sent today.</div></div>
            <div class="radios">
              ${radio(name, 'off', choice, "Don't use")}
              ${radio(name, 'draft', choice, 'Prepare')}
              ${radio(name, 'allow', choice, 'Allow')}
            </div>
            <label class="cap">Cap<input name="cap_${esc(row.channel)}" type="number" min="0" max="200" value="${Number(row.daily_cap)}"></label>
          </div>`;
        }).join('')}
        <div class="row" style="margin-top:16px">
          <button type="submit">Save settings</button>
          <span class="muted">Caps reset at local midnight. 0 blocks that platform.</span>
        </div>
      </section>
    </form>
    <script>
      const powerBox = document.querySelector('[name=full_power]');
      if (powerBox) {
        powerBox.addEventListener('change', () => {
          if (!powerBox.checked) return;
          for (const name of ['platform_email', 'platform_linkedin', 'platform_x']) {
            const allow = document.querySelector('input[name="' + name + '"][value="allow"]');
            const prepare = document.querySelector('input[name="' + name + '"][value="draft"]');
            if (allow && prepare && prepare.checked) allow.checked = true;
          }
          for (const name of ['lane_create', 'lane_virality']) {
            const on = document.querySelector('input[name="' + name + '"][value="auto"]');
            if (on) on.checked = true;
          }
        });
      }
    </script>`;
  return shell({ team: 'kernel', title: 'Settings', kicker: 'Control', nav: 'Settings', showPower: true, body });
}

/**
 * One click from the bar on Today and Settings. Leaves Run and Adapt as they are.
 * Turning it on moves Email, LinkedIn, and X from Prepare to send, and Allow to send.
 * Turning it off makes those sends wait again.
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 * @param {Record<string, string | string[]>} fields
 */
export function powerPost(req, res, fields) {
  const turningOn = fields.power === '1';
  const settings = getSettings();
  const saved = saveDesk({
    running: Number(settings.running) === 1,
    full_power: turningOn,
    adaptability: Number(settings.adaptability) === 1,
  }, 'person');
  if (!saved.ok) return redirect(res, `/?error=${saved.code}`);
  let reach = 'off';
  for (const row of listPermissions()) {
    const channel = String(row.channel);
    let mode = String(row.mode);
    if (turningOn) {
      if ((channel === 'email' || channel === 'linkedin' || channel === 'x') && mode === 'draft') mode = 'auto';
      else if (mode === 'approve') mode = 'auto';
    } else if (mode === 'auto') mode = 'approve';
    if (mode !== row.mode) {
      const result = setChannelMode(channel, mode, Number(row.daily_cap), 'person');
      if (!result.ok) return redirect(res, `/settings?error=${result.code}`);
    }
    if (mode === 'auto') reach = 'auto';
    else if (mode === 'approve' && reach !== 'auto') reach = 'approve';
    else if (mode === 'draft' && reach === 'off') reach = 'draft';
  }
  if (turningOn) reach = 'auto';
  saveAgentMode('reach', reach, 'person');
  if (saved.running === 1 && saved.full_power === 1) {
    const campaign = newestCampaign();
    if (campaign && campaign.status === 'draft') setCampaignStatus(campaign.id, 'active', 'person');
  }
  redirect(res, `${sameDeskPath(req.headers.referer)}?ok=${turningOn ? 'power_on' : 'power_off'}`);
}

/**
 * @param {string | undefined} referer
 * @returns {string}
 */
function sameDeskPath(referer) {
  try {
    const url = new URL(String(referer || ''));
    if (url.hostname !== '127.0.0.1' && url.hostname !== 'localhost') return '/';
    if (!url.pathname.startsWith('/') || url.pathname.startsWith('//')) return '/';
    return url.pathname;
  } catch {
    return '/';
  }
}

/**
 * @param {import('node:http').ServerResponse} res
 * @param {Record<string, string | string[]>} fields
 */
export function settingsPost(res, fields) {
  const power = fields.full_power === '1' || fields.full_power === 'on';
  const saved = saveDesk({
    running: fields.running === '1' || fields.running === 'on',
    full_power: power,
    adaptability: fields.adaptability === '1' || fields.adaptability === 'on',
  }, 'person');
  if (!saved.ok) return redirect(res, `/settings?error=${saved.code}`);

  for (const lane of LANES) {
    const result = saveAgentMode(lane.id, String(fields[`lane_${lane.id}`] || ''), 'person');
    if (!result.ok) return redirect(res, `/settings?error=${result.code}`);
  }

  let reach = 'off';
  for (const channel of CHANNELS) {
    const choice = String(fields[`platform_${channel.id}`] || '');
    let mode = 'off';
    if (choice === 'draft') mode = 'draft';
    else if (choice === 'allow') mode = power ? 'auto' : 'approve';
    else if (choice !== 'off') return redirect(res, '/settings?error=bad_mode');
    const result = setChannelMode(channel.id, mode, Number(fields[`cap_${channel.id}`]), 'person');
    if (!result.ok) return redirect(res, `/settings?error=${result.code}`);
    if (mode === 'auto') reach = 'auto';
    else if (mode === 'approve' && reach !== 'auto') reach = 'approve';
    else if (mode === 'draft' && reach === 'off') reach = 'draft';
  }
  if (power) {
    reach = 'auto';
    saveAgentMode('create', 'auto', 'person');
    saveAgentMode('virality', 'auto', 'person');
  }
  saveAgentMode('reach', reach, 'person');

  if (saved.running === 1 && saved.full_power === 1) {
    const campaign = newestCampaign();
    if (campaign && campaign.status === 'draft') setCampaignStatus(campaign.id, 'active', 'person');
  }
  redirect(res, '/settings?ok=desk');
}

/** @param {import('node:http').ServerResponse} res @param {Record<string, string>} fields */
export function beginPost(res, fields) {
  const result = begin({ answer: String(fields.answer || ''), fullPower: fields.fullPower }, 'person');
  if (!result.ok) return redirect(res, `/?error=${result.code}`);
  redirect(res, result.started ? '/?ok=started' : '/?ok=stopped');
}
