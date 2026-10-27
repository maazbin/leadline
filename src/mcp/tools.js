// src/mcp/tools.js — the tools a coding agent may call. One action each.
//
// Owns: the tool list and the profile gate in front of it.
// Must not: approve one message, mark a message sent, or mark content published.
// begin() is the one start. Call it only after the person says yes or no.
// The brain decides. These functions do the one thing they are named for.

import { executeSend, openUrl, prepareMessage, snapshot, typeIntoPage, clickText } from '../browser/act.js';
import { launchChrome, cdpStatus } from '../browser/chrome.js';
import { recordEncounter, resolveEncounter } from '../browser/encounters.js';
import { pathLookup, pathRecord } from '../browser/paths.js';
import { saveContent } from '../create/drafts.js';
import { listLeads, saveLead, searchLeads, setFit, setLeadOutcome } from '../discover/leads.js';
import { redditPublicSearch } from '../discover/reddit.js';
import { discoverHints } from '../discover/sources.js';
import { createCampaign, campaignView } from '../gtm/campaigns.js';
import { contextSlice } from '../kernel/context.js';
import { begin, getSettings, listAgents, startConsent } from '../kernel/desk.js';
import { listStrategies, nextStrategy, recordStrategy } from '../kernel/strategies.js';
import { nextAction } from '../kernel/flows.js';
import { reviewLedger } from '../kernel/ledger.js';
import { webOrigin } from '../kernel/ports.js';
import { clip } from '../kernel/text.js';
import { listPermissions } from '../reach/gate.js';
import { dueFollowups, writeFollowup } from '../reach/followups.js';
import { cancelMessage, draftMessage, requestApproval } from '../reach/messages.js';
import { listMessages } from '../reach/rows.js';
import {
  askPerson, findAnswer, getBusiness, learnAnswer, listAnswers, openQuestions, profileGaps,
} from '../understand/profile.js';
import { addLinks, addPdfFile, fillProfile, listSources, readSource } from '../understand/sources.js';
import { readWebsite } from '../understand/website.js';
import { syncStalls } from '../trace/stalls.js';

const OPEN = new Set([
  'next_action', 'context_slice', 'onboard_status', 'open_setup', 'read_website', 'get_profile',
  'add_materials', 'add_pdf', 'read_source', 'fill_profile',
  'learn_answer', 'list_answers', 'find_answer', 'ask_person', 'launch_chrome', 'browser_open',
  'browser_snapshot', 'browser_click', 'browser_type', 'record_encounter', 'resolve_encounter',
  'path_lookup', 'path_record', 'desk_status', 'list_strategies', 'next_strategy', 'record_strategy',
  'begin', 'review_ledger',
]);

const schema = {
  type: 'object',
  properties: {},
};

/**
 * @param {Record<string, unknown>} properties
 * @param {string[]} [required]
 */
function input(properties = {}, required = []) {
  return { type: 'object', properties, ...(required.length ? { required } : {}) };
}

