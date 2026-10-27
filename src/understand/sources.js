// src/understand/sources.js — PDF, website, and the person's own social profiles.
//
// Owns: storing those materials and reading them into excerpts.
// Must not: overwrite a field the person typed, send, or read a social profile
// that is still on a login page. A logged-out page is not a source.
// Writes: profile_sources, and empty business fields through fillEmpty.

import fs from 'node:fs';
import path from 'node:path';
import { all, get, run } from '../kernel/db.js';
import { recordEvent } from '../kernel/events.js';
import { dataDir } from '../kernel/paths.js';
import { clip, looksLikeEmail, normalizeUrl } from '../kernel/text.js';
import { nowIso } from '../kernel/time.js';
import { openUrl } from '../browser/act.js';
import { recordEncounter } from '../browser/encounters.js';
import { extractPdfText } from './pdftext.js';
import { fillEmpty, getBusiness, profileGaps } from './profile.js';
import { listPages, readWebsite } from './website.js';

const MAX_SOURCES = 12;
const PLATFORMS = [
  { id: 'linkedin', home: 'https://www.linkedin.com/feed/', hosts: ['linkedin.com'] },
  { id: 'x', home: 'https://x.com/home', hosts: ['x.com', 'twitter.com'] },
  { id: 'instagram', home: 'https://www.instagram.com/', hosts: ['instagram.com'] },
  { id: 'facebook', home: 'https://www.facebook.com/', hosts: ['facebook.com', 'fb.com'] },
  { id: 'tiktok', home: 'https://www.tiktok.com/', hosts: ['tiktok.com'] },
  { id: 'reddit', home: 'https://www.reddit.com/', hosts: ['reddit.com'] },
  { id: 'youtube', home: 'https://www.youtube.com/', hosts: ['youtube.com', 'youtu.be'] },
];

const FILL_KEYS = [
  'name', 'website', 'one_liner', 'offer', 'audience', 'problem', 'proof',
  'price_band', 'geos', 'tone', 'sender_name', 'sender_email', 'extra',
];

/**
 * A signed-out home or profile. A footer link that says "Sign in" is not enough.
 * @param {{ url?: string, title?: string, excerpt?: string, blocker?: string, controls?: Array<{ text?: string }> }} snap
 */
export function looksLikeLogin(snap) {
  if (!snap || snap.ok === false) return false;
  if (snap.blocker === 'login') return true;
  if (/^(log in|sign in|login)\b/i.test(String(snap.title || ''))) return true;
  const controls = Array.isArray(snap.controls) ? snap.controls : [];
  if (controls.some((item) => /^(log in|sign in)$/i.test(String(item.text || '').trim()))) return true;
  const blob = `${snap.title || ''}\n${snap.excerpt || ''}`.slice(0, 1800);
  return /log in|sign in|sign up/i.test(blob) && /password|email or phone|username or email/i.test(blob);
}

/** @returns {Array<Record<string, string>>} */
export function listSources() {
  return all(`SELECT id, kind, platform, url, label, excerpt, status, detail, created_at, read_at
    FROM profile_sources ORDER BY id ASC LIMIT ?`, MAX_SOURCES);
}

/** @returns {Record<string, string> | null} */
export function pendingSource() {
  return get("SELECT * FROM profile_sources WHERE status = 'saved' ORDER BY id ASC LIMIT 1") || null;
}

/** @returns {Record<string, string> | null} */
export function loginSource() {
  return get("SELECT * FROM profile_sources WHERE status = 'needs_login' ORDER BY id ASC LIMIT 1") || null;
}

/** @returns {boolean} */
export function hasReadableSource() {
  return Boolean(get("SELECT id FROM profile_sources WHERE status = 'read' AND excerpt <> '' LIMIT 1"));
}

/**
 * @param {string} text
 */
export function addLinks(text) {
  const bits = String(text || '').split(/[\s,]+/).map((bit) => bit.trim()).filter(Boolean);
  if (!bits.length) return { ok: false, code: 'empty' };
  const added = [];
  const skipped = [];
  for (const bit of bits) {
    if (countSources() >= MAX_SOURCES) {
      if (added.length) recordEvent('understand', 'material', 'links', `${added.length} saved`);
      return { ok: added.length > 0, code: 'too_many', added, skipped };
    }
    const url = asUrl(bit);
    if (!url) {
      skipped.push(bit);
      continue;
    }
    const existing = get('SELECT id, kind, platform, url, status FROM profile_sources WHERE url = ?', url);
    if (existing) {
      added.push(existing);
      continue;
    }
    const platform = platformFor(url);
    const kind = platform ? 'social' : 'website';
    const id = insertSource({
      kind,
      platform: platform?.id || 'web',
      url,
      label: url,
      storedPath: '',
      excerpt: '',
      status: 'saved',
      detail: platform ? 'Sign in on the Leadline Chrome before this is read.' : '',
    });
    added.push({ id, kind, platform: platform?.id || 'web', url, status: 'saved' });
  }
  if (!added.length) return { ok: false, code: 'bad_url', skipped };
  recordEvent('understand', 'material', 'links', `${added.length} saved`);
  return { ok: true, added, skipped };
}

