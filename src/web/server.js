// src/web/server.js — local control plane on 127.0.0.1.
//
// Owns: routing. Team rules live in the modules the handlers call.
// Must not: log request bodies. They can contain a message the person wrote.
// Writes: nothing itself.

import http from 'node:http';
import { getDb } from '../kernel/db.js';
import { alignReachWithFullPower } from '../kernel/desk.js';
import { bindHarness } from '../kernel/harness.js';
import { preferredPort, setBoundPort } from '../kernel/ports.js';
import { html, json, readForm, redirect } from './http.js';
import { shell } from './layout.js';
import { crewPage } from './pages/crew.js';
import { fixPage } from './pages/fix.js';
import { beginPost, powerPost, settingsPage, settingsPost } from './pages/desk.js';
import { personaPage } from './pages/persona.js';
import { pipelinePage } from './pages/pipeline.js';
import { planPage, planPost } from './pages/plan.js';
import { questionsPage } from './pages/questions.js';
import { resultsPage } from './pages/results.js';
import {
  browserLaunch, browserOpen, browserPage, learnPage, learnResolve, permissionsPage, permissionsPost, strategyPost,
} from './pages/system.js';
import { trackingPage } from './pages/tracking.js';
import { trendsPage } from './pages/trends.js';
import { answerPost, homePage, materialsPost, readMaterialPost, readSite, setupPage, setupPost } from './pages/today.js';
import {
  createOpen, createPage, createPost, createStatus, discoverFit, discoverOutcome, discoverPage,
  discoverReddit, discoverSave, gtmPage, gtmPost, gtmStatus, reachApprove, reachCancel, reachPage, reachSent,
} from './pages/work.js';

/**
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 */
async function handle(req, res) {
  getDb();
  const url = new URL(req.url || '/', 'http://127.0.0.1');
  const path = url.pathname;
  const query = Object.fromEntries(url.searchParams.entries());
  if (req.method === 'GET' && path === '/health') return json(res, { ok: true });
  if (req.method === 'GET' && path === '/' && query.tab) return redirect(res, legacyDesk(query));
  if (req.method === 'GET' && path === '/') return html(res, homePage(query));
  if (req.method === 'GET' && path === '/plan') return html(res, planPage(query));
  if (req.method === 'GET' && path === '/questions') return html(res, questionsPage(query));
  if (req.method === 'GET' && path === '/persona') return html(res, personaPage(query));
  if (req.method === 'GET' && path === '/trends') return html(res, trendsPage(query));
  if (req.method === 'GET' && path === '/results') return html(res, resultsPage(query));
  if (req.method === 'GET' && path === '/tracking') return html(res, trackingPage(query));
  if (req.method === 'GET' && path === '/crew') return html(res, crewPage(query));
  if (req.method === 'GET' && path === '/pipeline') return html(res, pipelinePage(query));
  if (req.method === 'GET' && path === '/settings') return html(res, settingsPage(query));
  if (req.method === 'GET' && path === '/setup') return html(res, setupPage(query));
  if (req.method === 'GET' && path === '/discover') return html(res, discoverPage(query));
  if (req.method === 'GET' && path === '/reach') return html(res, reachPage(query));
  if (req.method === 'GET' && path === '/create') return html(res, createPage(query));
  if (req.method === 'GET' && path === '/gtm') return html(res, gtmPage(query));
  if (req.method === 'GET' && path === '/fix') return html(res, fixPage(query));
  if (req.method === 'GET' && path === '/permissions') return html(res, permissionsPage(query));
  if (req.method === 'GET' && path === '/browser') return html(res, browserPage(query));
  if (req.method === 'GET' && path === '/learn') return html(res, learnPage(query));

  if (req.method === 'POST' && path === '/setup/materials') return materialsPost(req, res);

  if (req.method === 'POST') {
    const fields = await readForm(req);
    if (path === '/setup') return setupPost(res, fields);
    if (path === '/setup/materials/read') return readMaterialPost(res, fields);
    if (path === '/settings') return settingsPost(res, fields);
    if (path === '/desk/answer') return answerPost(res, fields);
    if (path === '/desk/plan') return planPost(res, fields);
    if (path === '/desk/begin') return beginPost(res, fields);
    if (path === '/desk/power') return powerPost(req, res, fields);
    if (path === '/setup/read-site') return json(res, await readSite(fields));
    if (path === '/discover/save') return discoverSave(res, fields);
    if (path === '/discover/fit') return discoverFit(res, fields);
    if (path === '/discover/outcome') return discoverOutcome(res, fields);
    if (path === '/discover/reddit') {
      const reddit = await discoverReddit(fields);
      return html(res, discoverPage(query, { reddit, redditQuery: String(fields.query || '') }));
    }
    if (path === '/reach/approve') return reachApprove(res, fields);
    if (path === '/reach/sent') return reachSent(res, fields);
    if (path === '/reach/cancel') return reachCancel(res, fields);
    if (path === '/create') return createPost(res, fields);
    if (path === '/create/status') return createStatus(res, fields);
    if (path === '/create/open') return createOpen(res, fields);
    if (path === '/gtm') return gtmPost(res, fields);
    if (path === '/gtm/status') return gtmStatus(res, fields);
    if (path === '/permissions') return permissionsPost(res, fields);
    if (path === '/browser/launch') return browserLaunch(res, fields);
    if (path === '/browser/open') return browserOpen(res, fields);
    if (path === '/learn/resolve') return learnResolve(res, fields);
    if (path === '/learn/strategy') return strategyPost(res, fields);
  }

  html(res, shell({
    team: 'kernel',
    title: 'Missing',
    kicker: 'Missing',
    body: '<p>That page is not in Leadline.</p>',
  }), 404);
}

const LEGACY_DESK = {
  today: '/',
  plan: '/plan',
  questions: '/questions',
  persona: '/persona',
  trends: '/trends',
  results: '/results',
  tracking: '/tracking',
};

/**
 * Old `/?tab=` links. Each screen now has its own path.
 * @param {Record<string, string>} query
 */
function legacyDesk(query) {
  const next = LEGACY_DESK[query.tab] || '/';
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (key !== 'tab' && value) params.set(key, value);
  }
  const tail = params.toString();
  return tail ? `${next}?${tail}` : next;
}

/**
 * @param {{ tolerateInUse?: boolean }} [opts]
 * @returns {Promise<{ port: number, server: import('node:http').Server | null, inUse: boolean }>}
 */
export function startServer(opts = {}) {
  getDb();
  alignReachWithFullPower();
  const server = http.createServer((req, res) => {
    handle(req, res).catch((err) => {
      console.error(err instanceof Error ? err.message : err);
      if (!res.headersSent) {
        res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
        res.end('Leadline hit an error. The detail is in the server log.');
      }
    });
  });
  const preferred = preferredPort();
  return new Promise((resolve, reject) => {
    server.on('error', (err) => {
      if (opts.tolerateInUse && err.code === 'EADDRINUSE') {
        resolve({ port: preferred, server: null, inUse: true });
        return;
      }
      reject(err);
    });
    server.listen(preferred, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : preferred;
      setBoundPort(port);
      if (process.env.LEADLINE_DISABLE_BROWSER !== '1') bindHarness(server);
      resolve({ port, server, inUse: false });
    });
  });
}
