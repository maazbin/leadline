// src/kernel/desk.js — Run, Full power, Adapt, and the one start answer.
//
// Owns: desk_settings and agent_permissions.
// Must not: send or approve a single message.
// The agent may set the desk only through begin(), and only after the person says yes or no.
// saveDesk and saveAgentMode stay on the Settings page.

import { get, run } from './db.js';
import { LANE_IDS, MODES, oneOf } from './enums.js';
import { webOrigin } from './ports.js';
import { recordEvent } from './events.js';
import { nowIso } from './time.js';

/** @returns {{ id: number, running: number, full_power: number, adaptability: number, updated_at: string }} */
export function getSettings() {
  return get('SELECT * FROM desk_settings WHERE id = 1') || {
    id: 1, running: 0, full_power: 0, adaptability: 1, updated_at: '',
  };
}

/** @returns {boolean} */
export function fullPower() {
  return Number(getSettings().full_power) === 1;
}

/** @returns {boolean} */
export function deskRunning() {
  return Number(getSettings().running) === 1;
}

/** @returns {boolean} */
export function adaptabilityOn() {
  return Number(getSettings().adaptability) === 1;
}

/**
 * @param {string} agent
 * @returns {string}
 */
export function agentMode(agent) {
  const row = get('SELECT mode FROM agent_permissions WHERE agent = ?', agent);
  return row?.mode || 'off';
}

/** @returns {Array<{ agent: string, mode: string }>} */
export function listAgents() {
  return LANE_IDS.map((agent) => ({ agent, mode: agentMode(agent) }));
}

/**
 * @param {{ running?: boolean, full_power?: boolean, adaptability?: boolean }} input
 * @param {string} actor
 */
export function saveDesk(input, actor) {
  if (actor !== 'person') return { ok: false, code: 'human_only' };
  const running = input.running ? 1 : 0;
  const full = input.full_power ? 1 : 0;
  const adapt = input.adaptability ? 1 : 0;
  run(
    'UPDATE desk_settings SET running = ?, full_power = ?, adaptability = ?, updated_at = ? WHERE id = 1',
    running, full, adapt, nowIso(),
  );
  recordEvent('kernel', 'desk', 'settings', `run ${running} power ${full} adapt ${adapt}`);
  if (full) alignReachWithFullPower();
  return { ok: true, running, full_power: full, adaptability: adapt };
}

/** Full power means Reach sends. Ask-first is the state when Full power is off. */
export function alignReachWithFullPower() {
  if (agentMode('reach') === 'auto') return;
  saveAgentMode('reach', 'auto', 'person');
}

/** @returns {'unasked' | 'yes' | 'no'} */
export function startConsent() {
  const row = get("SELECT value FROM app_meta WHERE key = 'start_consent'");
  if (row?.value === 'yes' || row?.value === 'no') return row.value;
  return 'unasked';
}

/**
 * The person said yes or no to starting. The agent calls this. The page can too.
 * A plain yes turns Full power on and allows Email, LinkedIn, and X.
 * fullPower false starts the desk and still asks before each send.
 * @param {{ answer?: string, fullPower?: boolean, full_power?: boolean }} input
 * @param {string} actor
 */
export function begin(input, actor) {
  if (actor !== 'agent' && actor !== 'person') return { ok: false, code: 'human_only' };
  const answer = String(input.answer || '').trim().toLowerCase();
  if (answer !== 'yes' && answer !== 'no') return { ok: false, code: 'bad_status' };
  const now = nowIso();
  run(
    `INSERT INTO app_meta (key, value) VALUES ('start_consent', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    answer,
  );
  if (answer === 'no') {
    run('UPDATE desk_settings SET running = 0, updated_at = ? WHERE id = 1', now);
    recordEvent('kernel', 'desk', 'start', 'no');
    return { ok: true, started: false, url: webOrigin() };
  }
  const chosen = input.fullPower ?? input.full_power;
  const power = chosen === undefined || chosen === null || chosen === ''
    ? true
    : chosen === true || chosen === 1 || chosen === '1' || chosen === 'true';
  run(
    'UPDATE desk_settings SET running = 1, full_power = ?, updated_at = ? WHERE id = 1',
    power ? 1 : 0,
    now,
  );
  for (const agent of ['understand', 'discover', 'gtm', 'trace']) {
    run('UPDATE agent_permissions SET mode = ?, updated_at = ? WHERE agent = ?', 'auto', now, agent);
  }
  if (power) {
    run('UPDATE agent_permissions SET mode = ?, updated_at = ? WHERE agent = ?', 'auto', now, 'reach');
    for (const channel of ['email', 'linkedin', 'x']) {
      run(
        'UPDATE channel_permissions SET mode = ?, updated_at = ? WHERE channel = ?',
        'auto', now, channel,
      );
    }
  }
  recordEvent('kernel', 'desk', 'start', power ? 'yes full power' : 'yes ask first');
  return {
    ok: true,
    started: true,
    fullPower: power,
    url: webOrigin(),
    detail: power
      ? 'Started. Email, LinkedIn, and X send without asking. You run npm. Do not hand the person a terminal.'
      : 'Started. Each send still waits for a yes on Reach. You run npm. Do not hand the person a terminal.',
  };
}

/**
 * @param {string} agent
 * @param {string} mode
 * @param {string} actor
 */
export function saveAgentMode(agent, mode, actor) {
  if (actor !== 'person') return { ok: false, code: 'human_only' };
  if (!oneOf(LANE_IDS, agent)) return { ok: false, code: 'bad_channel' };
  if (!oneOf(MODES, mode)) return { ok: false, code: 'bad_mode' };
  run(
    'UPDATE agent_permissions SET mode = ?, updated_at = ? WHERE agent = ?',
    mode, nowIso(), agent,
  );
  recordEvent('kernel', 'lane', agent, mode);
  return { ok: true, agent, mode };
}
