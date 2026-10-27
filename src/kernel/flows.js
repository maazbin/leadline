// src/kernel/flows.js — one next step for the brain. The web page reads plan() and does not write.
//
// Owns: which team acts next, and the single tool call that goes with it.
// Must not: send, approve, or change a permission.
// Reads: profile, campaigns, leads, messages, permissions.
// Writes: flow_state, and only from nextAction().

import { run } from './db.js';
import { webOrigin } from './ports.js';
import { nowIso } from './time.js';
import { openQuestions, profileGaps } from '../understand/profile.js';
import { hasReadableSource, loginSource, pendingSource } from '../understand/sources.js';
import { listLeads, qualifiedWithoutMessage } from '../discover/leads.js';
import { activeCampaign, campaignChannels, newestCampaign, setCampaignStatus } from '../gtm/campaigns.js';
import { listContent } from '../create/drafts.js';
import { deskRunning, fullPower, startConsent } from './desk.js';
import { canSend, channelMode } from '../reach/gate.js';
import { dueFollowups } from '../reach/followups.js';
import { listMessages } from '../reach/rows.js';

/**
 * @param {string} flow
 * @param {string} step
 */
function remember(flow, step) {
  run('UPDATE flow_state SET flow = ?, step = ?, updated_at = ? WHERE id = 1', flow, step, nowIso());
}

/**
 * @param {Record<string, unknown>} decision
 */
function finish(decision) {
  decision.ok = true;
  decision.openQuestions = openQuestions().length;
  return decision;
}

function understand(origin) {
  const gaps = profileGaps();
  const pending = pendingSource();
  if (pending) {
    const social = pending.kind === 'social';
    return finish({
      flow: 'understand',
      step: 'read_source',
      tool: 'read_source',
      args: { id: pending.id },
      url: `${origin}/setup`,
      slice: 'profile',
      why: social
        ? `Read the ${pending.platform} profile only if that account is already signed in on the Leadline Chrome. If it asks for a login, stop. Do not infer the business from a logged-out page. Do not search.`
        : 'Read this material into the profile. Do not search and do not write a message.',
      gaps,
    });
  }
  if (hasReadableSource()) {
    const waiting = loginSource();
    const extra = waiting ? ` ${waiting.platform} still needs a sign-in before that profile can be used.` : '';
    return finish({
      flow: 'understand',
      step: 'fill_profile',
      tool: 'fill_profile',
      args: {},
      url: `${origin}/setup`,
      slice: 'profile',
      why: `Fill only empty profile fields with facts that appear in the PDF, the site, or a signed-in social profile. Do not overwrite a field the person typed. Do not invent proof, prices, or customers. If the material does not say it, leave the gap.${extra}`,
      gaps,
    });
  }
  const waiting = loginSource();
  if (waiting) {
    return finish({
      flow: 'understand',
      step: 'sign_in',
      tool: 'launch_chrome',
      args: {},
      url: `${origin}/browser`,
      slice: 'profile',
      why: `Sign in to ${waiting.platform} in the Leadline Chrome, then read that profile again. Do not type the password through a tool. A logged-out page is not a source.`,
      gaps,
    });
  }
  return finish({
    flow: 'understand',
    step: 'profile',
    tool: 'open_setup',
    args: {},
    url: `${origin}/setup`,
    slice: 'profile',
    why: 'The profile is incomplete. The person can type the form, upload a PDF, or give their website and their own social profile URLs. Social accounts must already be signed in on the Leadline Chrome. Do not search and do not write a message.',
    gaps,
  });
}

function createPlan(origin) {
  if (profileGaps().length) return understand(origin);
  const campaign = activeCampaign();
  if (!campaign) {
    return finish({
      flow: 'create',
      step: 'wait_campaign',
      tool: null,
      url: `${origin}/gtm`,
      slice: 'campaign',
      why: 'Content hangs off a campaign the person has started. Create nothing until then.',
    });
  }
  const channels = campaignChannels(campaign.id).filter((channel) => channel !== 'email' && channel !== 'web_form');
  const drafts = listContent({ campaignId: campaign.id, limit: 40 });
  const missing = channels.find((channel) => !drafts.some((draft) => draft.channel === channel && draft.status !== 'killed'));
  if (missing) {
    return finish({
      flow: 'create',
      step: 'draft',
      tool: 'create_content',
      args: { campaignId: campaign.id, channel: missing },
      url: `${origin}/create`,
      slice: 'profile',
      campaignId: campaign.id,
      why: `Draft one ${missing} post for this campaign. Do not publish it. The person marks it published after they post it.`,
    });
  }
  const pending = drafts.find((draft) => draft.status === 'idea' || draft.status === 'draft');
  if (pending) {
    return finish({
      flow: 'create',
      step: 'review',
      tool: null,
      url: `${origin}/create`,
      slice: 'drafts',
      why: 'A content draft is waiting for the person. You cannot approve it or mark it published.',
    });
  }
  return finish({
    flow: 'create',
    step: 'idle',
    tool: null,
    url: `${origin}/create`,
    slice: 'drafts',
    why: 'No content task. Do not publish on your own.',
  });
}

