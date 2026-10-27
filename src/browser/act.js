// src/browser/act.js — one browser action at a time.
//
// Owns: open, snapshot, type, click, prepare, and the single execute_send.
// Must not: click Send except from execute_send, and only after canSend.
// Must not: type or click on a captcha or a login wall.
// Writes: messages, when a real click succeeds, through markSent.

import { clip } from '../kernel/text.js';
import { canSend } from '../reach/gate.js';
import { markSent } from '../reach/messages.js';
import { getMessage } from '../reach/rows.js';
import { isSendControl } from './blockers.js';
import { recordEncounter } from './encounters.js';
import { getPage, pace, snapshot } from './session.js';

export { snapshot };

function disabled() {
  return process.env.LEADLINE_DISABLE_BROWSER === '1';
}

function siteOf(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return 'unknown';
  }
}

/**
 * @param {Record<string, unknown>} snap
 * @param {string} kind
 * @param {string} detail
 */
async function stopForWall(snap, kind, detail) {
  const page = await getPage();
  await recordEncounter({
    site: siteOf(snap.url),
    url: snap.url,
    kind,
    detail,
    excerpt: snap.excerpt,
    page: page.ok ? page.page : undefined,
  });
  return {
    ok: false,
    code: kind,
    detail: kind === 'captcha'
      ? 'Stopped. A person has to pass this check in the Chrome window. Leadline does not solve it or hide the browser.'
      : 'Stopped. Sign in by hand in the Leadline Chrome window. Do not type the password through a tool.',
    url: snap.url,
    title: snap.title,
  };
}

/**
 * @param {string} raw
 */
export async function openUrl(raw) {
  if (disabled()) return { ok: false, code: 'browser_disabled' };
  let target;
  try {
    target = new URL(String(raw || '').trim());
  } catch {
    return { ok: false, code: 'bad_url' };
  }
  if (target.protocol !== 'http:' && target.protocol !== 'https:') return { ok: false, code: 'bad_url' };
  const got = await getPage();
  if (!got.ok) return got;
  try {
    await got.page.goto(target.toString(), { waitUntil: 'domcontentloaded', timeout: 30000 });
    await got.page.bringToFront();
  } catch (err) {
    return { ok: false, code: 'navigation_failed', detail: clip(err.message, 200) };
  }
  await pace();
  return snapshot();
}

/**
 * @param {string} text
 */
export async function clickText(text) {
  if (disabled()) return { ok: false, code: 'browser_disabled' };
  const label = String(text || '').trim();
  if (!label) return { ok: false, code: 'empty' };
  if (isSendControl(label)) return { ok: false, code: 'use_execute_send' };
  const before = await snapshot();
  if (!before.ok) return before;
  if (before.blocker === 'captcha' || before.blocker === 'login') return stopForWall(before, before.blocker, label);
  const got = await getPage();
  if (!got.ok) return got;
  try {
    await got.page.getByText(label, { exact: false }).first().click({ timeout: 8000 });
  } catch (err) {
    await recordEncounter({
      site: siteOf(before.url), url: before.url, kind: 'stuck', detail: `click ${label}: ${clip(err.message, 160)}`, excerpt: before.excerpt,
    });
    return { ok: false, code: 'not_found', detail: clip(err.message, 200) };
  }
  await pace();
  return snapshot();
}

/**
 * Type into the focused field, or the last visible text box. Does not press Enter.
 * @param {string} text
 */
export async function typeIntoPage(text) {
  if (disabled()) return { ok: false, code: 'browser_disabled' };
  const value = clip(text, 8000);
  if (!value.trim()) return { ok: false, code: 'empty' };
  const before = await snapshot();
  if (!before.ok) return before;
  if (before.blocker === 'captcha' || before.blocker === 'login') return stopForWall(before, before.blocker, 'type');
  const got = await getPage();
  if (!got.ok) return got;
  try {
    const box = got.page.locator('textarea:visible, input:not([type="hidden"]):visible, [contenteditable="true"]:visible').last();
    await box.click({ timeout: 5000 });
    await got.page.keyboard.insertText(value);
  } catch (err) {
    return { ok: false, code: 'no_composer', detail: clip(err.message, 200) };
  }
  await pace();
  return snapshot();
}

