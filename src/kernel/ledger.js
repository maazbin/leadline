// src/kernel/ledger.js — the crew ledger the master reviews.
//
// Owns: agent_ledger. One row per lane.
// Must not: send, approve, draft, or change a lane mode.
// Reads: lane modes, the profile, the campaign, leads, messages, and open stalls.
// Writes: agent_ledger. An event only when the set of stuck lanes changes.
//
// Required while Run is on: Understand, Discover, GTM, Reach, Trace.
// Create and Virality may stay off. That is not a fault.
// The harness calls reviewLedger on each 20s beat and once when the desk starts.

import { all, get, run } from './db.js';
import { agentMode, deskRunning, fullPower } from './desk.js';
import { CREW, LEDGER_STATUSES, oneOf } from './enums.js';
import { recordEvent } from './events.js';
import { clip } from './text.js';
import { nowIso } from './time.js';
import { leadsAwaitingMessage, listLeads } from '../discover/leads.js';
import { newestCampaign } from '../gtm/campaigns.js';
import { canSend } from '../reach/gate.js';
import { listMessages } from '../reach/rows.js';
import { listStalls } from '../trace/stalls.js';
import { profileGaps } from '../understand/profile.js';

export const LEDGER_LABEL = {
  working: 'Working',
  waiting: 'Waiting on you',
  stuck: 'Needs a look',
  off: 'Off',
  paused: 'Paused',
};

const GAP_WORDS = {
  name: 'a business name',
  offer: 'what you sell',
  audience: 'who it is for',
  problem: 'the problem',
  sender_name: 'your name',
  website_or_notes: 'a website or some notes',
};

/**
 * @param {'open' | 'all'} [which]
 */
export function listLedger() {
  const rows = all(
    'SELECT agent, status, required, detail, reviewed_at FROM agent_ledger',
  );
  const byAgent = new Map(rows.map((row) => [row.agent, row]));
  return CREW.map((spec) => {
    const row = byAgent.get(spec.id);
    return {
      agent: spec.id,
      label: spec.label,
      job: spec.job,
      required: spec.required,
      status: row?.status || '',
      detail: row?.detail || '',
      reviewedAt: row?.reviewed_at || '',
    };
  });
}

/**
 * @param {Array<{ status: string, label: string }>} lanes
 */
export function ledgerSummary(lanes) {
  if (!lanes.length || lanes.every((row) => !row.status)) return 'The master has not checked the crew yet.';
  if (lanes.every((row) => row.status === 'paused')) return 'The desk is stopped. The lanes are not expected to move.';
  const stuck = lanes.filter((row) => row.status === 'stuck');
  if (!stuck.length) return 'The required lanes are working.';
  if (stuck.length === 1) return `${stuck[0].label} needs a look.`;
  return `${stuck.map((row) => row.label).join(', ')} need a look.`;
}

/**
 * Rewrite every crew row from the desk as it is now.
 * @returns {{ ok: true, fine: boolean, reviewedAt: string, lanes: ReturnType<typeof listLedger> }}
 */
export function reviewLedger() {
  const reviewedAt = nowIso();
  const before = stuckIds();
  const facts = readFacts();
  for (const spec of CREW) {
    const verdict = judge(spec, facts);
    if (!oneOf(LEDGER_STATUSES, verdict.status)) continue;
    run(
      `INSERT INTO agent_ledger (agent, status, required, detail, reviewed_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(agent) DO UPDATE SET
         status = excluded.status,
         required = excluded.required,
         detail = excluded.detail,
         reviewed_at = excluded.reviewed_at`,
      spec.id,
      verdict.status,
      spec.required ? 1 : 0,
      clip(verdict.detail, 500),
      reviewedAt,
    );
  }
  const lanes = listLedger();
  const after = lanes.filter((row) => row.status === 'stuck').map((row) => row.agent).sort();
  if (before.join() !== after.join()) {
    recordEvent('kernel', 'ledger', 'review', after.length ? after.join(', ') : 'crew fine');
  }
  return { ok: true, fine: after.length === 0, reviewedAt, lanes };
}

function stuckIds() {
  return get('SELECT 1 FROM agent_ledger LIMIT 1')
    ? all(`SELECT agent FROM agent_ledger WHERE status = 'stuck' ORDER BY agent`).map((row) => row.agent)
    : [];
}

function readFacts() {
  const stalls = listStalls('open');
  const openMessages = listMessages({ open: true, limit: 20 });
  return {
    running: deskRunning(),
    power: fullPower(),
    gaps: profileGaps(),
    campaign: newestCampaign(),
    unreviewed: listLeads({ fit: 'unreviewed', limit: 1 }).length,
    waitingLeads: leadsAwaitingMessage(),
    stalls,
    sendable: openMessages.some((row) => canSend(row.id).ok),
  };
}

