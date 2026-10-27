// src/kernel/harness.js — the master loop. One process, one send, then a gap.
//
// Owns: the timer that keeps a Run desk moving.
// Must not: start when Run is off, send when Reach is off, or send a second message in one tick.
// Must not: solve a captcha. execute_send already stops on one.
// A linked-in write waits longer than an email. That gap is how accounts stay unblocked.

import { get, run } from './db.js';
import { deskRunning, fullPower, agentMode } from './desk.js';
import { plan } from './flows.js';
import { nowIso } from './time.js';
import { newestCampaign, setCampaignStatus } from '../gtm/campaigns.js';
import { canSend } from '../reach/gate.js';
import { listMessages } from '../reach/rows.js';
import { executeSend } from '../browser/act.js';

const GAPS = {
  linkedin: 90000,
  instagram: 60000,
  facebook: 60000,
  tiktok: 45000,
  x: 30000,
  reddit: 30000,
  whatsapp: 30000,
  email: 8000,
  web_form: 15000,
};

/** @type {ReturnType<typeof setInterval> | null} */
let timer = null;

function paced() {
  const row = get("SELECT value FROM app_meta WHERE key = 'next_send_at'");
  return Boolean(row && row.value > nowIso());
}

/**
 * @param {string} channel
 */
function markPace(channel) {
  const ms = GAPS[channel] || 15000;
  const at = new Date(Date.now() + ms).toISOString();
  run(
    `INSERT INTO app_meta (key, value) VALUES ('next_send_at', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    at,
  );
}

/** One step. Safe to call when the desk is stopped. */
export async function tick() {
  if (!deskRunning()) return { ok: true, code: 'stopped' };
  if (fullPower()) {
    const campaign = newestCampaign();
    if (campaign && campaign.status === 'draft') setCampaignStatus(campaign.id, 'active', 'person');
  }
  if (agentMode('reach') === 'off') return { ok: true, code: 'reach_off', plan: plan() };
  if (!fullPower() && agentMode('reach') !== 'auto') return { ok: true, code: 'waiting', plan: plan() };
  if (paced()) return { ok: true, code: 'pacing' };
  const pool = [
    ...listMessages({ status: 'approved', limit: 10 }),
    ...listMessages({ status: 'awaiting_approval', limit: 10 }),
    ...listMessages({ status: 'draft', limit: 10 }),
  ];
  const message = pool.find((row) => canSend(row.id).ok);
  if (!message) return { ok: true, code: 'idle', plan: plan() };
  const result = await executeSend(message.id);
  if (result.ok || result.code === 'sent') markPace(String(message.channel));
  else if (['captcha', 'login', 'no_send_button', 'recipient_not_visible'].includes(result.code)) markPace(String(message.channel));
  return result;
}

/** Start the loop for this server. A second call does nothing. */
export function bindHarness(server) {
  if (timer) return;
  const beat = () => {
    tick().catch((err) => {
      console.error(err instanceof Error ? err.message : err);
    });
  };
  timer = setInterval(beat, 20000);
  timer.unref();
  server.on('close', () => {
    if (timer) clearInterval(timer);
    timer = null;
  });
}
