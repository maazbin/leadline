// src/browser/engage.js — one reply, one comment, or one DM.
//
// Owns: the browser half of the six engagement steps.
// Must not: start a Premium trial, click Redeem or Retry, or submit an empty box.
// Must not: click Not Now, or type an X Number. That screen means the DM cannot be sent.
// Must not: reply to our own post, or to a post this desk already answered.
// The words have to be in the box before Reply, Comment, Post, or Send.

import { clip } from '../kernel/text.js';
import { alreadyEngaged, alreadyOurOffer, huntPost, rememberEngagement } from '../reach/engage.js';
import { channelHeld } from '../reach/note.js';
import { bodyOnPage, xInboxClosedText } from './act.js';
import { pathRecord } from './paths.js';
import { classifyBlocker } from './blockers.js';
import { recordEncounter } from './encounters.js';
import { freshPage, pace } from './session.js';

/** @type {import('playwright-core').Page | null} */
let owned = null;

const HUNT_QUERY = '"open to work" OR "job hunt" OR "looking for a job" OR "job hunting"';
const RESERVED = new Set(['home', 'search', 'explore', 'settings', 'i', 'intent', 'messages', 'notifications', 'compose', 'jobs']);
const TRIAL = /redeem|retry|restart premium|try premium|start free trial|upgrade|subscribe/i;

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
 * @param {import('playwright-core').Page} page
 * @param {string} selector
 */
async function visible(page, selector) {
  const boxes = page.locator(selector);
  const count = await boxes.count();
  for (let index = 0; index < count; index += 1) {
    const box = boxes.nth(index);
    if (await box.isVisible().catch(() => false)) return box;
  }
  return null;
}

/**
 * @param {import('playwright-core').Locator} locator
 */
async function safeClick(locator) {
  const name = await locator.evaluate((node) => (
    node.getAttribute('aria-label') || node.innerText || ''
  ).replace(/\s+/g, ' ').trim()).catch(() => '');
  if (TRIAL.test(name)) {
    return { ok: false, code: 'premium_wall', detail: 'A Premium button was on the page. It was not clicked.' };
  }
  if (/^not now$/i.test(name) || /x number/i.test(name)) {
    return { ok: false, code: 'no_composer', detail: 'X showed Not Now or an X Number. This person cannot be DM\'d.' };
  }
  try {
    const tag = await locator.evaluate((node) => node.tagName).catch(() => '');
    if (tag === 'A') await locator.evaluate((node) => node.click());
    else await locator.click({ timeout: 8000 });
  } catch (err) {
    return { ok: false, code: 'no_send_button', detail: clip(err.message, 160) };
  }
  return { ok: true };
}

/**
 * @param {import('playwright-core').Page} page
 * @param {import('playwright-core').Locator} box
 * @param {string} text
 */
async function fillBox(page, box, text) {
  await box.click({ timeout: 8000 });
  const tag = await box.evaluate((node) => node.tagName).catch(() => '');
  if (tag === 'TEXTAREA' || tag === 'INPUT') await box.fill(text);
  else {
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Backspace');
    await page.keyboard.insertText(text);
  }
  await pace();
  const shown = tag === 'TEXTAREA' || tag === 'INPUT'
    ? await box.inputValue().catch(() => '')
    : await box.innerText().catch(() => '');
  if (!bodyOnPage(shown, text)) return { ok: false, code: 'composer_empty' };
  return { ok: true };
}

/**
 * @param {Record<string, unknown>} opened
 */
/**
 * @param {import('playwright-core').Page} page
 */
async function proofText(page) {
  const title = await page.title().catch(() => '');
  const excerpt = await page.evaluate(() => (document.body?.innerText || '').slice(0, 1500)).catch(() => '');
  const url = page.url();
  return { title, excerpt, url, blocker: classifyBlocker({ url, title, excerpt }) };
}

/**
 * @param {import('playwright-core').Page} page
 * @param {string} kind
 * @param {string} url
 * @param {string} excerpt
 */