function mainPlan(origin) {
  if (profileGaps().length) return understand(origin);
  const power = fullPower();
  const campaign = activeCampaign() || newestCampaign();
  if (!campaign) {
    return finish({
      flow: 'gtm',
      step: 'campaign',
      tool: 'create_campaign',
      args: {},
      url: `${origin}/gtm`,
      slice: 'profile',
      why: 'Create one draft campaign from the profile: name, goal, who it is for, and the channels to use. Do not message. The person presses Start.',
    });
  }
  if (campaign.status !== 'active') {
    return finish({
      flow: 'gtm',
      step: 'start',
      tool: null,
      url: `${origin}/gtm`,
      slice: 'campaign',
      campaignId: campaign.id,
      why: power
        ? 'The campaign is drafted. With Run on, the desk starts it and does not ask again.'
        : 'The campaign is not started. Wait for the person to press Start on the GTM page.',
    });
  }

  const waiting = listMessages({ status: 'awaiting_approval', limit: 5 });
  if (waiting.length && !power) {
    return finish({
      flow: 'reach',
      step: 'await_approval',
      tool: null,
      messageId: waiting[0].id,
      url: `${origin}/reach`,
      slice: 'approvals',
      why: 'A message is waiting on the Reach page. You cannot approve it. Do not send it.',
    });
  }

  const approved = listMessages({ status: 'approved', limit: 20 });
  const drafts = listMessages({ status: 'draft', limit: 20 });
  const sendable = [...approved, ...drafts, ...(power ? waiting : [])].find((row) => canSend(row.id).ok);
  if (sendable) {
    return finish({
      flow: 'reach',
      step: 'send_one',
      tool: 'execute_send',
      args: { messageId: sendable.id },
      messageId: sendable.id,
      url: `${origin}/reach`,
      slice: 'approvals',
      why: 'Send this one message in the Leadline Chrome. If the page is a captcha or a login wall, stop and record_encounter. Do not send a second message in this step.',
    });
  }

  const needsAsk = drafts.find((row) => {
    if (!String(row.body || '').trim()) return false;
    if (channelMode(row.channel).mode !== 'approve') return false;
    if (row.kind === 'followup' && row.due_at && row.due_at > nowIso()) return false;
    return true;
  });
  if (needsAsk && !power) {
    return finish({
      flow: 'reach',
      step: 'request_approval',
      tool: 'request_approval',
      args: { messageId: needsAsk.id },
      messageId: needsAsk.id,
      url: `${origin}/reach`,
      slice: 'approvals',
      why: 'Ask for approval, then stop. The person decides on the Reach page.',
    });
  }

  const due = dueFollowups(5).find((row) => !String(row.body || '').trim());
  if (due) {
    return finish({
      flow: 'reach',
      step: 'draft_followup',
      tool: 'schedule_followup',
      args: { messageId: due.parent_id || due.id },
      messageId: due.id,
      url: `${origin}/reach`,
      slice: 'followups',
      why: 'A follow-up is due and has no words. Write the body with schedule_followup. Do not send it.',
    });
  }

  const stuck = drafts.find((row) => {
    if (!String(row.body || '').trim()) return false;
    const mode = channelMode(row.channel).mode;
    return mode === 'off' || mode === 'draft';
  });
  if (stuck) {
    const mode = channelMode(stuck.channel).mode;
    return finish({
      flow: 'reach',
      step: 'permission',
      tool: null,
      messageId: stuck.id,
      url: `${origin}/permissions`,
      slice: 'permissions',
      why: `${stuck.channel} is set to ${mode}. Outreach stays on the page until the person changes that channel. You cannot change it.`,
    });
  }

  const unreviewed = listLeads({ fit: 'unreviewed', limit: 5 });
  if (unreviewed.length) {
    return finish({
      flow: 'discover',
      step: 'qualify',
      tool: 'set_lead_fit',
      args: { id: unreviewed[0].id },
      leadId: unreviewed[0].id,
      url: `${origin}/discover`,
      slice: 'pipeline',
      why: 'Judge this lead against the profile. Set fit to yes, maybe, or no, and say why. Do not message anyone you have not marked yes.',
    });
  }

  const naked = qualifiedWithoutMessage();
  if (naked) {
    return finish({
      flow: 'reach',
      step: 'draft',
      tool: 'draft_message',
      args: { leadId: naked.id },
      leadId: naked.id,
      url: `${origin}/reach`,
      slice: 'profile',
      why: 'Draft one first message for this lead. Leave it as a draft. Use only facts from the profile. Do not invent proof, prices, or customers. Trace keeps a stall on this lead until the draft exists.',
    });
  }

  return finish({
    flow: 'discover',
    step: 'find',
    tool: 'discover_hints',
    args: {},
    url: `${origin}/discover`,
    slice: 'profile',
    campaignId: campaign.id,
    why: 'Find new people. Open a hinted URL in the Leadline Chrome, read browser_snapshot, and save_lead only for a real match. Do not message from a search page.',
  });
}

/**
 * Read the next step. Does not write.
 * @param {'main' | 'create'} [lane]
 */
export function plan(lane = 'main') {
  const origin = webOrigin();
  if (startConsent() !== 'yes') {
    const declined = startConsent() === 'no';
    return finish({
      flow: 'kernel',
      step: 'ask_start',
      tool: 'begin',
      args: {},
      url: `${origin}/`,
      slice: 'home',
      why: declined
        ? 'The person said no. Stop. If they change their mind, ask once more and call begin.'
        : 'Ask once: should I start? You run npm install if dependencies are missing, and npm start if the desk is not up. Yes means call begin. Yes, but ask before each send, means begin with fullPower false. No means begin with answer no, then stop. Do not tell the person to run npm.',
    });
  }
  if (lane === 'create') return createPlan(origin);
  return mainPlan(origin);
}

/**
 * Same as plan(), and records the step for the Today page.
 * @param {'main' | 'create'} [lane]
 */
export function nextAction(lane = 'main') {
  if (lane !== 'create' && fullPower() && deskRunning()) {
    const campaign = newestCampaign();
    if (campaign && campaign.status === 'draft') setCampaignStatus(campaign.id, 'active', 'person');
  }
  const decision = plan(lane);
  remember(decision.flow, decision.step);
  return decision;
}