function gmailUrl(msg) {
  const base = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(msg.lead_email || '')}&su=${encodeURIComponent(msg.subject || '')}`;
  const full = `${base}&body=${encodeURIComponent(msg.body || '')}`;
  if (full.length > 6000) return { url: base, typeBody: true };
  return { url: full, typeBody: false };
}

/**
 * Open the right page and fill when we know how. Never clicks Send.
 * @param {number} messageId
 */
export async function prepareMessage(messageId) {
  if (disabled()) return { ok: false, code: 'browser_disabled' };
  const msg = getMessage(messageId);
  if (!msg) return { ok: false, code: 'missing' };
  if (msg.channel === 'email') {
    if (!msg.lead_email) return { ok: false, code: 'no_email' };
    const built = gmailUrl(msg);
    const opened = await openUrl(built.url);
    if (!opened.ok) return opened;
    if (opened.blocker === 'captcha' || opened.blocker === 'login') return stopForWall(opened, opened.blocker, 'gmail');
    if (built.typeBody) {
      const typed = await typeIntoPage(msg.body);
      if (!typed.ok) return typed;
    }
    return { ok: true, prepared: true, channel: 'email', snapshot: opened };
  }
  if (!msg.lead_url) return { ok: false, code: 'no_url' };
  const opened = await openUrl(msg.lead_url);
  if (!opened.ok) return opened;
  if (opened.blocker === 'captcha' || opened.blocker === 'login') return stopForWall(opened, opened.blocker, msg.channel);
  return {
    ok: true,
    prepared: false,
    channel: msg.channel,
    detail: 'The page is open. Use browser_type for the message. execute_send is the only click on Send, and only after the gate passes.',
    snapshot: opened,
  };
}

const SEND_LABEL = {
  email: 'Send',
  linkedin: 'Send',
  x: 'Post',
  reddit: 'Comment',
  instagram: 'Send',
  facebook: 'Send',
  tiktok: 'Post',
  whatsapp: 'Send',
  web_form: 'Submit',
};

/**
 * Send one gated message. On a wall, record it and do not click.
 * @param {number} messageId
 */
export async function executeSend(messageId) {
  const gate = canSend(Number(messageId));
  if (!gate.ok) return gate;
  if (disabled()) return { ok: false, code: 'browser_disabled' };
  const msg = gate.message;
  const prepared = await prepareMessage(msg.id);
  if (!prepared.ok) return prepared;
  const snap = prepared.snapshot || await snapshot();
  if (snap.blocker === 'captcha' || snap.blocker === 'login') return stopForWall(snap, snap.blocker, 'send');
  if (msg.channel === 'email') {
    const visible = `${snap.url} ${snap.excerpt}`.toLowerCase();
    const email = String(msg.lead_email || '').toLowerCase();
    if (email && !visible.includes(email)) {
      return { ok: false, code: 'recipient_not_visible', detail: 'The Gmail compose page does not show that address. Nothing was sent.' };
    }
  }
  const label = SEND_LABEL[msg.channel] || 'Send';
  const got = await getPage();
  if (!got.ok) return got;
  try {
    const button = got.page.getByRole('button', { name: label, exact: true }).first();
    await button.click({ timeout: 8000 });
  } catch (err) {
    await recordEncounter({
      site: siteOf(snap.url),
      url: snap.url,
      kind: 'stuck',
      detail: `No ${label} button. ${clip(err.message, 160)}`,
      excerpt: snap.excerpt,
      page: got.page,
    });
    return {
      ok: false,
      code: 'no_send_button',
      detail: `No visible ${label} button. Nothing was marked sent. Send it yourself, then press I sent this.`,
    };
  }
  await pace();
  const after = await snapshot();
  if (after.ok && (after.blocker === 'captcha' || after.blocker === 'login')) {
    return stopForWall(after, after.blocker, 'after send click');
  }
  const sent = markSent(msg.id);
  return { ok: sent.ok, code: sent.ok ? 'sent' : sent.code, sent, snapshot: after };
}
