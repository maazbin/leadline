// src/browser/encounters.js — a stuck page, remembered so the next run does not repeat it.
//
// Owns: encounters rows. Screenshots are evidence files, not state.
// Must not: patch code by itself. The brain reads the row and edits the module.
// Writes: encounters, and a png under data/encounters when a page is available.

import fs from 'node:fs';
import path from 'node:path';
import { all, get, run } from '../kernel/db.js';
import { recordEvent } from '../kernel/events.js';
import { ENCOUNTER_KINDS, oneOf } from '../kernel/enums.js';
import { encounterDir } from '../kernel/paths.js';
import { clip } from '../kernel/text.js';
import { nowIso } from '../kernel/time.js';

/**
 * @param {{ site: string, url?: string, kind: string, detail?: string, excerpt?: string, page?: import('playwright-core').Page }} input
 */
export async function recordEncounter(input) {
  const kind = String(input.kind || '');
  if (!oneOf(ENCOUNTER_KINDS, kind)) return { ok: false, code: 'bad_kind' };
  const site = clip(input.site, 120).trim().toLowerCase();
  if (!site) return { ok: false, code: 'missing_site' };
  const url = clip(input.url, 500);
  const open = get(
    "SELECT id FROM encounters WHERE site = ? AND kind = ? AND url = ? AND status = 'open' ORDER BY id DESC LIMIT 1",
    site, kind, url,
  );
  if (open) return { ok: true, id: open.id, existed: true };

  const now = nowIso();
  const info = run(
    `INSERT INTO encounters (site, url, kind, detail, excerpt, screenshot, status, created_at)
     VALUES (?, ?, ?, ?, ?, '', 'open', ?)`,
    site, url, kind, clip(input.detail, 500), clip(input.excerpt, 1500), now,
  );
  const id = Number(info.lastInsertRowid);
  let screenshot = '';
  if (input.page) {
    try {
      fs.mkdirSync(encounterDir(), { recursive: true });
      screenshot = path.join(encounterDir(), `${id}.png`);
      await input.page.screenshot({ path: screenshot, fullPage: false });
      run('UPDATE encounters SET screenshot = ? WHERE id = ?', screenshot, id);
    } catch {
      screenshot = '';
    }
  }
  recordEvent('browser', kind, String(id), site);
  return { ok: true, id, screenshot };
}

/**
 * @param {'open' | 'resolved'} [status]
 */
export function listEncounters(status = 'open') {
  return all(
    'SELECT id, site, url, kind, detail, status, resolution, screenshot, created_at FROM encounters WHERE status = ? ORDER BY id DESC LIMIT 20',
    status,
  );
}

/**
 * @param {number} id
 * @param {string} resolution
 * @param {string} actor person | agent
 */
export function resolveEncounter(id, resolution, actor) {
  if (actor !== 'person' && actor !== 'agent') return { ok: false, code: 'bad_actor' };
  const note = clip(resolution, 500).trim();
  if (!note) return { ok: false, code: 'empty' };
  const row = get('SELECT id FROM encounters WHERE id = ?', id);
  if (!row) return { ok: false, code: 'missing' };
  run("UPDATE encounters SET status = 'resolved', resolution = ? WHERE id = ?", note, id);
  recordEvent('browser', 'resolved', String(id), note);
  return { ok: true, id };
}
