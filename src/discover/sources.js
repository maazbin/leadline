// src/discover/sources.js — search URLs the brain opens in the person's Chrome.
//
// Owns: query hints built from the profile. It does not scrape or rank people.
// Must not: save a lead or open the browser. The brain calls browser_open, then save_lead.

import { CHANNEL_IDS } from '../kernel/enums.js';
import { clip } from '../kernel/text.js';
import { getBusiness } from '../understand/profile.js';
import { activeCampaign, campaignChannels } from '../gtm/campaigns.js';

/**
 * @param {string} source
 * @param {string} query
 * @returns {string}
 */
export function searchUrl(source, query) {
  const q = encodeURIComponent(query);
  const urls = {
    web: `https://www.google.com/search?q=${q}`,
    linkedin: `https://www.linkedin.com/search/results/people/?keywords=${q}`,
    x: `https://x.com/search?q=${q}&src=typed_query&f=live`,
    reddit: `https://www.reddit.com/search/?q=${q}&sort=new`,
    instagram: `https://www.instagram.com/explore/tags/${encodeURIComponent(query.replace(/\s+/g, ''))}/`,
    facebook: `https://www.facebook.com/search/people/?q=${q}`,
    tiktok: `https://www.tiktok.com/search?q=${q}`,
    whatsapp: 'https://web.whatsapp.com/',
    email: `https://www.google.com/search?q=${encodeURIComponent(`${query} email`)}`,
    web_form: `https://www.google.com/search?q=${encodeURIComponent(`${query} contact`)}`,
  };
  return urls[source] || urls.web;
}

/** Where the person posts. Opening it does not publish. */
export function channelHome(channel) {
  const homes = {
    linkedin: 'https://www.linkedin.com/feed/',
    x: 'https://x.com/compose/post',
    reddit: 'https://www.reddit.com/submit',
    instagram: 'https://www.instagram.com/',
    facebook: 'https://www.facebook.com/',
    tiktok: 'https://www.tiktok.com/upload',
    whatsapp: 'https://web.whatsapp.com/',
    email: 'https://mail.google.com/',
  };
  return homes[channel] || '';
}

/**
 * A short list of searches. The brain judges the pages. This function does not.
 * @returns {{ ok: true, queries: string[], urls: Array<{ source: string, query: string, url: string }> }}
 */
export function discoverHints() {
  const business = getBusiness();
  const campaign = activeCampaign();
  const audience = clip(campaign?.icp_summary || business.audience, 180);
  const offer = clip(campaign?.offer_summary || business.offer, 120);
  const geo = clip(business.geos, 80);
  const queries = [
    [audience, geo].filter(Boolean).join(' '),
    [audience, offer].filter(Boolean).join(' '),
    [audience, 'founder'].filter(Boolean).join(' '),
  ].map((q) => q.replace(/\s+/g, ' ').trim()).filter((q) => q.length > 2).slice(0, 3);

  const sources = campaign ? campaignChannels(campaign.id) : ['web', 'linkedin'];
  const usable = sources.filter((source) => source !== 'email' && source !== 'web_form');
  const list = usable.length ? usable : ['web', 'linkedin'];
  const urls = [];
  for (const query of queries) {
    for (const source of list) {
      if (!CHANNEL_IDS.includes(source) && source !== 'web') continue;
      urls.push({ source, query, url: searchUrl(source, query) });
    }
  }
  if (!urls.length) {
    for (const query of queries) urls.push({ source: 'web', query, url: searchUrl('web', query) });
  }
  return { ok: true, queries, urls: urls.slice(0, 12) };
}
