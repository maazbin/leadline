// src/understand/extract.js — pull title, description, headings, and text from HTML.
//
// Owns: a dependency-free extractor for the person's own site.
// Must not: fetch. website.js fetches.

import { clip } from '../kernel/text.js';

/**
 * @param {string} html
 * @returns {string}
 */
function visibleText(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * @param {string} html
 * @param {string} url
 * @returns {{ url: string, title: string, description: string, headings: string, excerpt: string }}
 */
export function extractPage(html, url) {
  const title = clip((String(html).match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '').replace(/\s+/g, ' ').trim(), 200);
  const description = clip(
    String(html).match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i)?.[1]
      || String(html).match(/<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i)?.[1]
      || String(html).match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']*)["']/i)?.[1]
      || '',
    400,
  );
  const headings = [];
  for (const match of String(html).matchAll(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi)) {
    const text = visibleText(match[1]);
    if (text) headings.push(text);
    if (headings.length >= 12) break;
  }
  return {
    url,
    title,
    description,
    headings: clip(headings.join('\n'), 1000),
    excerpt: clip(visibleText(html), 4000),
  };
}

/**
 * Same-site links that usually explain an offer. At most three.
 * @param {string} html
 * @param {string} pageUrl
 * @returns {string[]}
 */
export function sameSiteLinks(html, pageUrl) {
  let base;
  try {
    base = new URL(pageUrl);
  } catch {
    return [];
  }
  const found = [];
  for (const match of String(html).matchAll(/href=["']([^"'#]+)["']/gi)) {
    let next;
    try {
      next = new URL(match[1], base);
    } catch {
      continue;
    }
    if (next.host !== base.host) continue;
    if (!/about|pricing|product|service|solution|work|customers/i.test(next.pathname)) continue;
    next.hash = '';
    const value = next.toString();
    if (value === pageUrl || found.includes(value)) continue;
    found.push(value);
    if (found.length >= 3) break;
  }
  return found;
}
