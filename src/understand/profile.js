// src/understand/profile.js — what the person sells, and answers they have given.
//
// Owns: the business row, the answer bank, and questions the agent asks once.
// Must not: send, approve, or choose a lead.
// Writes: business, answers, questions.

import { all, get, run } from '../kernel/db.js';
import { recordEvent } from '../kernel/events.js';
import { webOrigin } from '../kernel/ports.js';
import { clip, looksLikeEmail } from '../kernel/text.js';
import { nowIso } from '../kernel/time.js';

const FIELDS = [
  ['name', 160],
  ['website', 300],
  ['one_liner', 240],
  ['offer', 2000],
  ['audience', 2000],
  ['problem', 2000],
  ['proof', 2000],
  ['price_band', 200],
  ['geos', 300],
  ['tone', 300],
  ['do_not_contact', 2000],
  ['extra', 8000],
  ['sender_name', 160],
  ['sender_email', 200],
];

const ANSWER_KEYS = ['offer', 'audience', 'problem', 'proof', 'price_band', 'geos', 'tone', 'do_not_contact', 'extra'];

/** @returns {Record<string, string>} */
export function getBusiness() {
  return get('SELECT * FROM business WHERE id = 1');
}

/**
 * Required facts before discovery or outreach.
 * A website is optional when notes were pasted instead.
 * @returns {string[]}
 */
export function profileGaps() {
  const business = getBusiness();
  const gaps = [];
  if (!business.name.trim()) gaps.push('name');
  if (!business.offer.trim()) gaps.push('offer');
  if (!business.audience.trim()) gaps.push('audience');
  if (!business.problem.trim()) gaps.push('problem');
  if (!business.sender_name.trim()) gaps.push('sender_name');
  if (!business.website.trim() && !business.extra.trim()) gaps.push('website_or_notes');
  return gaps;
}

/**
 * Save the setup form. Malformed email or URL is rejected and nothing is written.
 * Incomplete profiles are still saved so the person does not lose what they typed.
 * @param {Record<string, unknown>} input
 */