export const TOOLS = [
  {
    name: 'next_action',
    description: 'Call this first. Returns one step. Do that step only, then call next_action again. lane "create" is the content team and does not send.',
    inputSchema: input({ lane: { type: 'string', enum: ['main', 'create'] } }),
    handler: ({ lane }) => nextAction(lane === 'create' ? 'create' : 'main'),
  },
  {
    name: 'context_slice',
    description: 'Read one named slice. Do not request every slice. Names: home, profile, permissions, pipeline, approvals, followups, campaign, drafts, encounter, browser, paths.',
    inputSchema: input({
      name: { type: 'string' },
      campaignId: { type: 'number' },
      site: { type: 'string' },
    }, ['name']),
    handler: (args) => contextSlice(String(args.name || ''), args),
  },
  {
    name: 'onboard_status',
    description: 'Profile gaps, the setup URL, Chrome debug status, and channel modes. Search and outreach wait until gaps is empty.',
    inputSchema: schema,
    handler: async () => ({
      ok: true,
      phase: profileGaps().length ? 'understand' : 'ready',
      gaps: profileGaps(),
      url: `${webOrigin()}/setup`,
      chrome: await cdpStatus(),
      permissions: listPermissions().map((row) => ({
        channel: row.channel, mode: row.mode, daily_cap: row.daily_cap, sent_today: row.sent_today,
      })),
      openQuestions: openQuestions(),
      sources: listSources().map((row) => ({
        id: row.id, kind: row.kind, platform: row.platform, status: row.status, label: row.label,
      })),
    }),
  },
  {
    name: 'open_setup',
    description: 'Give the person the setup URL. They can type the form, or hand over a PDF and their website and social URLs. Do not invent the profile.',
    inputSchema: schema,
    handler: () => openControl('/setup'),
  },
  {
    name: 'read_website',
    description: 'Read the person\'s site into the database. Does not overwrite their offer or audience. They save those on the setup page.',
    inputSchema: input({ url: { type: 'string' } }, ['url']),
    handler: ({ url }) => readWebsite(url),
  },
  {
    name: 'get_profile',
    description: 'The business profile and the remaining gaps.',
    inputSchema: schema,
    handler: () => {
      const business = getBusiness();
      return {
        ok: true,
        gaps: profileGaps(),
        business: { ...business, offer: clip(business.offer, 800), extra: clip(business.extra, 1200) },
        openQuestions: openQuestions(),
        sources: listSources().map((row) => ({
          id: row.id, kind: row.kind, platform: row.platform, status: row.status, label: row.label,
        })),
      };
    },
  },
  {
    name: 'add_materials',
    description: 'Store the person\'s website and their own social profile URLs, one per line. Social profiles are not read until that account is signed in on the Leadline Chrome. This does not fill the business fields.',
    inputSchema: input({ links: { type: 'string' } }, ['links']),
    handler: ({ links }) => addLinks(links),
  },
  {
    name: 'add_pdf',
    description: 'Store a PDF the person gave you. Pass an absolute path ending in .pdf. Text is extracted on this machine. A scan with no text is kept as no_text and is not treated as a profile.',
    inputSchema: input({ path: { type: 'string' } }, ['path']),
    handler: ({ path }) => addPdfFile(path),
  },
  {
    name: 'read_source',
    description: 'Read one stored material by id. A social profile is opened in the Leadline Chrome only after a signed-in check. A login wall returns needs_login and stores nothing about the business.',
    inputSchema: input({ id: { type: 'number' } }, ['id']),
    handler: ({ id }) => readSource(id),
  },
  {
    name: 'fill_profile',
    description: 'Write empty profile fields from facts that appear in a read PDF, site, or signed-in profile. Skips a field the person already typed. Rejects a value that is not in the material.',
    inputSchema: input({
      name: { type: 'string' },
      website: { type: 'string' },
      one_liner: { type: 'string' },
      offer: { type: 'string' },
      audience: { type: 'string' },
      problem: { type: 'string' },
      proof: { type: 'string' },
      price_band: { type: 'string' },
      geos: { type: 'string' },
      tone: { type: 'string' },
      sender_name: { type: 'string' },
      sender_email: { type: 'string' },
      extra: { type: 'string' },
    }),
    handler: (args) => fillProfile(args, 'agent'),
  },
  {
    name: 'list_answers',
    description: 'Answers the person has saved. Do not invent a price, a customer, or a claim that is not here.',
    inputSchema: schema,
    handler: () => ({ ok: true, answers: listAnswers() }),
  },
  {
    name: 'find_answer',
    description: 'Look up one question in the answer bank before asking the person again.',
    inputSchema: input({ question: { type: 'string' } }, ['question']),
    handler: ({ question }) => {
      const found = findAnswer(question);
      return found ? { ok: true, found: true, answer: found.answer, source: found.source } : { ok: true, found: false };
    },
  },
  {
    name: 'learn_answer',
    description: 'Store an answer you inferred. A person\'s answer wins and will not be overwritten.',
    inputSchema: input({ question: { type: 'string' }, answer: { type: 'string' } }, ['question', 'answer']),
    handler: ({ question, answer }) => learnAnswer(question, answer, 'agent'),
  },
  {
    name: 'ask_person',
    description: 'Ask once, on the setup page. If the answer is already known, this returns it. Do not invent the answer, and keep working other leads.',
    inputSchema: input({ question: { type: 'string' } }, ['question']),
    handler: ({ question }) => askPerson(question),
  },
  {
    name: 'discover_hints',
    description: 'Search URLs built from the profile. Open them with browser_open. Do not message from a search page.',
    inputSchema: schema,
    handler: () => discoverHints(),
  },
  {
    name: 'reddit_search',
    description: 'One public Reddit search. Returns candidates. Does not save or message them.',
    inputSchema: input({ query: { type: 'string' } }, ['query']),
    handler: ({ query }) => redditPublicSearch(query),
  },
  {
    name: 'save_lead',
    description: 'Save one person after you have read the page. Dedups by URL and by email. A do-not-contact match is stored as skipped.',
    inputSchema: input({
      source: { type: 'string' },
      source_url: { type: 'string' },
      name: { type: 'string' },
      company: { type: 'string' },
      role: { type: 'string' },
      email: { type: 'string' },
      handle: { type: 'string' },
      location: { type: 'string' },
      snippet: { type: 'string' },
      campaignId: { type: 'number' },
    }, ['source', 'source_url']),
    handler: (args) => saveLead(args),
  },
  {
    name: 'list_leads',
    description: 'Leads, newest first, capped. Filter by fit or status.',
    inputSchema: input({ fit: { type: 'string' }, status: { type: 'string' }, q: { type: 'string' }, limit: { type: 'number' } }),
    handler: (args) => ({
      ok: true,
      leads: listLeads(args).map((row) => ({ ...row, snippet: clip(row.snippet, 240) })),
    }),
  },
  {
    name: 'search_leads',
    description: 'Full-text search over name, company, role, and snippet.',
    inputSchema: input({ q: { type: 'string' } }, ['q']),
    handler: ({ q }) => ({ ok: true, leads: searchLeads(q) }),
  },
  {
    name: 'set_lead_fit',
    description: 'Your judgment: yes, maybe, no, or unreviewed, plus a reason. Do not message a lead you have not marked yes.',
    inputSchema: input({ id: { type: 'number' }, fit: { type: 'string' }, reason: { type: 'string' } }, ['id', 'fit']),
    handler: ({ id, fit, reason }) => setFit(Number(id), fit, reason || ''),
  },
  {
    name: 'set_lead_outcome',
    description: 'Close a lead as replied, won, or lost. This cancels unsent messages. It cannot reopen a lead.',
    inputSchema: input({ id: { type: 'number' }, status: { type: 'string' } }, ['id', 'status']),
    handler: ({ id, status }) => setLeadOutcome(Number(id), status, 'agent'),
  },
  {
    name: 'draft_message',
    description: 'Write one message and leave it a draft. Does not send. Requires fit yes for a first message.',
    inputSchema: input({
      leadId: { type: 'number' }, channel: { type: 'string' }, subject: { type: 'string' }, body: { type: 'string' },
    }, ['leadId', 'channel', 'body']),
    handler: (args) => draftMessage({
      leadId: Number(args.leadId), channel: args.channel, subject: args.subject, body: args.body,
    }),
  },
  {
    name: 'list_messages',
    description: 'Recent messages. Pass status to narrow them.',
    inputSchema: input({ status: { type: 'string' }, limit: { type: 'number' } }),
    handler: (args) => ({
      ok: true,
      messages: listMessages(args).map((row) => ({
        id: row.id,
        leadId: row.lead_id,
        lead: row.lead_name,
        company: row.lead_company,
        channel: row.channel,
        kind: row.kind,
        status: row.status,
        due_at: row.due_at,
        subject: row.subject,
        body: clip(row.body, 600),
      })),
    }),
  },
  {
    name: 'request_approval',
    description: 'Move a draft to the Reach page. Does not approve it and does not send it.',
    inputSchema: input({ messageId: { type: 'number' } }, ['messageId']),
    handler: ({ messageId }) => requestApproval(Number(messageId)),
  },
  {
    name: 'cancel_message',
    description: 'Cancel a message that has not been sent.',
    inputSchema: input({ messageId: { type: 'number' } }, ['messageId']),
    handler: ({ messageId }) => cancelMessage(Number(messageId)),
  },
  {
    name: 'schedule_followup',
    description: 'Write the body of a follow-up. Does not send it. messageId is the sent parent or the follow-up row.',
    inputSchema: input({ messageId: { type: 'number' }, days: { type: 'number' }, body: { type: 'string' } }, ['messageId']),
    handler: (args) => writeFollowup({ messageId: Number(args.messageId), days: args.days, body: args.body }),
  },
  {
    name: 'list_due_followups',
    description: 'Follow-ups whose due time has passed and that are not sent.',
    inputSchema: schema,
    handler: () => ({ ok: true, followups: dueFollowups(10) }),
  },
  {
    name: 'prepare_message',
    description: 'Open the compose page or the lead URL. Does not click Send.',
    inputSchema: input({ messageId: { type: 'number' } }, ['messageId']),
    handler: ({ messageId }) => prepareMessage(Number(messageId)),
  },
  {
    name: 'execute_send',
    description: 'Send the one message next_action named. Refuses unless the gate passes. Stops on a captcha or a login wall and does not try to pass it.',
    inputSchema: input({ messageId: { type: 'number' } }, ['messageId']),
    handler: ({ messageId }) => executeSend(Number(messageId)),
  },
  {
    name: 'create_campaign',
    description: 'Create a draft campaign. You cannot start it. The person presses Start on the GTM page.',
    inputSchema: input({
      name: { type: 'string' }, goal: { type: 'string' }, offerSummary: { type: 'string' },
      icpSummary: { type: 'string' }, followupDays: { type: 'number' }, channels: { type: 'array' },
    }, ['name', 'channels']),
    handler: (args) => createCampaign(args),
  },
  {
    name: 'campaign_view',
    description: 'Counts for one campaign, or the active one when id is omitted.',
    inputSchema: input({ id: { type: 'number' } }),
    handler: ({ id }) => campaignView(Number(id) || undefined),
  },
  {
    name: 'create_content',
    description: 'Save a content draft. You cannot approve it or mark it published.',
    inputSchema: input({
      campaignId: { type: 'number' }, channel: { type: 'string' }, title: { type: 'string' }, body: { type: 'string' },
    }, ['channel', 'body']),
    handler: (args) => saveContent({
      campaignId: Number(args.campaignId) || null, channel: args.channel, title: args.title, body: args.body,
    }),
  },
  {
    name: 'launch_chrome',
    description: 'Open the dedicated Leadline Chrome. mode debug attaches the port. mode manual is the normal window for a site that blocks the debug port. Does not kill the person\'s daily Chrome and does not spoof the browser.',
    inputSchema: input({ mode: { type: 'string', enum: ['debug', 'manual'] } }),
    handler: ({ mode }) => launchChrome({ mode: mode === 'manual' ? 'manual' : 'debug' }),
  },
  {
    name: 'browser_open',
    description: 'Open one http(s) URL in the Leadline Chrome and return a short snapshot.',
    inputSchema: input({ url: { type: 'string' } }, ['url']),
    handler: ({ url }) => openUrl(url),
  },
  {
    name: 'browser_snapshot',
    description: 'Read the current page: url, title, a short excerpt, controls, and blocker if the page is a captcha or a login wall.',
    inputSchema: schema,
    handler: () => snapshot(),
  },
  {
    name: 'browser_click',
    description: 'Click visible text. Refuses Send, Submit, Post, Publish, and Apply. Refuses a captcha or a login wall.',
    inputSchema: input({ text: { type: 'string' } }, ['text']),
    handler: ({ text }) => clickText(text),
  },
  {
    name: 'browser_type',
    description: 'Type into the text box on the page. Does not press Enter. Refuses a captcha or a login wall, so do not type a password here.',
    inputSchema: input({ text: { type: 'string' } }, ['text']),
    handler: ({ text }) => typeIntoPage(text),
  },
  {
    name: 'record_encounter',
    description: 'Remember a stuck page. kind is captcha, login, stuck, or error. Do not include personal data.',
    inputSchema: input({
      site: { type: 'string' }, url: { type: 'string' }, kind: { type: 'string' }, detail: { type: 'string' },
    }, ['site', 'kind']),
    handler: (args) => recordEncounter(args),
  },
  {
    name: 'resolve_encounter',
    description: 'Close an encounter with what the next run should do instead.',
    inputSchema: input({ id: { type: 'number' }, resolution: { type: 'string' } }, ['id', 'resolution']),
    handler: ({ id, resolution }) => resolveEncounter(Number(id), resolution, 'agent'),
  },
  {
    name: 'path_lookup',
    description: 'The decision memory for one site. Follow reached and success. Do not follow stop or refused.',
    inputSchema: input({ site: { type: 'string' } }, ['site']),
    handler: ({ site }) => pathLookup(site),
  },
  {
    name: 'path_record',
    description: 'Record one hop. outcome is reached, success, stop, refused, or retry. No personal data and no tracking query.',
    inputSchema: input({
      site: { type: 'string' }, fromNode: { type: 'string' }, choice: { type: 'string' },
      toNode: { type: 'string' }, outcome: { type: 'string' }, see: { type: 'string' }, note: { type: 'string' },
    }, ['site', 'fromNode', 'choice', 'outcome']),
    handler: (args) => pathRecord(args),
  },
  {
    name: 'desk_status',
    description: 'Run, Full power, Adapt, and the lane modes. Read this before outreach. You cannot change these switches.',
    inputSchema: schema,
    handler: () => ({
      ok: true,
      ...getSettings(),
      lanes: listAgents(),
      start: startConsent(),
      asksBeforeSend: !Number(getSettings().full_power),
    }),
  },
  {
    name: 'list_strategies',
    description: 'Playbook per platform. A human verdict of wrong means skip that step. Adapt prefers what worked.',
    inputSchema: schema,
    handler: () => ({ ok: true, adaptability: Number(getSettings().adaptability) === 1, strategies: listStrategies() }),
  },
  {
    name: 'next_strategy',
    description: 'The step to try next on one platform, such as Instagram or X. Follow it. Do not use a step marked wrong.',
    inputSchema: input({ platform: { type: 'string' } }, ['platform']),
    handler: ({ platform }) => {
      const strategy = nextStrategy(String(platform || ''));
      return strategy ? { ok: true, strategy } : { ok: false, code: 'none' };
    },
  },
  {
    name: 'record_strategy',
    description: 'Record that a playbook step worked or failed, with the evidence on the page. You cannot clear a human "wrong".',
    inputSchema: input({
      id: { type: 'string' }, result: { type: 'string', enum: ['worked', 'failed', 'open'] }, evidence: { type: 'string' },
    }, ['id', 'result']),
    handler: ({ id, result, evidence }) => recordStrategy(String(id), String(result), String(evidence || ''), 'agent'),
  },
  {
    name: 'review_ledger',
    description: 'Master check of the crew. Rewrites one row per lane: working, waiting, stuck, off, or paused. Does not send or change a switch. Read stuck before starting new work.',
    inputSchema: schema,
    handler: () => reviewLedger(),
  },
  {
    name: 'trace_stalls',
    description: 'Ask Trace where the run stopped. Writes a stall when a marked person has no message, and clears a stall when that step has moved. Does not send.',
    inputSchema: schema,
    handler: () => syncStalls(),
  },
  {
    name: 'begin',
    description: 'Call this only after the person answers "should I start?". answer yes or no. fullPower false means start but ask before each send. You run npm yourself. Do not tell the person to.',
    inputSchema: input({
      answer: { type: 'string', enum: ['yes', 'no'] },
      fullPower: { type: 'boolean' },
    }, ['answer']),
    handler: ({ answer, fullPower }) => begin({ answer, fullPower }, 'agent'),
  },
];

/** @returns {string[]} */
export function toolNames() {
  return TOOLS.map((tool) => tool.name);
}

function openControl(pathname) {
  const url = `${webOrigin()}${pathname}`;
  if (process.env.LEADLINE_DISABLE_BROWSER === '1') return { ok: true, url, opened: false };
  return { ok: true, url, opened: false, detail: 'Give this URL to the person. The control plane is already served locally.' };
}

/**
 * @param {string} name
 * @param {Record<string, unknown>} [args]
 */
export async function callTool(name, args = {}) {
  const tool = TOOLS.find((item) => item.name === name);
  if (!tool) return { ok: false, code: 'unknown_tool', detail: clip(name, 80) };
  if (!OPEN.has(name) && profileGaps().length) {
    return { ok: false, code: 'needs_profile', gaps: profileGaps(), url: `${webOrigin()}/setup` };
  }
  try {
    return await tool.handler(args || {});
  } catch (err) {
    return { ok: false, code: 'error', detail: clip(err instanceof Error ? err.message : String(err), 300) };
  }
}