async function stopIfWall(page, kind, url, excerpt) {
  await recordEncounter({
    site: siteOf(url),
    url,
    kind,
    detail: 'engagement',
    excerpt,
    page,
  });
  return {
    ok: false,
    code: kind,
    detail: kind === 'captcha'
      ? 'Stopped. A person has to pass this check in the Chrome window. Leadline does not solve it.'
      : 'Stopped. Sign in by hand in the Leadline Chrome window.',
  };
}

/** One tab for this engagement. It is closed when the step finishes. */
async function ownPage() {
  if (owned && !owned.isClosed()) return { ok: true, page: owned };
  const got = await freshPage();
  if (!got.ok) return got;
  owned = got.page;
  return got;
}

/**
 * @param {string} url
 */
async function open(url) {
  const got = await ownPage();
  if (!got.ok) return got;
  try {
    await got.page.goto(String(url), { waitUntil: 'domcontentloaded', timeout: 30000 });
    await got.page.bringToFront();
  } catch (err) {
    return { ok: false, code: 'navigation_failed', detail: clip(err.message, 200) };
  }
  await pace();
  const seen = await proofText(got.page);
  if (seen.blocker === 'captcha' || seen.blocker === 'login') {
    return stopIfWall(got.page, seen.blocker, seen.url, seen.excerpt);
  }
  return { ok: true, page: got.page };
}

/**
 * @param {import('playwright-core').Page} page
 */
async function premiumDialog(page) {
  const dialogs = page.locator('[role="dialog"], .artdeco-modal');
  const count = await dialogs.count();
  for (let index = 0; index < count; index += 1) {
    const text = await dialogs.nth(index).innerText().catch(() => '');
    if (/out of free custom notes|restart premium|personalized invites with premium|message anyone|inmail/i.test(text)) {
      return text.replace(/\s+/g, ' ').trim().slice(0, 240);
    }
  }
  return '';
}

/** Close a Premium upsell. Never clicks a trial, redeem, or retry button. */
async function dismissPremium(page) {
  const closers = page.locator('button[aria-label="Dismiss"], button[aria-label="Close"]');
  const total = await closers.count();
  for (let index = total - 1; index >= 0; index -= 1) {
    const button = closers.nth(index);
    if (!(await button.isVisible().catch(() => false))) continue;
    const name = await button.getAttribute('aria-label').catch(() => '');
    if (TRIAL.test(name || '')) continue;
    await button.click({ timeout: 3000 }).catch(() => {});
    await pace();
    return true;
  }
  return false;
}

/**
 * @param {import('playwright-core').Page} page
 * @param {RegExp} proof
 */
async function waitForProof(page, proof) {
  const started = Date.now();
  let after = await proofText(page);
  while (Date.now() - started < 8000) {
    const blob = `${after.title || ''}\n${after.excerpt || ''}`;
    if (proof.test(blob)) return { ok: true, code: 'posted', detail: clip(blob, 180) };
    if (after.blocker === 'captcha' || after.blocker === 'login') {
      return stopIfWall(page, after.blocker, after.url, after.excerpt);
    }
    const premium = await premiumDialog(page);
    if (premium) {
      await dismissPremium(page);
      return { ok: false, code: 'premium_wall', detail: 'The page asked for Premium. Nothing else was clicked.' };
    }
    if (/action blocked|try again later|temporarily restricted/i.test(blob)) {
      return { ok: false, code: 'not_sent', hold: true, detail: 'The platform asked to wait. Nothing was sent.' };
    }
    await page.waitForTimeout(500);
    after = await proofText(page);
  }
  return { ok: false, code: 'not_sent', detail: 'The page did not confirm the click.' };
}

/**
 * @param {import('playwright-core').Page} page
 */
