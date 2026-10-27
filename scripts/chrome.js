// scripts/chrome.js — open the dedicated debug Chrome from a terminal.
//
// Does not touch the daily Chrome profile.

import { launchChrome } from '../src/browser/chrome.js';

const result = await launchChrome({ mode: 'debug' });
console.log(JSON.stringify(result, null, 2));
if (!result.ok) process.exitCode = 1;