/**
 * @param {Buffer} data
 * @param {string} filename
 */
export function addPdf(data, filename) {
  const extracted = extractPdfText(data);
  if (!extracted.ok && extracted.code !== 'no_text') return extracted;
  if (countSources() >= MAX_SOURCES) return { ok: false, code: 'too_many' };
  const safeName = path.basename(String(filename || 'upload.pdf').replace(/\\/g, '/')).replace(/[^A-Za-z0-9._-]/g, '') || 'upload.pdf';
  const dir = path.join(dataDir(), 'sources');
  fs.mkdirSync(dir, { recursive: true });
  const stored = path.join(dir, `${Date.now()}-${safeName.endsWith('.pdf') ? safeName : `${safeName}.pdf`}`);
  fs.writeFileSync(stored, data);
  const status = extracted.ok ? 'read' : 'no_text';
  const excerpt = extracted.ok ? extracted.text : '';
  const id = insertSource({
    kind: 'pdf',
    platform: 'pdf',
    url: '',
    label: safeName,
    storedPath: stored,
    excerpt,
    status,
    detail: status === 'no_text' ? 'This PDF has no selectable text. Type the form or paste notes.' : '',
  });
  recordEvent('understand', 'material', 'pdf', safeName);
  return { ok: true, id, status, label: safeName, excerpt: clip(excerpt, 400) };
}

/**
 * @param {string} filePath
 */
export function addPdfFile(filePath) {
  const abs = path.resolve(String(filePath || ''));
  if (!abs.toLowerCase().endsWith('.pdf')) return { ok: false, code: 'bad_pdf' };
  let stat;
  try {
    stat = fs.statSync(abs);
  } catch {
    return { ok: false, code: 'missing' };
  }
  if (!stat.isFile()) return { ok: false, code: 'bad_pdf' };
  if (stat.size > 8_000_000) return { ok: false, code: 'too_large' };
  return addPdf(fs.readFileSync(abs), path.basename(abs));
}

/**
 * Read one stored material. Pass open only from a test.
 * @param {number} id
 * @param {(url: string) => Promise<Record<string, unknown>>} [open]
 */
export async function readSource(id, open) {
  const row = get('SELECT * FROM profile_sources WHERE id = ?', Number(id));
  if (!row) return { ok: false, code: 'missing' };
  if (row.kind === 'pdf') {
    if (row.status === 'no_text') return { ok: false, code: 'no_text', detail: row.detail };
    return { ok: true, id: row.id, status: row.status, excerpt: clip(row.excerpt, 2000) };
  }
  if (row.kind === 'website') return readSite(row);
  return readSocial(row, open);
}

/**
 * Fill blank profile fields with words that already appear in the materials.
 * @param {Record<string, unknown>} input
 * @param {'agent' | 'person'} actor
 */
