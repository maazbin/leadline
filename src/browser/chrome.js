// src/browser/chrome.js — open the person's real Chrome on a dedicated profile.
//
// Owns: finding chrome.exe and starting it with or without the debug port.
// Must not: kill the daily Chrome, attach to its default profile, or pass stealth flags.
// Writes: browser_state.mode. The profile lives in data/chrome-profile.
//
// Debug mode is for sites that tolerate a debugging port (Gmail, LinkedIn, X).
// Manual mode is the learned path for a site that shows a check only when the
// port is open: close the debug window, open this normal window, let the person
// pass the check. Do not spoof the browser. Do not attach Playwright during the check.

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { run } from '../kernel/db.js';
import { cdpPort, chromeProfileDir } from '../kernel/paths.js';
import { nowIso } from '../kernel/time.js';

/** @returns {string} Absolute chrome.exe, or '' when it is not installed. */
export function chromePath() {
  if (process.env.LEADLINE_CHROME && fs.existsSync(process.env.LEADLINE_CHROME)) return process.env.LEADLINE_CHROME;
  const candidates = process.platform === 'win32'
    ? [
      path.join(process.env.PROGRAMFILES || 'C:\\Program Files', 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)', 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    ]
    : [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
    ];
  return candidates.find((item) => item && fs.existsSync(item)) || '';
}

/** @returns {Promise<{ ok: boolean, browser?: string, port: number }>} */
export async function cdpStatus() {
  const port = cdpPort();
  try {
    const res = await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(1500) });
    if (!res.ok) return { ok: false, port };
    const json = await res.json();
    return { ok: true, browser: json.Browser || '', port };
  } catch {
    return { ok: false, port };
  }
}

function commonArgs() {
  return [
    `--user-data-dir=${chromeProfileDir()}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-features=CalculateNativeWinOcclusion,IntensiveWakeUpThrottling',
    '--disable-backgrounding-occluded-windows',
  ];
}

function spawnChrome(args) {
  const child = spawn(chromePath(), args, { detached: true, stdio: 'ignore' });
  child.unref();
}

async function waitForCdp(ms) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    const status = await cdpStatus();
    if (status.ok) return true;
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  return false;
}

/**
 * @param {{ mode?: 'debug' | 'manual' }} [opts]
 */
export async function launchChrome(opts = {}) {
  if (process.env.LEADLINE_DISABLE_BROWSER === '1') return { ok: false, code: 'browser_disabled' };
  const mode = opts.mode || 'debug';
  if (mode !== 'debug' && mode !== 'manual') return { ok: false, code: 'bad_mode' };
  const exe = chromePath();
  if (!exe) return { ok: false, code: 'no_chrome', detail: 'Install Google Chrome, or set LEADLINE_CHROME to chrome.exe.' };
  fs.mkdirSync(chromeProfileDir(), { recursive: true });

  if (mode === 'manual') {
    const up = await cdpStatus();
    if (up.ok) {
      return {
        ok: false,
        code: 'debug_window_open',
        detail: 'Close the Leadline debug Chrome first. This profile cannot be open twice. The normal window is for a site that blocks the debug port.',
      };
    }
    spawnChrome([...commonArgs(), 'about:blank']);
    run("UPDATE browser_state SET mode = 'manual', updated_at = ? WHERE id = 1", nowIso());
    return {
      ok: true,
      mode: 'manual',
      detail: 'A normal Chrome window is opening on the Leadline profile. Sign in there. Leave the debug port closed until the check is gone.',
    };
  }

  const up = await cdpStatus();
  if (up.ok) return { ok: true, mode: 'debug', state: 'already_up', port: up.port };
  spawnChrome([`--remote-debugging-port=${cdpPort()}`, ...commonArgs(), 'about:blank']);
  const ready = await waitForCdp(8000);
  run('UPDATE browser_state SET mode = ?, port = ?, updated_at = ? WHERE id = 1', ready ? 'debug' : 'down', cdpPort(), nowIso());
  if (!ready) {
    return {
      ok: false,
      code: 'timeout',
      detail: 'Chrome did not open the debug port. Close a Leadline window that already holds this profile, then try again.',
    };
  }
  return { ok: true, mode: 'debug', state: 'launched', port: cdpPort() };
}
