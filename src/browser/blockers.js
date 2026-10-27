// src/browser/blockers.js — name a wall the person has to pass.
//
// Owns: the captcha and login classification.
// Must not: try to pass the wall, hide the browser, or change a fingerprint.
// A normal page that merely links to "Sign in" is not a wall.

const CAPTCHA = /verify you are human|are you human|unusual traffic|security check|captcha|cf-browser-verification|just a moment\.\.\./i;

const LOGIN_URL = /linkedin\.com\/login|linkedin\.com\/uas\/login|accounts\.google\.com|x\.com\/i\/flow\/login|facebook\.com\/login|instagram\.com\/accounts\/login|tiktok\.com\/login|reddit\.com\/login/i;

/**
 * @param {{ url?: string, title?: string, excerpt?: string }} page
 * @returns {'' | 'captcha' | 'login'}
 */
export function classifyBlocker({ url = '', title = '', excerpt = '' }) {
  const blob = `${title}\n${excerpt}`;
  if (CAPTCHA.test(blob) || /captcha|challenges\.cloudflare/i.test(url)) return 'captcha';
  if (LOGIN_URL.test(url)) return 'login';
  if (/scan (this |the )?qr code/i.test(blob)) return 'login';
  if (/enter your password/i.test(blob)) return 'login';
  return '';
}

/**
 * browser_click must not be a side door around execute_send.
 * @param {string} text
 */
export function isSendControl(text) {
  return /^(send|submit|post|publish|apply|share)(\b|$)/i.test(String(text || '').trim());
}
