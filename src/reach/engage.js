// src/reach/engage.js — which reply, comment, or DM to try next.
//
// Owns: the six engagement steps, the one-line wording, and what a try taught the desk.
// Must not: open Chrome, click Send, invent proof, or follow a path marked stop or refused.
// Reads: strategies, path memory, channel mode, the daily cap, and earlier engage events.
// Writes: strategies, path branches, app_meta holds, and one engage event after a real click.

import { get, run } from '../kernel/db.js';
import { adaptabilityOn, agentMode, fullPower } from '../kernel/desk.js';
import { recordEvent } from '../kernel/events.js';
import { clip } from '../kernel/text.js';
import { nowIso, startOfLocalDayIso } from '../kernel/time.js';
import { pathLookup, pathRecord } from '../browser/paths.js';
import { channelMode, sentToday } from './gate.js';
import { channelHeld, holdChannel } from './note.js';
import { recordStrategy } from '../kernel/strategies.js';

/** The order to try once. Later repeats follow whatever worked. */
export const ENGAGEMENTS = [
  { id: 'x-reply-people', platform: 'X', channel: 'x', action: 'reply', site: 'x.com' },
  { id: 'li-comment', platform: 'LinkedIn', channel: 'linkedin', action: 'comment', site: 'www.linkedin.com' },
  { id: 'ig-comment', platform: 'Instagram', channel: 'instagram', action: 'comment', site: 'www.instagram.com' },
  { id: 'x-dm', platform: 'X', channel: 'x', action: 'dm', site: 'x.com' },
  { id: 'li-dm', platform: 'LinkedIn', channel: 'linkedin', action: 'dm', site: 'www.linkedin.com' },
  { id: 'ig-dm', platform: 'Instagram', channel: 'instagram', action: 'dm', site: 'www.instagram.com' },
];

const HOLD_MS = 6 * 60 * 60 * 1000;

