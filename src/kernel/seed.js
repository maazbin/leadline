// src/kernel/seed.js — rows a fresh database needs. Safe to run on every open.
//
// Owns: the single business row, permission defaults, browser row, flow row.
// Must not: overwrite a mode, an answer, or a campaign the person already saved.
// A failed playbook fact may refresh its own row when the person has not marked it worked or try.
// Writes: business, channel_permissions, browser_state, flow_state.

import { CHANNELS, LANES } from './enums.js';
import { PLAYBOOK } from './playbook.js';
import { cdpPort } from './paths.js';
import { nowIso } from './time.js';

/**
 * @param {import('node:sqlite').DatabaseSync} db
 */
export function seed(db) {
  const now = nowIso();
  const business = db.prepare('SELECT id FROM business WHERE id = 1').get();
  if (!business) db.prepare('INSERT INTO business (id, updated_at) VALUES (1, ?)').run(now);

  const insertPerm = db.prepare(`INSERT OR IGNORE INTO channel_permissions
    (channel, mode, daily_cap, note, updated_at) VALUES (?, 'draft', ?, ?, ?)`);
  for (const channel of CHANNELS) insertPerm.run(channel.id, channel.cap, channel.note, now);
  db.prepare(`UPDATE channel_permissions SET note = ? WHERE channel = 'whatsapp' AND note LIKE '%stops the run%'`)
    .run(CHANNELS.find((channel) => channel.id === 'whatsapp').note);

  const browser = db.prepare('SELECT id FROM browser_state WHERE id = 1').get();
  if (!browser) {
    db.prepare(`INSERT INTO browser_state (id, mode, port, updated_at) VALUES (1, 'down', ?, ?)`)
      .run(cdpPort(), now);
  }

  const flow = db.prepare('SELECT id FROM flow_state WHERE id = 1').get();
  if (!flow) {
    db.prepare(`INSERT INTO flow_state (id, flow, step, updated_at) VALUES (1, 'understand', 'profile', ?)`)
      .run(now);
  }

  const desk = db.prepare('SELECT id FROM desk_settings WHERE id = 1').get();
  if (!desk) {
    db.prepare(`INSERT INTO desk_settings (id, running, full_power, adaptability, updated_at)
      VALUES (1, 0, 0, 1, ?)`).run(now);
  }

  const insertLane = db.prepare(`INSERT OR IGNORE INTO agent_permissions (agent, mode, updated_at) VALUES (?, 'draft', ?)`);
  insertLane.run('reach', now);
  for (const lane of LANES) insertLane.run(lane.id, now);

  const insertStep = db.prepare(`INSERT OR IGNORE INTO strategies
    (id, platform, when_text, step, result, evidence, human_verdict, human_note, tries, sort_order, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, '', '', 0, ?, ?)`);
  for (const step of PLAYBOOK) {
    insertStep.run(step.id, step.platform, step.when, step.step, step.result, step.evidence, step.sort, now);
  }

  const xDm = PLAYBOOK.find((step) => step.id === 'x-dm');
  db.prepare(`UPDATE strategies
    SET step = ?, result = ?, evidence = ?, updated_at = ?
    WHERE id = 'x-dm' AND result != 'worked' AND human_verdict = ''`).run(
    xDm.step, xDm.result, xDm.evidence, now,
  );
}
