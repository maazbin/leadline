// src/kernel/brief.js — the executive read of the desk.
//
// Owns: recommendations and the platform scoreboard. Computed, not stored.
// Must not: write, send, or change a switch.

import { get } from './db.js';
import { CHANNEL_PLATFORM, CHANNELS } from './enums.js';
import { agentMode, fullPower, getSettings, startConsent } from './desk.js';
import { listStrategies, nextStrategy } from './strategies.js';
import { profileGaps, openQuestions } from '../understand/profile.js';
import { newestCampaign } from '../gtm/campaigns.js';
import { listPermissions } from '../reach/gate.js';

/**
 * @param {string} tone now | keep | learn
 * @param {string} text
 * @param {string} href
 */
function rec(tone, text, href) {
  return { tone, text, href };
}

/** @returns {Array<{ tone: string, text: string, href: string }>} */
export function recommendations() {
  const settings = getSettings();
  const power = Number(settings.full_power) === 1;
  const running = Number(settings.running) === 1;
  const adapt = Number(settings.adaptability) === 1;
  const items = [];
  const gaps = profileGaps();
  if (gaps.length) {
    items.push(rec('now', `The profile still needs ${gaps.join(', ')}. Add a PDF, your website, or your social profiles, or type the form. Sign in to those social accounts in the Leadline Chrome first.`, '/setup'));
  }
  const campaign = newestCampaign();
  if (!gaps.length && !campaign) {
    items.push(rec('now', 'Create a campaign on GTM. Run can start it once Full power is on.', '/gtm'));
  }
  if (startConsent() !== 'yes') {
    items.push(rec('now', 'Tell the agent yes or no. The agent runs npm and the rest. You do not open a terminal.', '/'));
  } else if (!running) {
    items.push(rec('now', 'The desk is paused. Tell the agent to start again, or turn Run on.', '/settings'));
  }
  if (!power) {
    items.push(rec('now', 'Full power is off. Allow platforms will wait for a yes on each send.', '/settings'));
  } else {
    items.push(rec('keep', 'Full power is on. Allow platforms send without asking. Prepare only still waits.', '/settings'));
  }
  const encounters = Number(get("SELECT COUNT(*) AS n FROM encounters WHERE status = 'open'").n);
  if (encounters) {
    items.push(rec('now', `${encounters} page${encounters === 1 ? ' is' : 's are'} waiting on you. The other platforms keep moving.`, '/learn'));
  }
  const questions = openQuestions().length;
  if (questions) {
    items.push(rec('learn', `${questions} open question${questions === 1 ? '' : 's'}. Answer when you can. The run does not stop for them.`, '/'));
  }
  const perms = listPermissions();
  const capped = perms.filter((row) => row.mode !== 'off' && Number(row.daily_cap) > 0 && Number(row.sent_today) >= Number(row.daily_cap));
  if (capped.length) {
    items.push(rec('keep', `${capped.map((row) => CHANNEL_PLATFORM[row.channel] || row.channel).join(', ')} hit today's cap. The rest can continue.`, '/settings'));
  }
  const blocked = listStrategies().filter((row) => row.human_verdict === 'wrong');
  if (blocked.length) {
    items.push(rec('learn', `You blocked ${blocked.length} step${blocked.length === 1 ? '' : 's'}. The master skips them and keeps the rest.`, '/learn'));
  }
  if (!adapt) {
    items.push(rec('learn', 'Adapt is off. Failed steps stay in the playbook until you mark them wrong.', '/settings'));
  }
  if (agentMode('virality') === 'auto' && power) {
    const next = nextStrategy('Virality');
    if (next) items.push(rec('keep', `Virality next: ${next.step}`, '/create'));
  }
  const sent = perms.reduce((sum, row) => sum + Number(row.sent_today), 0);
  if (sent && items.length < 3) {
    items.push(rec('keep', `${sent} send${sent === 1 ? '' : 's'} today. Keep the gap between writes.`, '/reach'));
  }
  return items.slice(0, 5);
}

/** @returns {Array<Record<string, unknown>>} */
export function scoreboard() {
  const power = fullPower();
  const perms = listPermissions();
  return CHANNELS.map((channel) => {
    const perm = perms.find((row) => row.channel === channel.id);
    const platform = CHANNEL_PLATFORM[channel.id];
    const strategy = nextStrategy(platform);
    let plain = "Don't use";
    if (perm?.mode === 'draft') plain = 'Prepare only';
    else if (perm?.mode === 'auto' || (power && perm?.mode === 'approve')) plain = 'Sends without asking';
    else if (perm?.mode === 'approve') plain = 'Asks before sending';
    return {
      id: channel.id,
      label: platform,
      mode: perm?.mode || 'off',
      plain,
      sent: Number(perm?.sent_today || 0),
      cap: Number(perm?.daily_cap || 0),
      step: strategy?.step || '',
      result: strategy?.result || '',
    };
  });
}