/**
 * @param {{ id: string, label: string, required: boolean }} spec
 * @param {ReturnType<typeof readFacts>} facts
 */
function judge(spec, facts) {
  if (!facts.running) {
    return { status: 'paused', detail: 'The desk is stopped. This lane is not expected to move.' };
  }
  const mode = agentMode(spec.id);
  if (mode === 'off') {
    return spec.required
      ? { status: 'stuck', detail: `${spec.label} is off. Turn it on in Settings. The master needs it while the desk is running.` }
      : { status: 'off', detail: `${spec.label} is off. That is allowed. Turn it on in Settings when you want it.` };
  }
  if (spec.id === 'understand') return judgeUnderstand(facts);
  if (spec.id === 'discover') return judgeDiscover(facts);
  if (spec.id === 'gtm') return judgeGtm(facts);
  if (spec.id === 'reach') return judgeReach(mode, facts);
  if (spec.id === 'create') return judgeCreate(mode);
  if (spec.id === 'virality') return judgeVirality(mode);
  return judgeTrace(facts);
}

/**
 * @param {ReturnType<typeof readFacts>} facts
 */
function judgeUnderstand(facts) {
  if (facts.gaps.length) {
    const words = facts.gaps.map((gap) => GAP_WORDS[gap] || gap).join(', ');
    return { status: 'working', detail: `The profile still needs ${words}.` };
  }
  return { status: 'working', detail: 'The profile is filled.' };
}

/**
 * @param {ReturnType<typeof readFacts>} facts
 */
function judgeDiscover(facts) {
  if (facts.unreviewed) return { status: 'working', detail: 'Someone still needs a yes or no.' };
  return { status: 'working', detail: 'No one is waiting on a judgment.' };
}

/**
 * @param {ReturnType<typeof readFacts>} facts
 */
function judgeGtm(facts) {
  const campaign = facts.campaign;
  if (!campaign) return { status: 'working', detail: 'A campaign still has to be written.' };
  if (campaign.status === 'draft' && facts.power) {
    return { status: 'working', detail: `${campaign.name} is drafted. The desk starts it on the next pass.` };
  }
  if (campaign.status === 'draft') {
    return { status: 'waiting', detail: `${campaign.name} is drafted. Press Start on GTM.` };
  }
  if (campaign.status === 'paused') return { status: 'waiting', detail: `${campaign.name} is paused.` };
  if (campaign.status === 'done') return { status: 'working', detail: `${campaign.name} is marked done.` };
  return { status: 'working', detail: `${campaign.name} is running.` };
}

/**
 * @param {string} mode
 * @param {ReturnType<typeof readFacts>} facts
 */
function judgeReach(mode, facts) {
  const composer = facts.stalls.find((row) => row.code === 'composer');
  if (composer) return { status: 'stuck', detail: composer.detail || 'The note is not in the box, so Send was not clicked.' };
  const waiting = facts.waitingLeads[0];
  if (waiting) {
    const name = String(waiting.name || 'A person').trim() || 'A person';
    return { status: 'stuck', detail: `${name} is marked yes and has no message, so there is nothing to send.` };
  }
  if (facts.power && mode !== 'auto') {
    return { status: 'waiting', detail: 'Full power is on, and Reach still asks before a send.' };
  }
  if (mode === 'draft' || mode === 'approve') {
    return { status: 'waiting', detail: 'Reach asks before a send.' };
  }
  if (facts.sendable) return { status: 'working', detail: 'One message can go out.' };
  return { status: 'working', detail: 'Nothing is waiting to send.' };
}

/**
 * @param {string} mode
 */
function judgeCreate(mode) {
  if (mode === 'auto') return { status: 'working', detail: 'Create can draft a post. You still publish it.' };
  return { status: 'waiting', detail: 'Posts stay drafts until you publish them.' };
}

/**
 * @param {string} mode
 */
function judgeVirality(mode) {
  if (mode === 'auto') return { status: 'working', detail: 'Virality can try one pattern. It does not post.' };
  return { status: 'waiting', detail: 'Virality is waiting. It does not post on its own.' };
}

/**
 * @param {ReturnType<typeof readFacts>} facts
 */
function judgeTrace(facts) {
  const open = facts.stalls.length;
  if (!open) return { status: 'working', detail: 'Nothing is stuck.' };
  const noun = open === 1 ? 'line' : 'lines';
  return { status: 'working', detail: `Holding ${open} open ${noun}.` };
}
