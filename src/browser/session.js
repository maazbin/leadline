// src/browser/session.js — attach Playwright to the debug Chrome. No bundled browser.
//
// Owns: the CDP connection and the page the tools act on.
// Must not: launch Chrome (chrome.js does that) or solve a check.
// A failed attach is returned. It is not thrown to the tool boundary.

import { run } from '../kernel/db.js';
import { clip } from '../kernel/text.js';
import { nowIso } from '../kernel/time.js';
import { classifyBlocker } from './blockers.js';
import { cdpStatus } from './chrome.js';

/** @type {import('playwright-core').Browser | null} */
let browser = null;

async function connect() {
  const status = await cdpStatus();
  if (!status.ok) return { ok: false, code: 'cdp_down', detail: 'Call launch_chrome. The debug window is not up.' };
  if (browser && browser.isConnected()) return { ok: true, browser };
  const { chromium } = await import('playwright-core');
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${status.port}`);
  return { ok: true, browser };
}

/** @returns {Promise<{ ok: true, page: import('playwright-core').Page } | { ok: false, code: string, detail?: string }>} */
export async function getPage() {
  if (process.env.LEADLINE_DISABLE_BROWSER === '1') return { ok: false, code: 'browser_disabled' };
  let conn;
  try {
    conn = await connect();
  } catch (err) {
    browser = null;
    return { ok: false, code: 'cdp_down', detail: clip(err.message, 200) };
  }
  if (!conn.ok) return conn;
  const context = conn.browser.contexts()[0];
  if (!context) return { ok: false, code: 'no_context' };
  const pages = context.pages().filter((page) => !page.isClosed());
  const page = pages[pages.length - 1] || await context.newPage();
  return { ok: true, page };
}

/** A new tab for one engagement. The caller closes it. Other tools keep the last open tab. */
export async function freshPage() {
  if (process.env.LEADLINE_DISABLE_BROWSER === '1') return { ok: false, code: 'browser_disabled' };
  let conn;
  try {
    conn = await connect();
  } catch (err) {
    browser = null;
    return { ok: false, code: 'cdp_down', detail: clip(err.message, 200) };
  }
  if (!conn.ok) return conn;
  const context = conn.browser.contexts()[0];
  if (!context) return { ok: false, code: 'no_context' };
  try {
    return { ok: true, page: await context.newPage() };
  } catch (err) {
    return { ok: false, code: 'cdp_down', detail: clip(err.message, 200) };
  }
}

/**
 * Title, a short text excerpt, the visible controls, and any wall.
 * @returns {Promise<Record<string, unknown>>}
 */
export async function snapshot() {
  const got = await getPage();
  if (!got.ok) return got;
  const page = got.page;
  let url = '';
  let title = '';
  let excerpt = '';
  let controls = [];
  try {
    url = page.url();
    title = await page.title();
    excerpt = await page.evaluate(() => (document.body?.innerText || '').slice(0, 5000));
    controls = await page.evaluate(() => [...document.querySelectorAll('a, button, input[type="submit"]')]
      .slice(0, 40)
      .map((node) => ({
        tag: node.tagName,
        text: (node.innerText || node.value || node.getAttribute('aria-label') || '').trim().slice(0, 80),
        href: node.href || '',
      }))
      .filter((node) => node.text || node.href));
  } catch (err) {
    return { ok: false, code: 'snapshot_failed', detail: clip(err.message, 200) };
  }
  const blocker = classifyBlocker({ url, title, excerpt });
  const stored = clip(excerpt, 2500);
  run(
    `UPDATE browser_state
     SET mode = 'debug', url = ?, title = ?, excerpt = ?, blocker = ?, updated_at = ?
     WHERE id = 1`,
    clip(url, 500), clip(title, 200), stored, blocker, nowIso(),
  );
  return {
    ok: true,
    url,
    title,
    excerpt: clip(excerpt, 1500),
    controls: controls.slice(0, 25),
    blocker,
  };
}

let lastAction = 0;

/** Two to four seconds between clicks so a run does not burst. */
export async function pace() {
  const wait = 2000 + Math.floor(Math.random() * 2000);
  const since = Date.now() - lastAction;
  if (lastAction && since < wait) await new Promise((resolve) => setTimeout(resolve, wait - since));
  lastAction = Date.now();
}
