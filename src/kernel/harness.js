// src/kernel/harness.js — the master loop. One process, one send, then a gap.
//
// Owns: the timer that keeps a Run desk moving, and the crew review on that timer.
// Must not: start when Run is off, send when Reach is off, or do a second browser write in one tick.
// When Full power is on, one tick may write the next note, publish one post, post one trial,
// or try one reply, comment, or DM.
// Must not: solve a captcha. execute_send already stops on one.
// A linked-in write waits longer than an email. That gap is how accounts stay unblocked.

import { get, run } from './db.js';
import { deskRunning, fullPower, agentMode, alignWorkWithFullPower } from './desk.js';
import { plan } from './flows.js';
import { nowIso } from './time.js';
import { activeCampaign, newestCampaign, setCampaignStatus } from '../gtm/campaigns.js';
import { canSend } from '../reach/gate.js';
import { listMessages } from '../reach/rows.js';
import { channelHeld, draftNextNote } from '../reach/note.js';
import { engagementLine, learnEngagement, nextEngagement } from '../reach/engage.js';
import { ensureCampaignPost, nextPublishable, markDeskPublished } from '../create/publish.js';
import { ensureTrial } from '../virality/try.js';
import { recordStrategy } from './strategies.js';
import { executeSend, exploreCommunities, publishPost } from '../browser/act.js';
import { runEngagement } from '../browser/engage.js';
import { reviewLedger } from './ledger.js';
import { syncStalls } from '../trace/stalls.js';

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

function masterPass() {
  try {
    syncStalls();
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
  }
  try {
    reviewLedger();
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
  }
}

/** One step. Safe to call when the desk is stopped. Trace records a stall after the step. */
export async function tick() {
  try {
    const result = await tickOnce();
    if (result && !['stopped', 'pacing', 'idle', 'waiting', 'reach_off'].includes(result.code)) {
      const detail = result.detail ? `: ${result.detail}` : '';
      console.log(`Leadline ${result.code}${detail}`);
    }
    return result;
  } finally {
    masterPass();
  }
}

function sendable() {
  const pool = [
    ...listMessages({ status: 'approved', limit: 10 }),
    ...listMessages({ status: 'awaiting_approval', limit: 10 }),
    ...listMessages({ status: 'draft', limit: 10 }),
  ];
  return pool.find((row) => !channelHeld(row.channel) && canSend(row.id).ok);
}

/**
 * @param {{ id: number, channel: string, body: string }} row
 * @param {'create' | 'virality'} kind
 */
async function postOne(row, kind) {
  const result = await publishPost({ channel: row.channel, body: row.body });
  if (result.ok) {
    markDeskPublished(row.id);
    if (kind === 'virality') recordStrategy('vir-one', 'worked', 'Posted the shorter hook.', 'agent');
  }
  markPace(String(row.channel || 'x'));
  return result;
}

async function tickOnce() {
  if (!deskRunning()) return { ok: true, code: 'stopped' };
  if (fullPower()) {
    const campaign = newestCampaign();
    if (campaign && campaign.status === 'draft') setCampaignStatus(campaign.id, 'active', 'person');
    alignWorkWithFullPower();
    if (agentMode('reach') !== 'off' && !sendable()) draftNextNote();
    ensureCampaignPost();
  }
  if (agentMode('reach') === 'off' && !fullPower()) return { ok: true, code: 'reach_off', plan: plan() };
  if (!fullPower() && agentMode('reach') !== 'auto') return { ok: true, code: 'waiting', plan: plan() };
  if (paced()) return { ok: true, code: 'pacing' };

  const message = agentMode('reach') === 'off' ? null : sendable();
  if (message) {
    const result = await executeSend(message.id);
    if (result.ok || result.code === 'sent') markPace(String(message.channel));
    else if (['captcha', 'login', 'no_send_button', 'recipient_not_visible', 'composer_empty', 'not_sent', 'no_composer', 'premium_wall'].includes(result.code)) {
      markPace(String(message.channel));
    }
    return result;
  }

  if (!fullPower()) return { ok: true, code: 'idle', plan: plan() };

  const draft = nextPublishable();
  if (draft) return postOne(draft, 'create');

  const trial = ensureTrial();
  if (trial.ok) return postOne(trial, 'virality');

  const communities = await exploreCommunities();
  if (communities.code !== 'idle') {
    if (communities.code === 'posted') markPace('x');
    return communities;
  }

  const step = nextEngagement();
  if (!step) return { ok: true, code: 'idle', plan: plan() };
  const campaign = activeCampaign() || newestCampaign();
  const line = engagementLine(campaign || {});
  if (!line) return { ok: true, code: 'idle', plan: plan() };
  const result = await runEngagement({ ...step, line });
  if (result.code === 'browser_disabled' || result.code === 'held') {
    return { ok: true, code: 'idle', plan: plan() };
  }
  learnEngagement(step, result);
  markPace(step.channel);
  return result;
}

/** Start the loop for this server. A second call does nothing. */
export function bindHarness(server) {
  if (timer) return;
  masterPass();
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