async function ownHandle(page) {
  const href = await page.locator('a[data-testid="AppTabBar_Profile_Link"]').first().getAttribute('href').catch(() => '');
  return String(href || '').split('?')[0].replace(/^\//, '').split('/')[0].toLowerCase();
}

/**
 * @param {import('playwright-core').Locator} article
 */
async function readTweet(article) {
  return article.evaluate((node) => {
    const text = (node.querySelector('[data-testid="tweetText"]')?.innerText || '').replace(/\s+/g, ' ').trim();
    const statusHref = [...node.querySelectorAll('a')]
      .map((link) => link.getAttribute('href') || '')
      .find((href) => /\/status\/\d+/.test(href)) || '';
    const status = (statusHref.match(/status\/(\d+)/) || [])[1] || '';
    const fromStatus = (statusHref.match(/\/([A-Za-z0-9_]{1,15})\/status\/\d+/) || [])[1] || '';
    return { text: text.slice(0, 500), status, handle: fromStatus.toLowerCase() };
  });
}

/**
 * @param {import('playwright-core').Page} page
 * @param {string} line
 * @param {'reply' | 'dm'} kind
 */
async function pickTweet(page, line, kind) {
  await page.waitForSelector('article[data-testid="tweet"]', { timeout: 15000 }).catch(() => {});
  let picked = await chooseTweet(page, line, kind);
  if (picked) return picked;
  const broken = await page.getByText(/something went wrong/i).first().isVisible().catch(() => false);
  if (!broken) return null;
  const retry = page.getByRole('button', { name: 'Retry', exact: true }).first();
  if (!(await retry.count())) return null;
  await retry.click({ timeout: 8000 }).catch(() => {});
  await page.waitForSelector('article[data-testid="tweet"]', { timeout: 15000 }).catch(() => {});
  return chooseTweet(page, line, kind);
}

/**
 * @param {import('playwright-core').Page} page
 * @param {string} line
 * @param {'reply' | 'dm'} kind
 */
async function chooseTweet(page, line, kind) {
  const own = await ownHandle(page);
  const articles = page.locator('article[data-testid="tweet"]');
  const count = Math.min(await articles.count(), 12);
  for (let index = 0; index < count; index += 1) {
    const article = articles.nth(index);
    const info = await readTweet(article);
    if (!info.status || !info.handle || RESERVED.has(info.handle)) continue;
    if (own && info.handle === own) continue;
    if (!huntPost(info.text) || alreadyOurOffer(info.text, line)) continue;
    const ref = kind === 'reply' ? `x:reply:${info.status}` : `x:dm:${info.handle}`;
    if (alreadyEngaged(ref)) continue;
    return { article, ...info, ref };
  }
  return null;
}

/**
 * @param {string} line
 */
async function replyOnX(line) {
  const opened = await open(`https://x.com/search?q=${encodeURIComponent(HUNT_QUERY)}&src=typed_query&f=live`);
  if (!opened.ok) return opened;
  const picked = await pickTweet(opened.page, line, 'reply');
  if (!picked) return { ok: false, code: 'none', detail: 'No job-hunt post was open to reply to.' };
  const reply = picked.article.locator('[data-testid="reply"]').first();
  if (!(await reply.count())) return { ok: false, code: 'no_composer', detail: 'That post has no reply control.' };
  const clicked = await safeClick(reply);
  if (!clicked.ok) return clicked;
  await opened.page.waitForSelector('[data-testid="tweetTextarea_0"]', { timeout: 10000 }).catch(() => {});
  const box = await visible(opened.page, '[role="dialog"] [data-testid="tweetTextarea_0"], [data-testid="tweetTextarea_0"]');
  if (!box) return { ok: false, code: 'no_composer', detail: `The reply box did not open. ${opened.page.url()}` };
  const typed = await fillBox(opened.page, box, line);
  if (!typed.ok) return { ok: false, code: 'composer_empty', detail: 'The reply is not in the box. Reply was not clicked.' };
  const button = opened.page.locator('[data-testid="tweetButton"]').last();
  const sent = await safeClick(button);
  if (!sent.ok) return sent;
  const confirmed = await waitForProof(opened.page, /your (post|reply) was sent/i);
  return { ...confirmed, ref: picked.ref, clicked: true };
}

/**
 * @param {string} line
 */
async function dmOnX(line) {
  const opened = await open(`https://x.com/search?q=${encodeURIComponent(HUNT_QUERY)}&src=typed_query&f=live`);
  if (!opened.ok) return opened;
  await opened.page.waitForSelector('article[data-testid="tweet"]', { timeout: 15000 }).catch(() => {});
  const broken = await opened.page.getByText(/something went wrong/i).first().isVisible().catch(() => false);
  if (broken) {
    const retry = opened.page.getByRole('button', { name: 'Retry', exact: true }).first();
    if (await retry.count()) await retry.click({ timeout: 8000 }).catch(() => {});
    await opened.page.waitForSelector('article[data-testid="tweet"]', { timeout: 15000 }).catch(() => {});
  }
  const people = [];
  const seen = new Set();
  const own = await ownHandle(opened.page);
  for (let pass = 0; pass < 6 && people.length < 3; pass += 1) {
    const articles = opened.page.locator('article[data-testid="tweet"]');
    const count = await articles.count();
    for (let index = 0; index < count && people.length < 3; index += 1) {
      const info = await readTweet(articles.nth(index));
      if (!info.status || !info.handle || RESERVED.has(info.handle) || seen.has(info.handle)) continue;
      if (own && info.handle === own) continue;
      if (!huntPost(info.text) || alreadyOurOffer(info.text, line)) continue;
      const ref = `x:dm:${info.handle}`;
      if (alreadyEngaged(ref)) continue;
      seen.add(info.handle);
      people.push({ ...info, ref });
    }
    await opened.page.mouse.wheel(0, 1400);
    await opened.page.waitForTimeout(700);
  }
  if (!people.length) return { ok: false, code: 'none', detail: 'No job-hunt post had a person to message.' };
  let last = 'No Message button on this profile.';
  for (const person of people) {
    const profile = await open(`https://x.com/${person.handle}`);
    if (!profile.ok) return profile;
    await profile.page.waitForSelector('[data-testid="UserName"]', { timeout: 12000 }).catch(() => {});
    const direct = profile.page.locator('[data-testid="sendDMFromProfile"]').first();
    const named = profile.page.getByRole('button', { name: /^Message$/ }).first();
    const message = (await direct.count()) ? direct : named;
    if (!(await message.count()) || !(await message.isVisible().catch(() => false))) {
      last = `No Message button on @${person.handle}.`;
      rememberEngagement(person.ref, last);
      continue;
    }
    const openedMessage = await safeClick(message);
    if (!openedMessage.ok) return { ...openedMessage, detail: `@${person.handle}. ${openedMessage.detail || ''}` };
    await pace();
    const closedText = await profile.page.evaluate(() => {
      const bits = [];
      for (const el of document.querySelectorAll('span, button, label, h1, h2, p')) {
        const raw = (el.innerText || '').replace(/\s+/g, ' ').trim();
        if (!raw || raw.length > 60) continue;
        const box = el.getBoundingClientRect();
        if (box.width < 1 || box.height < 1) continue;
        bits.push(raw);
      }
      return bits.join('\n');
    }).catch(() => '');
    if (xInboxClosedText(closedText)) {
      pathRecord({
        site: 'x.com',
        fromNode: 'dm',
        choice: 'not now or x number',
        toNode: 'closed',
        outcome: 'stop',
        see: 'Not Now or an X Number is on the chat.',
        note: 'This person cannot be DM\'d. Do not click Not Now. Do not type a number.',
      });
      last = `@${person.handle} cannot be DM'd. X showed Not Now or an X Number.`;
      rememberEngagement(person.ref, last);
      continue;
    }
    const box = profile.page.locator('[data-testid="dmComposerTextInput"], [role="dialog"] [role="textbox"]').last();
    await profile.page.waitForURL(/\/messages|\/chat\/pin/, { timeout: 15000 }).catch(() => {});
    const landed = `${profile.page.url()}\n${await profile.page.evaluate(() => (document.body?.innerText || '').slice(0, 300)).catch(() => '')}`;
    if (/\/chat\/pin|enter passcode|encryption keys/i.test(landed)) {
      return { ok: false, code: 'not_sent', hold: true, detail: 'X asked for the chat passcode. The note was not sent.' };
    }
    try {
      await box.waitFor({ state: 'visible', timeout: 20000 });
    } catch {
      const excerpt = await profile.page.evaluate(() => (document.body?.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 180)).catch(() => '');
      last = `The X message box did not open for @${person.handle}. ${profile.page.url()} ${excerpt}`;
      rememberEngagement(person.ref, last);
      continue;
    }
    const typed = await fillBox(profile.page, box, line);
    if (!typed.ok) return { ok: false, code: 'composer_empty', detail: `The note is not in the box for @${person.handle}. Send was not clicked.` };
    const button = profile.page.locator('[data-testid="dmComposerSendButton"]').last();
    const sent = await safeClick(button);
    if (!sent.ok) return { ...sent, ref: person.ref };
    const confirmed = await waitForProof(profile.page, /message sent|your message was sent/i);
    if (!confirmed.ok) {
      let shown = '';
      try {
        shown = await box.inputValue();
      } catch {
        shown = await box.innerText().catch(() => '');
      }
      if (!bodyOnPage(String(shown || ''), line)) {
        return { ok: true, code: 'sent', detail: `The note left the box for @${person.handle}.`, ref: person.ref, clicked: true };
      }
      return { ...confirmed, ref: person.ref, clicked: false, detail: `@${person.handle}. ${confirmed.detail || ''}` };
    }
    return { ...confirmed, ref: person.ref, clicked: true, detail: `@${person.handle}. ${confirmed.detail || ''}` };
  }
  return {
    ok: false,
    code: 'inbox_closed',
    detail: `${last} X DMs are mostly closed. Try another platform.`,
  };
}

const LINKEDIN_SEARCH = `https://www.linkedin.com/search/results/content/?keywords=${encodeURIComponent('"looking for a job"')}&origin=GLOBAL_SEARCH_HEADER`;

/**
 * The blue Comment control sits in the composer. The action-bar Comment sits above it.
 * @param {import('playwright-core').Page} page
 * @param {import('playwright-core').Locator} box
 */
async function commentSubmit(page, box) {
  const boxBox = await box.boundingBox();
  if (!boxBox) return null;
  const buttons = page.getByRole('button', { name: 'Comment', exact: true });
  const count = await buttons.count();
  let best = null;
  let bestScore = Infinity;
  for (let index = 0; index < count; index += 1) {
    const button = buttons.nth(index);
    const bounds = await button.boundingBox();
    if (!bounds) continue;
    const below = bounds.y + bounds.height >= boxBox.y + 8;
    const beside = bounds.x + bounds.width > boxBox.x;
    if (!below || !beside) continue;
    const score = Math.abs(bounds.y - (boxBox.y + boxBox.height)) + Math.abs((bounds.x + bounds.width) - (boxBox.x + boxBox.width));
    if (score < bestScore) {
      best = button;
      bestScore = score;
    }
  }
  return best;
}

/**
 * @param {import('playwright-core').Page} page
 * @param {string} line
 */
async function commentOnLinkedInPage(page, line) {
  const hidden = await page.getByText(/not displayed/i).first().isVisible().catch(() => false);
  if (hidden) return { ok: false, code: 'none', detail: 'LinkedIn hid that search.' };
  await page.getByRole('button', { name: 'Comment', exact: true }).first()
    .waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});
  await page.locator('p').filter({ hasText: /looking for|open to work|job hunt|laid off/i }).first()
    .waitFor({ state: 'attached', timeout: 8000 }).catch(() => {});
  const buttons = page.getByRole('button', { name: 'Comment', exact: true });
  const count = Math.min(await buttons.count(), 8);
  const notes = [];
  for (let index = 0; index < count; index += 1) {
    const button = buttons.nth(index);
    const cardText = await button.evaluate((node) => {
      const card = node.closest('[role="listitem"], article, .feed-shared-update-v2, li') || node.parentElement;
      return (card?.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 1500);
    }).catch(() => '');
    const hunt = huntPost(cardText);
    notes.push(`${index}:${hunt ? 'yes' : 'no'}`);
    if (!hunt || alreadyOurOffer(cardText, line)) continue;
    const ref = `linkedin:comment:${cardText.slice(0, 60)}`;
    if (alreadyEngaged(ref)) continue;
    await button.scrollIntoViewIfNeeded().catch(() => {});
    const clicked = await safeClick(button);
    if (!clicked.ok) return clicked;
    await pace();
    const locked = await page.getByText(/only connections can comment/i).first().isVisible().catch(() => false);
    if (locked) {
      notes.push(`${index}:locked`);
      continue;
    }
    const editor = page.locator('[aria-label="Text editor for creating comment"]').last();
    try {
      await editor.waitFor({ state: 'visible', timeout: 8000 });
    } catch {
      notes.push(`${index}:no-editor`);
      continue;
    }
    const box = editor;
    const typed = await fillBox(page, box, line);
    if (!typed.ok) return { ok: false, code: 'composer_empty', detail: 'The comment is not in the box. Comment was not clicked.', ref };
    const named = await commentSubmit(page, box);
    if (!named) return { ok: false, code: 'no_send_button', detail: 'The comment box has no Comment button. Nothing was posted.', ref };
    const sent = await safeClick(named);
    if (!sent.ok) return { ...sent, ref };
    const confirmed = await waitForProof(page, /comment posted|comment successful/i);
    const url = page.url();
    if (process.env.LEADLINE_ENGAGE_SHOT) {
      await page.screenshot({ path: process.env.LEADLINE_ENGAGE_SHOT }).catch(() => {});
    }
    if (!confirmed.ok) {
      const still = await box.innerText().catch(() => '');
      if (!bodyOnPage(still, line)) return { ok: true, code: 'posted', detail: 'The comment left the box.', ref, url, clicked: true };
      return { ...confirmed, ref, url, clicked: false };
    }
    return { ...confirmed, ref, url, clicked: true };
  }
  return { ok: false, code: 'none', detail: clip(`No job-hunt post was open to comment on. ${count} controls. ${notes.join(' ')}`, 240) };
}

