// src/browser/act.js — one browser action at a time.
//
// Owns: open, snapshot, type, click, prepare, and the single execute_send.
// Must not: click Send except from execute_send, and only after canSend.
// Must not: click Post except from publishPost, and only after the words are in the box.
// Must not: type or click on a captcha or a login wall.
// Writes: messages, when a real click succeeds, through markSent.

import { clip } from '../kernel/text.js';
import { activeCampaign } from '../gtm/campaigns.js';
import { postBody } from '../create/publish.js';
import { listContent } from '../create/drafts.js';
import {
  communityAlreadyPosted, extractCommunityLinks, exploredRecently,
  markExplored, pickCommunity, rememberCommunity, rememberCommunityPost,
} from '../discover/communities.js';
import { canSend } from '../reach/gate.js';
import { holdChannel } from '../reach/note.js';
import { markSent } from '../reach/messages.js';
import { getMessage } from '../reach/rows.js';
import { recordStall } from '../trace/stalls.js';
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

/**
 * The composer has the note. A short or empty note does not count.
 * @param {string} excerpt
 * @param {string} body
 */
export function bodyOnPage(excerpt, body) {
  const needle = String(body || '').replace(/\s+/g, ' ').trim().slice(0, 40);
  if (needle.length < 8) return false;
  return String(excerpt || '').replace(/\s+/g, ' ').includes(needle);
}

/**
 * @param {import('playwright-core').Page} page
 * @param {import('playwright-core').Locator} box
 * @param {string} text
 */
async function fillBox(page, box, text) {
  await box.click({ timeout: 8000 });
  const tag = await box.evaluate((node) => node.tagName).catch(() => '');
  if (tag === 'TEXTAREA' || tag === 'INPUT') {
    await box.fill(text);
  } else {
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Backspace');
    await page.keyboard.insertText(text);
  }
  await pace();
  const visible = tag === 'TEXTAREA' || tag === 'INPUT'
    ? await box.inputValue().catch(() => '')
    : await box.innerText().catch(() => '');
  if (!bodyOnPage(visible, text)) return { ok: false, code: 'composer_empty' };
  return { ok: true };
}

/**
 * Type the note into a LinkedIn message, or into a connection note. Does not click Send.
 * @param {import('playwright-core').Page} page
 * @param {string} body
 */
async function visibleBox(page, selector) {
  const boxes = page.locator(selector);
  const count = await boxes.count();
  for (let index = 0; index < count; index += 1) {
    const box = boxes.nth(index);
    if (await box.isVisible().catch(() => false)) return box;
  }
  return null;
}

/** Close a Premium upsell. Never clicks a trial, redeem, or retry button. */
async function dismissUpsell(page) {
  const dialogs = page.locator('[role="dialog"], .artdeco-modal');
  const count = await dialogs.count();
  for (let index = 0; index < count; index += 1) {
    const dialog = dialogs.nth(index);
    const text = await dialog.innerText().catch(() => '');
    if (!/premium|inmail|message anyone/i.test(text)) continue;
    const close = dialog.locator('button[aria-label="Dismiss"], button[aria-label="Close"]').first();
    if (await close.count() && await close.isVisible().catch(() => false)) {
      await close.click({ timeout: 4000 }).catch(() => {});
      await pace();
    }
    return true;
  }
  const pageText = await page.locator('body').innerText().catch(() => '');
  if (!/premium|out of free custom notes|inmail/i.test(pageText)) return false;
  const closers = page.locator('button[aria-label="Dismiss"], button[aria-label="Close"]');
  const total = await closers.count();
  for (let index = total - 1; index >= 0; index -= 1) {
    const button = closers.nth(index);
    if (!(await button.isVisible().catch(() => false))) continue;
    const cls = await button.getAttribute('class').catch(() => '');
    if (/a11y|jump/i.test(cls || '')) continue;
    await button.click({ timeout: 3000 }).catch(() => {});
    await pace();
    return true;
  }
  return false;
}

