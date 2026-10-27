// src/web/pages/trends.js — the 14-day charts.
//
// Owns: /trends.
// Must not: write.
// Reads: the trend series.

import { esc } from '../../kernel/text.js';
import { trendSeries } from '../../kernel/tracking.js';
import { flash, shell } from '../layout.js';

/**
 * @param {string} title
 * @param {string} caption
 * @param {Array<Record<string, unknown>>} series
 * @param {string} key
 * @param {string} color
 */
function chartCard(title, caption, series, key, color) {
  const total = series.reduce((sum, row) => sum + Number(row[key]), 0);
  return `<article class="card">
    <h2>${esc(title)}</h2>
    <p class="muted">${esc(caption)}. ${total} in this window.</p>
    ${bars(series, key, color)}
  </article>`;
}

/**
 * @param {Array<Record<string, unknown>>} series
 * @param {string} key
 * @param {string} color
 */
function bars(series, key, color) {
  const max = Math.max(1, ...series.map((row) => Number(row[key])));
  const width = 640;
  const height = 168;
  const gap = 8;
  const barWidth = (width - gap * (series.length - 1)) / series.length;
  const shapes = series.map((row, index) => {
    const value = Number(row[key]);
    const barHeight = Math.round((value / max) * (height - 28));
    const x = index * (barWidth + gap);
    const y = height - 22 - Math.max(barHeight, 2);
    return `<rect x="${x.toFixed(1)}" y="${y}" width="${barWidth.toFixed(1)}" height="${Math.max(barHeight, 2)}" rx="4" fill="${color}"></rect>
      <text x="${(x + barWidth / 2).toFixed(1)}" y="${height - 6}" text-anchor="middle" fill="#b4b09f" font-size="10">${esc(String(row.label))}</text>`;
  }).join('');
  return `<svg class="chart" viewBox="0 0 ${width} ${height}" role="img">${shapes}</svg>`;
}

/**
 * @param {Record<string, string>} query
 */
export function trendsPage(query) {
  const series = trendSeries(14);
  const body = `
    ${flash(query)}
    <section class="grid">
      ${chartCard('Activity', 'Events recorded each day', series, 'events', '#8eb6ff')}
      ${chartCard('Leads', 'People saved each day', series, 'leads', '#7dcea0')}
      ${chartCard('Sent', 'Messages marked sent each day', series, 'sent', '#e0a15a')}
    </section>
    <section class="card">
      <h2>The 14 days</h2>
      <table>
        <thead><tr><th>Day</th><th>Events</th><th>Leads</th><th>Sent</th></tr></thead>
        <tbody>${series.map((row) => `<tr><td>${esc(row.day)}</td><td>${row.events}</td><td>${row.leads}</td><td>${row.sent}</td></tr>`).join('')}</tbody>
      </table>
    </section>`;
  return shell({ team: 'kernel', title: 'Trends', kicker: 'Desk', nav: 'Trends', body });
}