/**
 * @param {string} line
 */
async function commentOnLinkedIn(line) {
  const opened = await open(LINKEDIN_SEARCH);
  if (!opened.ok) return opened;
  return commentOnLinkedInPage(opened.page, line);
}

/**
 * @param {string} line
 */
async function dmOnLinkedIn(line) {
  if (channelHeld('linkedin')) return { ok: false, code: 'held', detail: 'LinkedIn notes are on hold.' };
  const opened = await open(`https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent('open to work')}&origin=GLOBAL_SEARCH_HEADER`);
  if (!opened.ok) return opened;
  const href = await opened.page.evaluate(() => {
    const link = [...document.querySelectorAll('a[href*="/in/"]')].find((node) => {
      if (node.closest('nav, header, aside')) return false;
      const path = (node.getAttribute('href') || '').split('?')[0];
      return /\/in\/[A-Za-z0-9%-]{3,}/.test(path);
    });
    return link ? link.href : '';
  });
  if (!href) return { ok: false, code: 'none', detail: 'No profile was open to message.' };
  const vanity = (href.match(/\/in\/([^/?#]+)/) || [])[1] || '';
  const ref = `linkedin:dm:${vanity}`;
  if (!vanity || alreadyEngaged(ref)) return { ok: false, code: 'none', detail: 'That profile was already messaged.' };
  const profile = await open(href);
  if (!profile.ok) return profile;
  const wall = await premiumDialog(profile.page);
  if (wall) {
    await dismissPremium(profile.page);
    return { ok: false, code: 'premium_wall', detail: 'LinkedIn asked for Premium. The note was not sent, and no trial was started.' };
  }
  const message = profile.page.locator('a[href*="/messaging/compose/"], a[aria-label^="Message"]').first();
  if (!(await message.count())) return { ok: false, code: 'no_composer', detail: 'No message control on this profile.' };
  const clicked = await safeClick(message);
  if (!clicked.ok) return clicked;
  await pace();
  const premium = await premiumDialog(profile.page);
  if (premium) {
    await dismissPremium(profile.page);
    return { ok: false, code: 'premium_wall', detail: 'LinkedIn asked for Premium. The note was not sent, and no trial was started.' };
  }
  const box = profile.page.locator('.msg-form__contenteditable, .msg-form [role="textbox"]').last();
  try {
    await box.waitFor({ state: 'visible', timeout: 8000 });
  } catch {
    return { ok: false, code: 'no_composer', detail: 'The LinkedIn message box did not open.' };
  }
  const typed = await fillBox(profile.page, box, line);
  if (!typed.ok) return { ok: false, code: 'composer_empty', detail: 'The note is not in the box. Send was not clicked.' };
  const send = profile.page.getByRole('button', { name: /^Send$/ }).last();
  const sent = await safeClick(send);
  if (!sent.ok) return sent;
  const confirmed = await waitForProof(profile.page, /message sent/i);
  if (!confirmed.ok) {
    const still = await box.innerText().catch(() => '');
    if (!bodyOnPage(still, line)) {
      return { ok: true, code: 'sent', detail: 'The note left the box.', ref, clicked: true };
    }
  }
  return { ...confirmed, ref, clicked: true };
}

/**
 * @param {import('playwright-core').Page} page
 */
async function instagramHrefs(page) {
  await page.waitForSelector('a[href*="/p/"]', { timeout: 12000 }).catch(() => {});
  return page.evaluate(() => [...document.querySelectorAll('a[href*="/p/"]')]
    .map((link) => link.getAttribute('href') || '')
    .filter((href, index, all) => href && all.indexOf(href) === index)
    .slice(0, 6));
}

/**
 * @param {string} line
 */
async function commentOnInstagram(line) {
  const opened = await open(`https://www.instagram.com/explore/search/keyword/?q=${encodeURIComponent('looking for a job')}`);
  if (!opened.ok) return opened;
  const hrefs = await instagramHrefs(opened.page);
  for (const href of hrefs) {
    const code = (href.match(/\/p\/([^/?#]+)/) || [])[1] || '';
    if (!code || alreadyEngaged(`instagram:comment:${code}`)) continue;
    const url = href.startsWith('http') ? href : `https://www.instagram.com${href}`;
    const gone = await open(url);
    if (!gone.ok) return gone;
    const caption = await gone.page.locator('article, main').first().innerText().catch(() => '');
    if (!huntPost(caption) || alreadyOurOffer(caption, line)) continue;
    const box = await visible(gone.page, 'textarea[aria-label*="comment" i], textarea[placeholder*="comment" i]');
    if (!box) continue;
    const typed = await fillBox(gone.page, box, line);
    if (!typed.ok) return { ok: false, code: 'composer_empty', detail: 'The comment is not in the box. Post was not clicked.' };
    const scope = gone.page.locator('article, main').first();
    const inForm = scope.locator('[role="button"]').filter({ hasText: /^Post$/ }).last();
    const submit = (await inForm.count()) ? inForm : gone.page.locator('[role="button"]').filter({ hasText: /^Post$/ }).last();
    const sent = await safeClick(submit);
    if (!sent.ok) return sent;
    await pace();
    const still = await box.inputValue().catch(() => '');
    if (bodyOnPage(still, line)) {
      return { ok: false, code: 'not_sent', detail: 'The comment is still in the box.', ref: `instagram:comment:${code}`, clicked: true };
    }
    return { ok: true, code: 'posted', detail: 'The comment left the box.', ref: `instagram:comment:${code}`, clicked: true };
  }
  return { ok: false, code: 'none', detail: 'No Instagram post was open to comment on.' };
}

/**
 * @param {string} line
 */
async function dmOnInstagram(line) {
  const opened = await open(`https://www.instagram.com/explore/search/keyword/?q=${encodeURIComponent('looking for a job')}`);
  if (!opened.ok) return opened;
  const hrefs = await instagramHrefs(opened.page);
  let username = '';
  for (const href of hrefs) {
    const url = href.startsWith('http') ? href : `https://www.instagram.com${href}`;
    const gone = await open(url);
    if (!gone.ok) return gone;
    const caption = await gone.page.locator('article, main').first().innerText().catch(() => '');
    if (!huntPost(caption)) continue;
    const userHref = await gone.page.locator('article header a[href^="/"], main header a[href^="/"]').first().getAttribute('href').catch(() => '');
    username = String(userHref || '').split('?')[0].replace(/^\//, '').split('/')[0];
    if (username && !RESERVED.has(username)) break;
    username = '';
  }
  if (!username) return { ok: false, code: 'none', detail: 'No Instagram post had a person to message.' };
  const ref = `instagram:dm:${username}`;
  if (alreadyEngaged(ref)) return { ok: false, code: 'none', detail: 'That person was already messaged.' };
  const profile = await open(`https://www.instagram.com/${username}/`);
  if (!profile.ok) return profile;
  const message = profile.page.getByRole('button', { name: /^Message$/ }).first();
  if (!(await message.count()) || !(await message.isVisible().catch(() => false))) {
    return { ok: false, code: 'no_composer', detail: 'No Message button on this profile.' };
  }
  const clicked = await safeClick(message);
  if (!clicked.ok) return clicked;
  await pace();
  const box = await visible(profile.page, 'div[aria-label="Message"][contenteditable="true"], textarea[placeholder*="Message" i]');
  if (!box) return { ok: false, code: 'no_composer', detail: 'The Instagram message box did not open.' };
  const typed = await fillBox(profile.page, box, line);
  if (!typed.ok) return { ok: false, code: 'composer_empty', detail: 'The note is not in the box. Send was not clicked.' };
  const send = profile.page.getByRole('button', { name: /^Send$/ }).last();
  const sent = await safeClick(send);
  if (!sent.ok) return sent;
  const confirmed = await waitForProof(profile.page, /message sent/i);
  if (!confirmed.ok) {
    const still = await box.innerText().catch(() => '');
    if (!bodyOnPage(still, line)) {
      return { ok: true, code: 'sent', detail: 'The note left the box.', ref, clicked: true };
    }
  }
  return { ...confirmed, ref, clicked: true };
}

/**
 * One public reply, comment, or DM. The caller records what it taught the desk.
 * @param {{ id: string, channel: string, action: string, line: string }} step
 */
export async function runEngagement(step) {
  if (disabled()) return { ok: false, code: 'browser_disabled' };
  const line = clip(step.line, 240).trim();
  if (!line) return { ok: false, code: 'empty_body' };
  if (step.action === 'dm' && channelHeld(step.channel)) return { ok: false, code: 'held' };
  try {
    if (step.id === 'x-reply-people') return await replyOnX(line);
    if (step.id === 'li-comment') return await commentOnLinkedIn(line);
    if (step.id === 'ig-comment') return await commentOnInstagram(line);
    if (step.id === 'x-dm') return await dmOnX(line);
    if (step.id === 'li-dm') return await dmOnLinkedIn(line);
    if (step.id === 'ig-dm') return await dmOnInstagram(line);
    return { ok: false, code: 'bad_channel' };
  } finally {
    if (owned && !owned.isClosed() && process.env.LEADLINE_ENGAGE_SHOT) {
      await owned.screenshot({ path: process.env.LEADLINE_ENGAGE_SHOT }).catch(() => {});
    }
    if (owned && !owned.isClosed()) await owned.close().catch(() => {});
    owned = null;
  }
}