export function fillProfile(input, actor) {
  if (actor !== 'agent' && actor !== 'person') return { ok: false, code: 'bad_actor' };
  const corpus = sourceCorpus();
  if (!corpus.trim()) return { ok: false, code: 'no_text', detail: 'Read a PDF, a site, or a signed-in profile first.' };
  const business = getBusiness();
  const clean = {};
  const rejected = [];
  const already = [];
  let seen = false;
  for (const key of FILL_KEYS) {
    const value = clip(input[key], 8000).trim();
    if (!value) continue;
    seen = true;
    if (String(business[key] || '').trim()) {
      already.push(key);
      continue;
    }
    if (key === 'sender_email' && !looksLikeEmail(value)) {
      rejected.push(key);
      continue;
    }
    if (key === 'website') {
      let url = '';
      try {
        url = normalizeUrl(/^https?:\/\//i.test(value) ? value : `https://${value}`);
      } catch {
        rejected.push(key);
        continue;
      }
      if (!corpus.includes(url.toLowerCase())) {
        rejected.push(key);
        continue;
      }
      clean[key] = url;
      continue;
    }
    if (actor === 'agent' && !grounded(value, corpus)) {
      rejected.push(key);
      continue;
    }
    clean[key] = value;
  }
  if (!seen) return { ok: false, code: 'empty' };
  const saved = fillEmpty(clean, actor);
  if (!saved.ok) return saved;
  return {
    ...saved,
    skipped: [...already, ...(saved.skipped || [])],
    rejected,
    gaps: profileGaps(),
  };
}

/**
 * @param {Record<string, string>} row
 */
async function readSite(row) {
  const result = await readWebsite(row.url);
  if (!result.ok) {
    if (result.code !== 'network_disabled') mark(row.id, 'failed', result.detail || result.code);
    return result;
  }
  const excerpt = result.pages.map((page) => [page.title, page.description, page.excerpt].filter(Boolean).join('\n')).join('\n\n');
  storeText(row.id, excerpt);
  return { ok: true, id: row.id, status: 'read', pages: result.pages.length, excerpt: clip(excerpt, 2000) };
}

/**
 * @param {Record<string, string>} row
 * @param {(url: string) => Promise<Record<string, unknown>>} [open]
 */
async function readSocial(row, open) {
  if (!open && process.env.LEADLINE_DISABLE_BROWSER === '1') return { ok: false, code: 'browser_disabled' };
  const platform = PLATFORMS.find((item) => item.id === row.platform);
  if (!platform) return { ok: false, code: 'bad_source' };
  const opener = open || openUrl;
  const home = await opener(platform.home);
  if (!home.ok) {
    if (home.code === 'browser_disabled' || home.code === 'cdp_down' || home.code === 'no_context') return home;
    mark(row.id, 'failed', home.detail || home.code);
    return home;
  }
  if (looksLikeLogin(home)) {
    mark(row.id, 'needs_login', `Sign in to ${platform.id} in the Leadline Chrome, then read this again.`);
    await recordEncounter({
      site: new URL(platform.home).hostname,
      url: String(home.url || platform.home),
      kind: 'login',
      detail: `Sign in to ${platform.id} before your own profile can be read.`,
      excerpt: String(home.excerpt || ''),
    });
    return {
      ok: false,
      code: 'needs_login',
      platform: platform.id,
      detail: `Sign in to ${platform.id} in the Leadline Chrome. A logged-out page is not used.`,
    };
  }
  const page = await opener(row.url);
  if (!page.ok) {
    if (page.code === 'cdp_down' || page.code === 'browser_disabled') return page;
    mark(row.id, 'failed', page.detail || page.code);
    return page;
  }
  if (page.blocker === 'captcha') {
    mark(row.id, 'failed', 'captcha');
    await recordEncounter({
      site: new URL(row.url).hostname,
      url: String(page.url || row.url),
      kind: 'captcha',
      detail: 'While reading your own profile.',
      excerpt: String(page.excerpt || ''),
    });
    return { ok: false, code: 'captcha' };
  }
  if (looksLikeLogin(page)) {
    mark(row.id, 'needs_login', `Sign in to ${platform.id} in the Leadline Chrome, then read this again.`);
    return {
      ok: false,
      code: 'needs_login',
      platform: platform.id,
      detail: `Sign in to ${platform.id} in the Leadline Chrome. A logged-out page is not used.`,
    };
  }
  const excerpt = [page.title, page.excerpt].filter(Boolean).join('\n');
  storeText(row.id, excerpt);
  recordEvent('understand', 'material', platform.id, 'read');
  return { ok: true, id: row.id, status: 'read', excerpt: clip(excerpt, 2000) };
}

/** @returns {string} */
function sourceCorpus() {
  const rows = all("SELECT url, label, excerpt FROM profile_sources WHERE status = 'read'");
  const pages = listPages().map((page) => `${page.url}\n${page.title}\n${page.description}\n${page.excerpt}`);
  return [...rows.map((row) => `${row.label}\n${row.url}\n${row.excerpt}`), ...pages].join('\n').toLowerCase();
}

/**
 * @param {string} value
 * @param {string} corpus
 */
function grounded(value, corpus) {
  const text = value.trim().toLowerCase();
  if (!text) return false;
  if (corpus.includes(text)) return true;
  const words = text.split(/[^a-z0-9]+/).filter((word) => word.length >= 5);
  if (!words.length) return false;
  const hits = words.filter((word) => corpus.includes(word)).length;
  return hits >= Math.ceil(words.length * 0.6);
}

/**
 * @param {string} raw
 * @returns {string}
 */
function asUrl(raw) {
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = normalizeUrl(withScheme);
    if (!new URL(url).hostname.includes('.')) return '';
    return url;
  } catch {
    return '';
  }
}

/**
 * @param {string} url
 */
function platformFor(url) {
  const host = new URL(url).hostname.replace(/^www\./, '');
  return PLATFORMS.find((item) => item.hosts.some((known) => host === known || host.endsWith(`.${known}`))) || null;
}

/** @returns {number} */
function countSources() {
  return Number(get('SELECT COUNT(*) AS n FROM profile_sources').n);
}

/**
 * @param {{ kind: string, platform: string, url: string, label: string, storedPath: string, excerpt: string, status: string, detail: string }} row
 */
function insertSource(row) {
  const now = nowIso();
  const info = run(
    `INSERT INTO profile_sources
      (kind, platform, url, label, stored_path, excerpt, status, detail, created_at, read_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    row.kind,
    row.platform,
    row.url,
    clip(row.label, 300),
    row.storedPath,
    clip(row.excerpt, 8000),
    row.status,
    clip(row.detail, 300),
    now,
    row.status === 'read' ? now : '',
  );
  return Number(info.lastInsertRowid);
}

/**
 * @param {number} id
 * @param {string} status
 * @param {string} detail
 */
function mark(id, status, detail) {
  run(
    'UPDATE profile_sources SET status = ?, detail = ?, read_at = ? WHERE id = ?',
    status, clip(detail, 300), nowIso(), id,
  );
}

/**
 * @param {number} id
 * @param {string} excerpt
 */
function storeText(id, excerpt) {
  run(
    "UPDATE profile_sources SET status = 'read', excerpt = ?, detail = '', read_at = ? WHERE id = ?",
    clip(excerpt, 8000), nowIso(), id,
  );
}
