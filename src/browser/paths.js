// src/browser/paths.js — per-site decision memory, stored in SQLite.
//
// Owns: path_nodes and path_branches.
// Must not: store personal data, screenshots, or a tracking query.
// The brain reads a site before driving it. Follow reached and success.
// Do not follow stop or refused. A new page adds a node. A wrong hop is an update.

import { all, run } from '../kernel/db.js';
import { PATH_OUTCOMES, oneOf } from '../kernel/enums.js';
import { clip } from '../kernel/text.js';

/**
 * @param {string} site
 */
export function pathLookup(site) {
  const key = clip(site, 80).trim().toLowerCase();
  if (!key) return { ok: false, code: 'missing_site' };
  return {
    ok: true,
    site: key,
    rule: 'Follow reached and success. Do not follow stop or refused. A retry stays on the node.',
    nodes: all('SELECT node_key, see, notes FROM path_nodes WHERE site = ? ORDER BY node_key', key),
    branches: all(
      'SELECT from_node, choice, to_node, outcome, note FROM path_branches WHERE site = ? ORDER BY id ASC',
      key,
    ),
  };
}

/**
 * @param {{ site: string, fromNode: string, choice: string, toNode?: string, outcome: string, see?: string, note?: string }} input
 */
export function pathRecord(input) {
  const site = clip(input.site, 80).trim().toLowerCase();
  const fromNode = clip(input.fromNode || input.from_node, 80).trim();
  const choice = clip(input.choice, 160).trim();
  const toNode = clip(input.toNode || input.to_node, 80).trim();
  const outcome = String(input.outcome || '');
  if (!site || !fromNode || !choice) return { ok: false, code: 'missing' };
  if (!oneOf(PATH_OUTCOMES, outcome)) return { ok: false, code: 'bad_outcome' };
  const see = clip(input.see, 300).trim();
  const note = clip(input.note, 300).trim();
  if (see) {
    run(
      `INSERT INTO path_nodes (site, node_key, see, notes) VALUES (?, ?, ?, '')
       ON CONFLICT(site, node_key) DO UPDATE SET see = CASE WHEN excluded.see = '' THEN see ELSE excluded.see END`,
      site, fromNode, see,
    );
  } else {
    run(
      'INSERT INTO path_nodes (site, node_key, see, notes) VALUES (?, ?, \'\', \'\') ON CONFLICT(site, node_key) DO NOTHING',
      site, fromNode,
    );
  }
  if (toNode) {
    run(
      'INSERT INTO path_nodes (site, node_key, see, notes) VALUES (?, ?, \'\', \'\') ON CONFLICT(site, node_key) DO NOTHING',
      site, toNode,
    );
  }
  run(
    `INSERT INTO path_branches (site, from_node, choice, to_node, outcome, note)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(site, from_node, choice) DO UPDATE SET
       to_node = excluded.to_node, outcome = excluded.outcome, note = excluded.note`,
    site, fromNode, choice, toNode, outcome, note,
  );
  return { ok: true, site, fromNode, choice, outcome };
}