/**
 * Click this profile's Connect control. Sidebar suggestions are not this person.
 * @param {import('playwright-core').Page} page
 */
async function clickProfileConnect(page) {
  const person = (await page.locator('h1').first().innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
  return page.evaluate((name) => {
    const links = [...document.querySelectorAll('a, button')].filter((node) => {
      if (node.closest('aside')) return false;
      const aria = node.getAttribute('aria-label') || '';
      const text = (node.innerText || '').replace(/\s+/g, ' ').trim();
      const invite = /to connect/i.test(aria) || text === 'Connect';
      if (!invite) return false;
      if (name && /to connect/i.test(aria) && !aria.toLowerCase().includes(name.toLowerCase())) return false;
      const rect = node.getBoundingClientRect();
      return rect.width > 2 && rect.height > 2;
    });
    const link = links.find((node) => /to connect/i.test(node.getAttribute('aria-label') || '')) || links[0];
    if (!link) return false;
    link.click();
    return true;
  }, person);
}

async function typeLinkedInNote(page, body) {
  const open = await visibleBox(page, '.msg-form__contenteditable, .msg-form [role="textbox"]');
  if (open) return fillBox(page, open, body);
  await dismissUpsell(page);
  const clicked = await clickProfileConnect(page);
  if (clicked) {
    const add = page.getByRole('button', { name: 'Add a note', exact: true });
    try {
      await add.waitFor({ state: 'visible', timeout: 12000 });
    } catch {
      const wall = await page.getByText(/Premium|InMail|message anyone/i).first().isVisible().catch(() => false);
      if (wall) {
        return { ok: false, code: 'premium_wall', detail: 'LinkedIn asked for Premium. The note was not sent, and no trial was started.' };
      }
      return { ok: false, code: 'no_composer', detail: 'Connect opened, and there was no Add a note button.' };
    }
    await add.click({ timeout: 8000 });
    await pace();
    const noteWall = await page.getByText(/out of free custom notes|personalized invites with Premium|Restart Premium/i).first().isVisible().catch(() => false);
    if (noteWall) {
      await dismissUpsell(page);
      return {
        ok: false,
        code: 'premium_wall',
        detail: 'LinkedIn is out of free notes. The invitation was not sent, and no trial was started.',
      };
    }
    const area = page.locator('#custom-message, textarea[name="message"], textarea, [role="dialog"] [contenteditable="true"]').last();
    try {
      await area.waitFor({ state: 'visible', timeout: 8000 });
    } catch {
      return { ok: false, code: 'no_composer', detail: 'Add a note did not open a box. Send was not clicked.' };
    }
    return fillBox(page, area, clip(body, 200));
  }
  const link = page.locator('a[href*="/messaging/compose/"]').first();
  if (!(await link.count())) {
    return { ok: false, code: 'no_composer', detail: 'No Connect control or message link on this profile.' };
  }
  await link.evaluate((node) => node.click());
  await pace();
  const box = page.locator('.msg-form__contenteditable, .msg-form [role="textbox"]').last();
  try {
    await box.waitFor({ state: 'visible', timeout: 12000 });
  } catch {
    const wall = await page.getByText(/Premium|InMail|message anyone/i).first().isVisible().catch(() => false);
    if (wall) {
      return { ok: false, code: 'premium_wall', detail: 'LinkedIn asked for Premium. The note was not sent, and no trial was started.' };
    }
    return { ok: false, code: 'no_composer', detail: 'The LinkedIn message box did not open.' };
  }
  return fillBox(page, box, body);
}

/**
 * @param {import('playwright-core').Page} page
 * @param {string} body
 */
async function typeXNote(page, body) {
  const message = page.getByRole('button', { name: /^Message\b/ }).first();
  if (!(await message.count()) || !(await message.isVisible().catch(() => false))) {
    return { ok: false, code: 'no_composer', detail: 'No Message button on this profile.' };
  }
  await message.click({ timeout: 8000 });
  await pace();
  const box = page.locator('[data-testid="dmComposerTextInput"], [role="dialog"] [role="textbox"]').last();
  if (!(await box.count())) return { ok: false, code: 'no_composer', detail: 'The X message box did not open.' };
  return fillBox(page, box, body);
}

/**
 * @param {import('playwright-core').Page} page
 * @param {string} channel
 */
async function composerBox(page, channel) {
  const selectors = channel === 'linkedin'
    ? [
      '[componentkey="ShareBox_textEditor"]',
      'div.tiptap.ProseMirror[contenteditable="true"]',
      'div.ql-editor',
      '.msg-form__contenteditable',
      '[role="dialog"] [contenteditable="true"]',
    ]
    : [
      '[role="dialog"] [data-testid="tweetTextarea_0"]',
      '[data-testid="tweetTextarea_0"]',
      '[role="dialog"] [role="textbox"]',
    ];
  const waitFor = channel === 'linkedin'
    ? '[componentkey="ShareBox_textEditor"], div.tiptap.ProseMirror[contenteditable="true"], div.ql-editor, .msg-form__contenteditable'
    : '[data-testid="tweetTextarea_0"]';
  await page.waitForSelector(waitFor, { timeout: 12000 }).catch(() => {});
  for (const selector of selectors) {
    const box = await visibleBox(page, selector);
    if (box) return box;
  }
  if (channel !== 'linkedin') return null;
  const start = page.getByRole('button', { name: /Start a post/i }).first();
  if (!(await start.count()) || !(await start.isVisible().catch(() => false))) return null;
  try {
    await start.click({ timeout: 8000 });
  } catch {
    return null;
  }
  await pace();
  for (const selector of selectors) {
    const box = await visibleBox(page, selector);
    if (box) return box;
  }
  return null;
}

/**
 * @param {import('playwright-core').Page} page
 * @param {string} channel
 */
function postButton(page, channel) {
  if (channel === 'x') return page.locator('[data-testid="tweetButton"]').last();
  return page.getByRole('button', { name: 'Post', exact: true }).last();
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
  if (msg.channel === 'linkedin' || msg.channel === 'x') {
    const got = await getPage();
    if (!got.ok) return got;
    const typed = msg.channel === 'linkedin'
      ? await typeLinkedInNote(got.page, msg.body)
      : await typeXNote(got.page, msg.body);
    if (!typed.ok) {
      return {
        ok: true,
        prepared: false,
        channel: msg.channel,
        code: typed.code,
        detail: typed.detail || typed.code,
        snapshot: opened,
      };
    }
    return { ok: true, prepared: true, channel: msg.channel, snapshot: await snapshot() };
  }
  return {
    ok: true,
    prepared: false,
    channel: msg.channel,
    detail: 'The page is open. Use browser_type for the message. execute_send is the only click on Send, and only after the gate passes.',
    snapshot: opened,
  };
}

/**
 * A social prepare opens the page and does not type. Send stays unclicked.
 * @param {{ ok?: boolean, prepared?: boolean }} prepared
 */
export function sendBlockedUntilTyped(prepared) {
  return Boolean(prepared && prepared.ok && prepared.prepared === false);
}

const SEND_LABEL = {
  email: 'Send',
  linkedin: 'Send',
  x: 'Send',
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
  if (sendBlockedUntilTyped(prepared)) {
    const code = prepared.code === 'premium_wall' ? 'premium_wall' : 'composer_empty';
    if (code === 'premium_wall') holdChannel(msg.channel);
    recordStall({
      code: 'composer',
      flow: 'reach',
      step: 'send_one',
      ref: String(msg.id),
      detail: prepared.detail || `${msg.channel} is open. The note is not in the box, so Send was not clicked.`,
    });
    return {
      ok: false,
      code,
      detail: prepared.detail || 'The page is open and the note is not in the box. Send was not clicked.',
    };
  }
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
  const named = msg.channel === 'linkedin' || msg.channel === 'x'
    ? got.page.getByRole('button', { name: /^Send$/ })
    : got.page.getByRole('button', { name: label, exact: true });
  const namedCount = await named.count();
  let button = null;
  for (let index = namedCount - 1; index >= 0; index -= 1) {
    const candidate = named.nth(index);
    if (await candidate.isVisible().catch(() => false)) {
      button = candidate;
      break;
    }
  }
  if (!button) button = got.page.locator('.msg-form__send-button, button[aria-label="Send"]').last();
  try {
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
  const stillThere = await button.isVisible().catch(() => false) && await button.isEnabled().catch(() => false);
  if (stillThere && bodyOnPage(after.excerpt || '', msg.body)) {
    return {
      ok: false,
      code: 'not_sent',
      detail: 'Send is still on the page and the note is still in the box. Nothing was marked sent.',
      snapshot: after,
    };
  }
  const sent = markSent(msg.id);
  return { ok: sent.ok, code: sent.ok ? 'sent' : sent.code, sent, snapshot: after };
}

const COMPOSE_URL = {
  linkedin: 'https://www.linkedin.com/feed/?shareActive=true',
  x: 'https://x.com/compose/post',
};

/**
 * Type a post and click Post. Does not mark a draft published. The caller does that after ok.
 * @param {{ channel: string, body: string, url?: string, audience?: string }} input
 */
export async function publishPost(input) {
  if (disabled()) return { ok: false, code: 'browser_disabled' };
  const channel = String(input.channel || '');
  const text = clip(input.body, 4000).trim();
  if (!text) return { ok: false, code: 'empty_body' };
  const target = input.url || COMPOSE_URL[channel];
  if (!target) return { ok: false, code: 'bad_channel' };
  const opened = await openUrl(target);
  if (!opened.ok) return opened;
  if (opened.blocker === 'captcha' || opened.blocker === 'login') return stopForWall(opened, opened.blocker, 'post');
  const got = await getPage();
  if (!got.ok) return got;
  if (input.audience) {
    await got.page.getByRole('heading', { name: input.audience }).first().waitFor({ state: 'visible', timeout: 8000 }).catch(() => {});
  }
  let box = await composerBox(got.page, channel);
  if (!box && input.url) {
    const opener = got.page.locator('[data-testid="SideNav_NewTweet_Button"]').first();
    if (await opener.count() && await opener.isVisible().catch(() => false)) {
      await opener.click({ timeout: 8000 }).catch(() => {});
    } else {
      const fallback = got.page.getByRole('link', { name: /^Post$/ }).first();
      if (await fallback.count() && await fallback.isVisible().catch(() => false)) {
        await fallback.click({ timeout: 8000 }).catch(() => {});
      }
    }
    await pace();
    box = await composerBox(got.page, channel);
  }
  if (!box) return { ok: false, code: 'no_composer', detail: 'The post box did not open.' };
  const audience = String(input.audience || '').replace(/\s+/g, ' ').trim();
  if (audience) {
    const needle = audience.toLowerCase().slice(0, 40);
    const started = Date.now();
    let seen = '';
    while (Date.now() - started < 8000) {
      seen = await composerAudience(got.page);
      if (seen.toLowerCase().includes(needle)) break;
      await got.page.waitForTimeout(500);
    }
    if (!seen.toLowerCase().includes(needle)) {
      return { ok: false, code: 'not_sent', detail: `The composer is not aimed at that community. Post was not clicked. Saw: ${clip(seen, 180)}` };
    }
  }
  const typed = await fillBox(got.page, box, text);
  if (!typed.ok) return { ok: false, code: 'composer_empty', detail: 'The post is not in the box. Post was not clicked.' };
  const button = postButton(got.page, channel);
  try {
    if (channel === 'linkedin' && !(await button.count())) {
      await got.page.getByRole('button', { name: 'Post', exact: true }).last().click({ timeout: 8000 });
    } else {
      await button.click({ timeout: 8000 });
    }
  } catch (err) {
    return { ok: false, code: 'no_send_button', detail: `No Post button. ${clip(err.message, 160)}` };
  }
  await pace();
  const after = await snapshot();
  const proof = `${after.title || ''}\n${after.excerpt || ''}`;
  if (/post successful|your post was sent/i.test(proof)) {
    return { ok: true, code: 'posted', snapshot: after };
  }
  if (after.ok && (after.blocker === 'captcha' || after.blocker === 'login')) {
    return stopForWall(after, after.blocker, 'after post click');
  }
  const still = await button.isVisible().catch(() => false) && await button.isEnabled().catch(() => false);
  if (still && bodyOnPage(await box.innerText().catch(() => ''), text)) {
    return { ok: false, code: 'not_sent', detail: 'Post is still available and the words are still in the box. Nothing was marked published.' };
  }
  return { ok: true, code: 'posted', snapshot: after };
}

/**
 * Open X communities, remember the ones on the page, and post once into a job-related community.
 * @param {string} [query]
 */
export async function exploreCommunities(query) {
  void query;
  if (disabled()) return { ok: false, code: 'browser_disabled' };
  if (exploredRecently()) return { ok: true, code: 'idle' };
  const opened = await openUrl('https://x.com/i/communities');
  if (!opened.ok) return opened;
  if (opened.blocker === 'captcha' || opened.blocker === 'login') return stopForWall(opened, opened.blocker, 'communities');
  const got = await getPage();
  if (!got.ok) return got;
  let links = await waitForCommunityLinks(got.page);
  if (!pickCommunity(links)) {
    const handle = await got.page.locator('a[data-testid="AppTabBar_Profile_Link"]').first().getAttribute('href').catch(() => '');
    const path = String(handle || '').split('?')[0].replace(/\/$/, '');
    if (path.startsWith('/') && path.length > 1) {
      const joined = await openUrl(`https://x.com${path}/communities`);
      if (!joined.ok) return joined;
      if (joined.blocker === 'captcha' || joined.blocker === 'login') return stopForWall(joined, joined.blocker, 'communities');
      const again = await getPage();
      if (!again.ok) return again;
      const mine = await waitForCommunityLinks(again.page);
      if (mine.length) links = mine;
    }
  }
  for (const link of links.slice(0, 8)) rememberCommunity(link.id, link.text || link.url);
  const chosen = pickCommunity(links);
  if (!chosen || communityAlreadyPosted()) {
    if (links.length) markExplored();
    return { ok: true, code: 'explored', count: links.length, communities: links.slice(0, 8) };
  }
  const campaign = activeCampaign();
  const existing = listContent({ limit: 20 }).find((row) => row.channel === 'x' && row.status !== 'killed' && !String(row.title || '').startsWith('Trial:'));
  const body = String(existing?.body || (campaign ? postBody(campaign) : '')).trim();
  if (!body) return { ok: true, code: 'explored', count: links.length, communities: links.slice(0, 8) };
  const posted = await publishPost({ channel: 'x', body, url: chosen.url, audience: chosen.text });
  if (!posted.ok) return { ...posted, communities: links.slice(0, 8) };
  markExplored();
  rememberCommunityPost(chosen.id, chosen.url);
  return { ok: true, code: 'posted', url: chosen.url, communities: links.slice(0, 8), snapshot: posted.snapshot };
}

/**
 * @param {import('playwright-core').Page} page
 */
async function composerAudience(page) {
  const dialogs = page.locator('[role="dialog"]');
  const count = await dialogs.count();
  const parts = [];
  for (let index = 0; index < count; index += 1) {
    const text = await dialogs.nth(index).innerText().catch(() => '');
    if (text.trim()) parts.push(text);
  }
  return parts.join('\n');
}

async function waitForCommunityLinks(page) {
  const started = Date.now();
  let links = [];
  while (Date.now() - started < 15000) {
    links = await communityLinks(page);
    if (links.length) return links;
    await page.waitForTimeout(1000);
  }
  return links;
}

async function communityLinks(page) {
  const raw = await page.evaluate(() => [...document.querySelectorAll('a')]
    .map((node) => ({ href: node.href || '', text: (node.innerText || '').trim().slice(0, 160) }))
    .filter((node) => node.href));
  return extractCommunityLinks(raw);
}