const AD = /\b(we are hiring|we're hiring|we’re hiring|apply now|now hiring|i'm hiring|i am hiring|view job|is hiring|are you hiring)\b|#hiring|if you(?:'re|’re| are) (?:job hunting|looking|interviewing)|looking for your next|join our team|only connections can comment|job search strategist|career coach|i help professionals|helping professionals|job search expert|are you (?:still )?looking|provide food|feed my family|gofundme|mutual aid|difficult circumstances|you need me|u need me|on your sq(?:uad|aud)/i;
const QUESTION = /^(how|what|when|why|who)\b/i;
/** The author is the one hunting. A mention of jobs in advice to other people is not enough. */
const OWN = [
  /\bi(?:'m|’m| am)\s+open to work\b/i,
  /\bi(?:'m|’m| am| was| went)?\s+(?:been\s+|just\s+|still\s+|currently\s+)?looking for\s+(?:a\s+|my\s+|the\s+)?(?:[\w'#./+-]+\s+){0,6}(?:job|role|work)\b/i,
  /\bi(?:'m|’m| am| was| got| have|'ve|’ve)\s+(?:been\s+)?laid off\b/i,
  /\bmy job (?:hunt|search)\b/i,
  /\bi(?:'m|’m| am)\s+(?:job hunting|on the job market)\b/i,
  /\bi(?:'ve|’ve| have)\s+been\s+job hunting\b/i,
];

/**
 * A person's post about their own search, not a job ad.
 * @param {string} text
 */
export function huntPost(text) {
  const raw = String(text || '').replace(/\s+/g, ' ').trim();
  if (!raw || AD.test(raw)) return false;
  if (QUESTION.test(raw) && raw.includes('?')) return false;
  return OWN.some((pattern) => pattern.test(raw));
}

/**
 * The post already carries this offer, so it is ours.
 * @param {string} text
 * @param {string} line
 */
export function alreadyOurOffer(text, line) {
  const url = String(line || '').match(/https?:\/\/\S+/)?.[0]?.replace(/[.?!,)]+$/, '') || '';
  if (url.length < 8) return false;
  return String(text || '').includes(url);
}

/**
 * First sentence of the campaign offer, plus its link. No extra claim.
 * @param {{ offer_summary?: string, offer?: string }} campaign
 */
export function engagementLine(campaign) {
  const facts = String(campaign?.offer_summary || campaign?.offer || '').trim();
  if (!facts) return '';
  const url = facts.match(/https?:\/\/\S+/)?.[0] || '';
  const sentence = facts.replace(url, '').split(/(?<=[.!?])\s/)[0].replace(/\s+/g, ' ').trim();
  const room = 240 - (url ? url.length + 1 : 0);
  const core = clip(sentence || facts.replace(url, '').trim(), Math.max(24, room)).trim();
  return clip(`${core}${url ? ` ${url}` : ''}`.replace(/\s+/g, ' ').trim(), 240);
}

/** @param {string} id */
export function holdEngagement(id) {
  const key = `engage_hold_${String(id || '').trim()}`;
  if (key === 'engage_hold_') return { ok: false, code: 'missing' };
  const now = nowIso();
  run(
    `INSERT INTO app_meta (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    key,
    now,
  );
  return { ok: true, at: now };
}

/** @param {string} id */
export function engagementHeld(id) {
  const row = get('SELECT value FROM app_meta WHERE key = ?', `engage_hold_${id}`);
  const then = Date.parse(String(row?.value || ''));
  return Number.isFinite(then) && Date.now() - then < HOLD_MS;
}

/** @param {string} ref */
export function alreadyEngaged(ref) {
  if (!ref) return false;
  return Boolean(get(
    `SELECT id FROM events WHERE team = 'reach' AND kind = 'engage' AND ref = ? LIMIT 1`,
    String(ref),
  ));
}

/**
 * @param {string} ref
 * @param {string} detail
 */
export function rememberEngagement(ref, detail) {
  if (!ref || alreadyEngaged(ref)) return { ok: true, duplicate: true };
  recordEvent('reach', 'engage', ref, detail);
  return { ok: true };
}

/** @param {string} channel */
function engagedToday(channel) {
  return Number(get(
    `SELECT COUNT(*) AS n FROM events
     WHERE team = 'reach' AND kind = 'engage' AND ref LIKE ? AND at >= ?`,
    `${channel}:%`,
    startOfLocalDayIso(),
  ).n);
}

/** @param {string} channel */
function channelOpen(channel) {
  const perm = channelMode(channel);
  if (perm.mode === 'off' || perm.mode === 'draft') return false;
  if (perm.mode === 'approve' && !fullPower()) return false;
  return sentToday(channel) + engagedToday(channel) < Number(perm.daily_cap);
}

/**
 * @param {{ id: string, action: string, site: string, channel: string }} step
 * @param {Record<string, unknown>} row
 */
function eligible(step, row) {
  if (!fullPower() || agentMode('reach') === 'off') return false;
  if (!row || row.human_verdict === 'wrong') return false;
  if (row.human_verdict !== 'try') {
    if (engagementHeld(step.id)) return false;
    if (adaptabilityOn() && row.result === 'failed') return false;
    if (pathBlocks(step)) return false;
  }
  if (!channelOpen(step.channel)) return false;
  if (step.action === 'dm' && channelHeld(step.channel)) return false;
  return true;
}

/** @param {{ action: string, id: string, site: string }} step */
function pathBlocks(step) {
  const looked = pathLookup(step.site);
  if (!looked.ok) return false;
  const choice = `${step.action} ${step.id}`;
  const branch = looked.branches.find((row) => row.from_node === 'feed' && row.choice === choice);
  return Boolean(branch && (branch.outcome === 'stop' || branch.outcome === 'refused'));
}

/**
 * @param {{ id: string, platform: string, channel: string, action: string, site: string }} step
 */
function shape(step) {
  return {
    id: step.id,
    platform: step.platform,
    channel: step.channel,
    action: step.action,
    site: step.site,
  };
}

/** The next reply, comment, or DM. Null when Full power is off, or every step is blocked. */
export function nextEngagement() {
  const ready = [];
  for (const step of ENGAGEMENTS) {
    const row = get('SELECT * FROM strategies WHERE id = ?', step.id);
    if (eligible(step, row)) ready.push({ step, row });
  }
  if (!ready.length) return null;
  const marked = ready.find((item) => item.row.human_verdict === 'try');
  if (marked) return shape(marked.step);
  if (!adaptabilityOn()) return shape(ready[0].step);
  const fresh = ready.find((item) => item.row.result === 'open' && Number(item.row.tries) === 0);
  if (fresh) return shape(fresh.step);
  const open = ready
    .filter((item) => item.row.result === 'open')
    .sort((a, b) => Number(a.row.tries) - Number(b.row.tries));
  if (open[0]) return shape(open[0].step);
  const worked = ready.find((item) => item.row.result === 'worked');
  return worked ? shape(worked.step) : null;
}

/**
 * Record the path and the strategy for one try. A miss stays open.
 * A Premium wall, a login, or a closed X inbox fails that step.
 * @param {{ id: string, action: string, site: string, channel: string }} step
 * @param {{ ok?: boolean, code?: string, detail?: string, ref?: string, clicked?: boolean, hold?: boolean }} result
 */
export function learnEngagement(step, result) {
  if (!step?.id) return { ok: false, code: 'missing' };
  const code = String(result?.code || '');
  if (code === 'browser_disabled' || code === 'held') return { ok: true, outcome: 'retry', skipped: true };
  const detail = clip(result?.detail || code || 'No page matched.', 300);
  const xDmClosed = step.id === 'x-dm' && code === 'inbox_closed';
  let outcome = 'retry';
  if (result?.ok || code === 'posted' || code === 'sent') outcome = 'reached';
  else if (code === 'premium_wall' || code === 'login' || xDmClosed) outcome = 'stop';
  const recorded = pathRecord({
    site: step.site,
    fromNode: 'feed',
    choice: `${step.action} ${step.id}`,
    toNode: clip(code || 'again', 80),
    outcome,
    see: detail,
    note: detail,
  });
  if (code === 'premium_wall' || code === 'login' || xDmClosed) {
    if (!xDmClosed) holdEngagement(step.id);
    recordStrategy(step.id, 'failed', detail, 'agent');
    if (code === 'premium_wall') holdChannel(step.channel);
  } else if (code === 'captcha' || result?.hold) {
    holdEngagement(step.id);
  } else if (outcome === 'reached') {
    recordStrategy(step.id, 'worked', detail, 'agent');
  } else {
    const current = get('SELECT result FROM strategies WHERE id = ?', step.id);
    recordStrategy(step.id, current?.result === 'worked' ? 'worked' : 'open', detail, 'agent');
  }
  if (result?.ref && (result.clicked || xDmClosed)) rememberEngagement(result.ref, `${step.channel} ${step.action} ${detail}`);
  return { ok: recorded.ok, outcome };
}
