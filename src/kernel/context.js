// src/kernel/context.js — one bounded slice per call so the brain does not load the whole database.
//
// Owns: the slice names and the 6000-character cap.
// Must not: write.
// Reads: the team tables, through their list functions.

import { all, get } from './db.js';
import { recentEvents } from './events.js';
import { plan } from './flows.js';
import { dashboard } from './stats.js';
import { clip } from './text.js';
import { listContent } from '../create/drafts.js';
import { listLeads } from '../discover/leads.js';
import { campaignView } from '../gtm/campaigns.js';
import { dueFollowups } from '../reach/followups.js';
import { getSettings, listAgents } from './desk.js';
import { listPermissions } from '../reach/gate.js';
import { listMessages } from '../reach/rows.js';
import { getBusiness, listAnswers, openQuestions, profileGaps } from '../understand/profile.js';
import { listSources } from '../understand/sources.js';
import { listPages } from '../understand/website.js';
import { listStalls } from '../trace/stalls.js';

const CAP = 6000;

export const SLICE_NAMES = [
  'home', 'profile', 'permissions', 'pipeline', 'approvals',
  'followups', 'campaign', 'drafts', 'encounter', 'browser', 'paths',
];

function shrinkLead(row) {
  return {
    id: row.id,
    source: row.source,
    name: row.name,
    company: row.company,
    role: row.role,
    email: row.email,
    handle: row.handle,
    fit: row.fit,
    status: row.status,
    snippet: clip(row.snippet, 160),
    url: row.source_url,
  };
}

function shrinkMessage(row) {
  return {
    id: row.id,
    leadId: row.lead_id,
    lead: row.lead_name,
    company: row.lead_company,
    channel: row.channel,
    kind: row.kind,
    status: row.status,
    due_at: row.due_at || '',
    subject: clip(row.subject, 120),
    body: clip(row.body, 280),
  };
}

function home() {
  const step = plan();
  return {
    plan: { flow: step.flow, step: step.step, tool: step.tool, why: step.why, url: step.url },
    counts: dashboard(),
    stalls: listStalls('open').map((row) => ({
      id: row.id, code: row.code, step: row.step, ref: row.ref, detail: clip(row.detail, 240),
    })),
    events: recentEvents(5).map((row) => ({
      at: row.at, team: row.team, kind: row.kind, detail: clip(row.detail, 80),
    })),
  };
}

function profile() {
  const business = getBusiness();
  return {
    gaps: profileGaps(),
    business: {
      name: business.name,
      website: business.website,
      one_liner: business.one_liner,
      offer: clip(business.offer, 500),
      audience: clip(business.audience, 500),
      problem: clip(business.problem, 400),
      proof: clip(business.proof, 300),
      price_band: business.price_band,
      geos: business.geos,
      tone: business.tone,
      do_not_contact: clip(business.do_not_contact, 300),
      sender_name: business.sender_name,
      sender_email: business.sender_email,
    },
    answers: listAnswers().slice(0, 12).map((row) => ({
      question: row.question, answer: clip(row.answer, 180),
    })),
    openQuestions: openQuestions(),
    pages: listPages().map((row) => ({ url: row.url, title: row.title, excerpt: clip(row.excerpt, 180) })),
    sources: listSources().slice(0, 6).map((row) => ({
      id: row.id,
      kind: row.kind,
      platform: row.platform,
      url: row.url,
      label: row.label,
      status: row.status,
      excerpt: clip(row.excerpt, 220),
    })),
  };
}

function pathSlice(opts) {
  const site = String(opts.site || '').trim().toLowerCase();
  if (!site) return { note: 'Pass site, for example linkedin.com' };
  return {
    site,
    nodes: all('SELECT node_key, see FROM path_nodes WHERE site = ? ORDER BY node_key LIMIT 12', site),
    branches: all(
      'SELECT from_node, choice, to_node, outcome, note FROM path_branches WHERE site = ? ORDER BY id DESC LIMIT 16',
      site,
    ).map((row) => ({
      from: row.from_node,
      choice: row.choice,
      to: row.to_node,
      outcome: row.outcome,
      note: clip(row.note, 120),
    })),
    rule: 'Follow reached and success. Do not follow stop or refused.',
  };
}

const BUILDERS = {
  home,
  profile,
  permissions: () => ({ channels: listPermissions(), desk: getSettings(), lanes: listAgents() }),
  pipeline: () => ({ leads: listLeads({ limit: 8 }).map(shrinkLead) }),
  approvals: () => ({
    messages: listMessages({ open: true, limit: 8 }).map(shrinkMessage),
  }),
  followups: () => ({ due: dueFollowups(8).map(shrinkMessage) }),
  campaign: (opts) => campaignView(Number(opts.campaignId) || undefined),
  drafts: () => ({
    content: listContent({ limit: 8 }).map((row) => ({
      id: row.id,
      channel: row.channel,
      status: row.status,
      title: row.title,
      body: clip(row.body, 220),
    })),
  }),
  encounter: () => ({
    encounter: get(
      "SELECT id, site, url, kind, detail, status, created_at FROM encounters WHERE status = 'open' ORDER BY id DESC LIMIT 1",
    ) || null,
  }),
  browser: () => {
    const row = get('SELECT mode, port, url, title, blocker, excerpt, updated_at FROM browser_state WHERE id = 1');
    if (!row) return { browser: null };
    return { browser: { ...row, excerpt: clip(row.excerpt, 400) } };
  },
  paths: pathSlice,
};

/**
 * @param {string} name
 * @param {Record<string, unknown>} [opts]
 */
export function contextSlice(name, opts = {}) {
  const build = BUILDERS[name];
  if (!build) return { ok: false, code: 'unknown_slice', slices: SLICE_NAMES };
  let data = build(opts);
  let text = JSON.stringify(data);
  if (text.length > CAP) {
    data = { note: 'Slice was cut. Ask for one id.', head: text.slice(0, CAP - 180) };
    text = JSON.stringify(data);
  }
  return { ok: true, slice: name, chars: text.length, data };
}