export function saveBusiness(input) {
  const next = {};
  for (const [key, max] of FIELDS) next[key] = clip(input[key], max).trim();
  if (next.website && !/^https?:\/\//i.test(next.website)) next.website = `https://${next.website}`;
  if (next.website) {
    try {
      const url = new URL(next.website);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return { ok: false, code: 'bad_url' };
      next.website = url.toString();
    } catch {
      return { ok: false, code: 'bad_url' };
    }
  }
  if (next.sender_email && !looksLikeEmail(next.sender_email)) return { ok: false, code: 'bad_email' };

  const sets = FIELDS.map(([key]) => `${key} = ?`).join(', ');
  run(
    `UPDATE business SET ${sets}, updated_at = ? WHERE id = 1`,
    ...FIELDS.map(([key]) => next[key]),
    nowIso(),
  );
  for (const key of ANSWER_KEYS) {
    if (next[key]) learnAnswer(key, next[key], 'person');
  }
  recordEvent('understand', 'profile_saved', next.name, next.website || 'notes');
  return { ok: true, gaps: profileGaps() };
}

/**
 * Write only fields that are still blank. A person's saved answer is left alone.
 * The caller has to decide that the words are real. This function does not.
 * @param {Record<string, unknown>} input
 * @param {'person' | 'agent'} actor
 */
export function fillEmpty(input, actor) {
  if (actor !== 'agent' && actor !== 'person') return { ok: false, code: 'bad_actor' };
  const business = getBusiness();
  const filled = [];
  const skipped = [];
  const assignments = [];
  const params = [];
  for (const [key, max] of FIELDS) {
    if (input[key] == null) continue;
    const value = clip(input[key], max).trim();
    if (!value) continue;
    if (String(business[key] || '').trim()) {
      skipped.push(key);
      continue;
    }
    if (ANSWER_KEYS.includes(key)) {
      const known = findAnswer(key);
      if (known && known.source === 'person') {
        skipped.push(key);
        continue;
      }
    }
    assignments.push(`${key} = ?`);
    params.push(value);
    filled.push(key);
  }
  if (!filled.length) return { ok: true, filled, skipped, gaps: profileGaps() };
  run(
    `UPDATE business SET ${assignments.join(', ')}, updated_at = ? WHERE id = 1`,
    ...params,
    nowIso(),
  );
  for (const key of filled) {
    if (ANSWER_KEYS.includes(key)) learnAnswer(key, String(input[key]), actor);
  }
  recordEvent('understand', 'profile_filled', actor, filled.join(', '));
  return { ok: true, filled, skipped, gaps: profileGaps() };
}

/**
 * @param {string} question
 * @param {string} answer
 * @param {'person' | 'agent'} source
 */
export function learnAnswer(question, answer, source) {
  const q = clip(question, 300).trim();
  const a = clip(answer, 2000).trim();
  if (!q || !a) return { ok: false, code: 'empty' };
  if (source !== 'person' && source !== 'agent') return { ok: false, code: 'bad_actor' };
  const existing = get('SELECT * FROM answers WHERE question = ? COLLATE NOCASE', q);
  if (existing && existing.source === 'person' && source === 'agent') {
    return { ok: false, code: 'person_answer_wins', answer: existing.answer };
  }
  if (existing) {
    run('UPDATE answers SET answer = ?, source = ?, created_at = ? WHERE id = ?', a, source, nowIso(), existing.id);
    return { ok: true, id: existing.id, updated: true };
  }
  const info = run(
    'INSERT INTO answers (question, answer, source, created_at) VALUES (?, ?, ?, ?)',
    q, a, source, nowIso(),
  );
  return { ok: true, id: Number(info.lastInsertRowid), updated: false };
}

/** @returns {Array<{id: number, question: string, answer: string, source: string}>} */
export function listAnswers() {
  return all('SELECT id, question, answer, source FROM answers ORDER BY id ASC LIMIT 40');
}

/**
 * @param {string} question
 */
export function findAnswer(question) {
  const q = String(question || '').trim().toLowerCase();
  if (!q) return null;
  const rows = listAnswers();
  return rows.find((row) => row.question.toLowerCase() === q)
    || rows.find((row) => q.includes(row.question.toLowerCase()) || row.question.toLowerCase().includes(q))
    || null;
}

/**
 * Ask the person once, on the setup page. A known answer is returned instead.
 * @param {string} question
 */
export function askPerson(question) {
  const q = clip(question, 300).trim();
  if (!q) return { ok: false, code: 'empty' };
  const known = findAnswer(q);
  if (known) return { ok: true, known: true, answer: known.answer };
  const open = get("SELECT * FROM questions WHERE question = ? COLLATE NOCASE AND status = 'open'", q);
  if (open) return { ok: true, id: open.id, existed: true, url: `${webOrigin()}/setup` };
  const info = run(
    "INSERT INTO questions (question, status, created_at) VALUES (?, 'open', ?)",
    q, nowIso(),
  );
  recordEvent('understand', 'question', String(info.lastInsertRowid), q);
  return { ok: true, id: Number(info.lastInsertRowid), url: `${webOrigin()}/setup` };
}

/** @returns {Array<{id: number, question: string}>} */
export function openQuestions() {
  return all("SELECT id, question FROM questions WHERE status = 'open' ORDER BY id ASC LIMIT 20");
}

/**
 * Only the person can close a question.
 * @param {number} id
 * @param {string} answer
 * @param {string} actor
 */
export function answerQuestion(id, answer, actor) {
  if (actor !== 'person') return { ok: false, code: 'human_only' };
  const row = get('SELECT * FROM questions WHERE id = ?', id);
  if (!row) return { ok: false, code: 'missing' };
  const text = clip(answer, 2000).trim();
  if (!text) return { ok: false, code: 'empty' };
  learnAnswer(row.question, text, 'person');
  run("UPDATE questions SET status = 'answered' WHERE id = ?", id);
  recordEvent('understand', 'answered', String(id), row.question);
  return { ok: true, id };
}
