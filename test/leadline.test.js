import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import zlib from 'node:zlib';

const dir = mkdtempSync(path.join(tmpdir(), 'leadline-'));
process.env.LEADLINE_DATA_DIR = dir;
process.env.LEADLINE_DB = path.join(dir, 'leadline.db');
process.env.LEADLINE_DISABLE_BROWSER = '1';
process.env.LEADLINE_PORT = '0';

const profile = {
  name: 'Northwind',
  sender_name: 'Ada',
  sender_email: 'ada@northwind.example',
  website: 'https://northwind.example',
  one_liner: 'A desk for finding buyers',
  offer: 'A desk that keeps outreach under the sender\'s control',
  audience: 'Founders of small software firms',
  problem: 'Warm conversations get lost',
  proof: 'Twelve teams ran the desk for a month',
  tone: 'Plain and direct',
  geos: 'United States',
  price_band: '1500 a month',
  do_not_contact: '',
  extra: 'Notes from the deck.',
};

test('gate, memory, and the control plane', { timeout: 90000 }, async () => {
  let server;
  let failure;
  let cleanupError;
  try {
    const { all, get, getDb, run } = await import('../src/kernel/db.js');
    const { saveBusiness, profileGaps, learnAnswer, askPerson, answerQuestion, getBusiness } = await import('../src/understand/profile.js');
    const { addLinks, addPdf, fillProfile, looksLikeLogin, readSource } = await import('../src/understand/sources.js');
    const { extractPage } = await import('../src/understand/extract.js');
    const { readWebsite } = await import('../src/understand/website.js');
    const { saveLead, setFit, searchLeads } = await import('../src/discover/leads.js');
    const { createCampaign, setCampaignStatus } = await import('../src/gtm/campaigns.js');
    const { draftMessage, requestApproval, approveMessage, markSent } = await import('../src/reach/messages.js');
    const { canSend, setChannelMode, listPermissions } = await import('../src/reach/gate.js');
    const { writeFollowup } = await import('../src/reach/followups.js');
    const { plan } = await import('../src/kernel/flows.js');
    const { contextSlice } = await import('../src/kernel/context.js');
    const { pathRecord, pathLookup } = await import('../src/browser/paths.js');
    const { classifyBlocker } = await import('../src/browser/blockers.js');
    const { executeSend, sendBlockedUntilTyped } = await import('../src/browser/act.js');
    const { listStalls, recordStall, syncStalls } = await import('../src/trace/stalls.js');
    const { callTool, toolNames } = await import('../src/mcp/tools.js');
    const { CHANNELS } = await import('../src/kernel/enums.js');
    const { startServer } = await import('../src/web/server.js');
    const { chromePath } = await import('../src/browser/chrome.js');

    getDb();
    getDb();
    assert.deepEqual(all('SELECT id FROM schema_migrations').map((row) => row.id), ['001_init.sql', '002_desk.sql', '003_sources.sql', '004_plan.sql', '005_trace.sql', '006_ledger.sql']);
    const perms = listPermissions();
    assert.equal(perms.length, 9);
    assert.ok(perms.every((row) => row.mode === 'draft'));
    assert.ok(profileGaps().includes('name'));

    const sentence = 'Northwind sells a desk to founders. Ada writes the notes. The problem is lost conversations.';
    const pdf = addPdf(tinyPdf(sentence), 'deck.pdf');
    assert.equal(pdf.status, 'read');
    assert.match(pdf.excerpt, /sells a desk to founders/);
    const flate = addPdf(flatePdf('Harbor clinics need a calmer desk today'), 'flate.pdf');
    assert.equal(flate.status, 'read');
    assert.match(flate.excerpt, /Harbor clinics/);
    assert.equal(addPdf(Buffer.from('not a pdf'), 'notes.pdf').code, 'bad_pdf');
    const invented = fillProfile({ offer: 'We train enterprise procurement teams on compliance software' }, 'agent');
    assert.ok(invented.rejected.includes('offer'));
    assert.equal(getBusiness().offer, '');
    const filled = fillProfile({
      name: 'Northwind',
      sender_name: 'Ada',
      offer: 'sells a desk to founders',
      problem: 'lost conversations',
    }, 'agent');
    assert.ok(filled.filled.includes('offer'));
    assert.equal(getBusiness().name, 'Northwind');
    assert.ok(fillProfile({ name: 'Other Name' }, 'agent').skipped.includes('name'));
    assert.equal(looksLikeLogin({ url: 'https://example.com', title: 'Acme', excerpt: 'We help teams. Sign in is in the footer.', blocker: '' }), false);
    assert.equal(looksLikeLogin({ url: 'https://www.linkedin.com/login', title: 'Sign in', excerpt: 'Email or phone Password', blocker: 'login' }), true);
    const links = addLinks('https://www.linkedin.com/in/ada\nhttps://harbor.example');
    assert.equal(links.added[0].kind, 'social');
    assert.equal(links.added[0].platform, 'linkedin');
    assert.equal(links.added[1].kind, 'website');
    const calls = [];
    const loggedOut = await readSource(links.added[0].id, async (url) => {
      calls.push(url);
      return { ok: true, url, title: 'Sign in', excerpt: 'Email or phone Password', controls: [{ text: 'Sign in' }], blocker: '' };
    });
    assert.equal(loggedOut.code, 'needs_login');
    assert.deepEqual(calls, ['https://www.linkedin.com/feed/']);
    assert.equal(get('SELECT excerpt FROM profile_sources WHERE id = ?', links.added[0].id).excerpt, '');
    run("UPDATE profile_sources SET status = 'saved', detail = '', excerpt = '' WHERE id = ?", links.added[0].id);
    calls.length = 0;
    const opened = await readSource(links.added[0].id, async (url) => {
      calls.push(url);
      if (url.includes('/feed')) {
        return { ok: true, url, title: 'Feed', excerpt: 'Hello from your network', controls: [{ text: 'Messaging' }], blocker: '' };
      }
      return { ok: true, url, title: 'Ada at Northwind', excerpt: 'Northwind sells a desk to founders', controls: [], blocker: '' };
    });
    assert.equal(opened.ok, true);
    assert.equal(calls.length, 2);
    assert.match(opened.excerpt, /sells a desk/);
    process.env.LEADLINE_DISABLE_NETWORK = '1';
    assert.equal((await readSource(links.added[1].id)).code, 'network_disabled');
    delete process.env.LEADLINE_DISABLE_NETWORK;
    assert.equal((await readSource(links.added[0].id)).code === 'browser_disabled' || get('SELECT status FROM profile_sources WHERE id = ?', links.added[0].id).status === 'read', true);
    run("DELETE FROM profile_sources WHERE status <> 'read'");

    assert.equal(saveBusiness({ ...profile, sender_email: 'not-an-email' }).code, 'bad_email');
    assert.equal(saveBusiness(profile).ok, true);
    assert.deepEqual(profileGaps(), []);
    assert.equal(learnAnswer('offer', 'a different offer', 'agent').code, 'person_answer_wins');

    const asked = askPerson('What is the implementation timeline?');
    assert.equal(asked.ok, true);
    assert.equal(answerQuestion(asked.id, 'two weeks', 'agent').code, 'human_only');
    assert.equal(answerQuestion(asked.id, 'two weeks', 'person').ok, true);

    const extracted = extractPage('<html><head><title>Northwind</title><meta name="description" content="A desk"></head><body><h1>Buyers</h1><p>Hello teams</p></body></html>', 'https://northwind.example');
    assert.equal(extracted.title, 'Northwind');
    assert.match(extracted.excerpt, /Hello teams/);
    process.env.LEADLINE_DISABLE_NETWORK = '1';
    assert.equal((await readWebsite('https://northwind.example')).code, 'network_disabled');
    delete process.env.LEADLINE_DISABLE_NETWORK;

    const { begin } = await import('../src/kernel/desk.js');
    assert.equal(plan().step, 'ask_start');
    assert.equal(plan().tool, 'begin');
    assert.equal(begin({ answer: 'no' }, 'agent').started, false);
    assert.equal(plan().step, 'ask_start');
    assert.equal(begin({ answer: 'yes', fullPower: false }, 'agent').started, true);
    assert.equal(plan().tool, 'create_campaign');
    assert.ok(fillProfile({ offer: 'sells a desk to founders' }, 'agent').skipped.includes('offer'));
    assert.equal(getBusiness().offer, profile.offer);
    run("UPDATE business SET name = '' WHERE id = 1");
    assert.equal(plan().tool, 'fill_profile');
    run('DELETE FROM profile_sources');
    assert.equal(plan().tool, 'open_setup');
    const waiting = addLinks('https://www.linkedin.com/in/ada');
    run("UPDATE profile_sources SET status = 'needs_login', excerpt = '' WHERE id = ?", waiting.added[0].id);
    assert.equal(plan().step, 'sign_in');
    run('DELETE FROM profile_sources');
    assert.equal(saveBusiness(profile).ok, true);
    assert.equal(plan().tool, 'create_campaign');
    assert.equal(setCampaignStatus(1, 'active', 'agent').code, 'human_only');
    const campaign = createCampaign({
      name: 'Spring', goal: 'Talk to ten founders', offerSummary: profile.offer,
      icpSummary: profile.audience, channels: ['email', 'linkedin'],
    });
    assert.equal(campaign.status, 'draft');
    assert.equal(plan().step, 'start');
    assert.equal(plan().tool, null);
    assert.equal(setCampaignStatus(campaign.id, 'active', 'person').ok, true);
    assert.equal(plan().step, 'find');

    const first = saveLead({
      source: 'web',
      source_url: 'https://ada.example/about?utm_source=newsletter',
      name: 'Ada',
      email: 'ada@northwind.example',
      company: 'Northwind',
      snippet: 'Founder looking for a calmer way to reach buyers',
    });
    const again = saveLead({
      source: 'linkedin',
      source_url: 'https://www.linkedin.com/in/ada',
      email: 'ada@northwind.example',
      name: 'Ada',
    });
    assert.equal(first.created, true);
    assert.equal(again.created, false);
    assert.equal(again.id, first.id);
    assert.equal(searchLeads('Northwind').length, 1);
    assert.equal(plan().step, 'qualify');
    setFit(first.id, 'yes', 'Sells to the same buyers');
    assert.equal(plan().step, 'draft');
    assert.equal(sendBlockedUntilTyped({ ok: true, prepared: false }), true);
    assert.equal(sendBlockedUntilTyped({ ok: true, prepared: true }), false);
    const traced = syncStalls();
    assert.equal(traced.ok, true);
    assert.equal(listStalls('open').some((row) => row.code === 'no_message' && row.ref === String(first.id)), true);
    assert.match(listStalls('open')[0].detail, /Ada is marked yes and has no message/);

    const draft = draftMessage({ leadId: first.id, channel: 'email', subject: 'Desk', body: 'Ada, the desk keeps the send behind your approval.' });
    syncStalls();
    assert.equal(listStalls('open').some((row) => row.code === 'no_message'), false);
    assert.equal(draft.ok, true);
    assert.equal(plan().step, 'permission');
    assert.equal((await executeSend(draft.id)).code, 'permission');
    assert.equal(setChannelMode('email', 'approve', 5, 'agent').code, 'human_only');
    assert.equal(setChannelMode('email', 'approve', 5, 'person').ok, true);
    const { saveDesk } = await import('../src/kernel/desk.js');
    assert.equal(saveDesk({ running: 1, full_power: 1, adaptability: 1 }, 'person').ok, true);
    assert.equal(plan().tool, 'execute_send');
    assert.equal(canSend(draft.id).ok, true);
    assert.equal(saveDesk({ running: 1, full_power: 0, adaptability: 1 }, 'person').ok, true);
    assert.equal(plan().tool, 'request_approval');
    assert.equal(requestApproval(draft.id).status, 'awaiting_approval');
    assert.equal(plan().step, 'await_approval');
    assert.equal(approveMessage(draft.id, 'agent').code, 'human_only');
    assert.equal(canSend(draft.id).code, 'not_approved');
    assert.equal(approveMessage(draft.id, 'person').ok, true);
    assert.equal(canSend(draft.id).ok, true);
    assert.equal(plan().tool, 'execute_send');
    assert.equal((await executeSend(draft.id)).code, 'browser_disabled');
    assert.equal(recordStall({
      code: 'composer', flow: 'reach', step: 'send_one', ref: String(draft.id),
      detail: 'email is open. The note is not in the box, so Send was not clicked.',
    }).ok, true);
    assert.equal(listStalls('open').some((row) => row.code === 'composer' && row.ref === String(draft.id)), true);
    const sent = markSent(draft.id);
    syncStalls();
    assert.equal(listStalls('open').some((row) => row.code === 'composer'), false);
    assert.equal(sent.ok, true);
    assert.equal(canSend(draft.id).code, 'already_sent');
    assert.equal(sent.followup.ok, true);

    run('UPDATE messages SET due_at = ? WHERE kind = ?', new Date(Date.now() - 1000).toISOString(), 'followup');
    assert.equal(plan().step, 'draft_followup');
    const written = writeFollowup({ messageId: draft.id, body: 'Checking whether this is still useful.' });
    assert.equal(written.ok, true);
    assert.equal(plan().tool, 'request_approval');

    saveBusiness({ ...profile, do_not_contact: 'Blockedco' });
    const blocked = saveLead({
      source: 'web', source_url: 'https://blockedco.example', company: 'Blockedco', name: 'Sam',
    });
    assert.equal(blocked.suppressed, true);

    setChannelMode('email', 'approve', 1, 'person');
    const other = saveLead({
      source: 'web', source_url: 'https://other.example', email: 'bea@other.example', name: 'Bea', company: 'Other',
    });
    setFit(other.id, 'yes', 'Same audience');
    const second = draftMessage({ leadId: other.id, channel: 'email', body: 'Hello Bea' });
    requestApproval(second.id);
    approveMessage(second.id, 'person');
    assert.equal(canSend(second.id).code, 'daily_cap');

    for (let i = 0; i < 30; i += 1) {
      saveLead({
        source: 'web',
        source_url: `https://people.example/p/${i}`,
        name: `Person ${i}`,
        company: 'Crowd',
        snippet: 'x'.repeat(400),
      });
    }
    const slice = contextSlice('pipeline');
    assert.equal(slice.ok, true);
    assert.ok(JSON.stringify(slice).length < 7000);
    assert.ok(slice.data.leads.length <= 8);

    assert.equal(pathRecord({ site: 'example.com', fromNode: 'home', choice: 'open', outcome: 'nope' }).code, 'bad_outcome');
    assert.equal(pathRecord({
      site: 'example.com', fromNode: 'home', choice: 'open', toNode: 'profile', outcome: 'reached', see: 'a profile link',
    }).ok, true);
    assert.equal(pathLookup('example.com').branches[0].outcome, 'reached');
    assert.equal(classifyBlocker({ title: 'Verify you are human', excerpt: '' }), 'captcha');
    assert.equal(classifyBlocker({ url: 'https://www.linkedin.com/login', excerpt: 'welcome' }), 'login');
    assert.equal(classifyBlocker({ url: 'https://example.com', title: 'Acme', excerpt: 'We help teams. Sign in is in the footer.' }), '');

    const names = toolNames();
    for (const forbidden of ['approve_message', 'set_channel_mode', 'set_permission', 'mark_sent', 'set_campaign_status', 'set_content_status']) {
      assert.equal(names.includes(forbidden), false, forbidden);
    }
    assert.equal(names.includes('trace_stalls'), true);
    assert.equal(names.includes('review_ledger'), true);
    const { reviewLedger } = await import('../src/kernel/ledger.js');
    const { saveAgentMode } = await import('../src/kernel/desk.js');
    const looked = reviewLedger();
    assert.equal(looked.ok, true);
    assert.equal(looked.lanes.length, 7);
    assert.equal(looked.fine, true);
    assert.equal(saveAgentMode('trace', 'off', 'person').ok, true);
    const missed = reviewLedger();
    assert.equal(missed.fine, false);
    assert.equal(missed.lanes.find((row) => row.agent === 'trace').status, 'stuck');
    assert.match(missed.lanes.find((row) => row.agent === 'trace').detail, /Turn it on in Settings/);
    assert.equal(saveAgentMode('trace', 'auto', 'person').ok, true);
    const healed = reviewLedger();
    assert.equal(healed.lanes.find((row) => row.agent === 'trace').status, 'working');
    assert.equal(healed.fine, true);
    assert.equal((await callTool('approve_message', { id: 1 })).code, 'unknown_tool');
    assert.equal((await callTool('save_lead', {})).code === 'needs_profile' || (await callTool('save_lead', {})).code === 'bad_source', true);

    const started = await startServer();
    server = started.server;
    const origin = `http://127.0.0.1:${started.port}`;
    const setup = await fetch(`${origin}/setup`);
    assert.equal(setup.status, 200);
    const setupHtml = await setup.text();
    assert.match(setupHtml, /What you sell/);
    assert.match(setupHtml, /Sign in to those accounts/);

    const body = new URLSearchParams({ ...profile, name: 'Harbor Studio' });
    const posted = await fetch(`${origin}/setup`, { method: 'POST', body, redirect: 'manual' });
    assert.equal(posted.status, 303);
    const savedPage = await fetch(`${origin}/setup`);
    assert.match(await savedPage.text(), /Harbor Studio/);
    const desk = await (await fetch(`${origin}/`)).text();
    assert.match(desk, /Open the crew/);
    assert.match(desk, /href="\/crew"/);
    assert.match(desk, /href="\/plan"/);
    assert.match(desk, /href="\/persona"/);
    assert.match(desk, /href="\/setup"/);
    assert.doesNotMatch(desk, /Where it stuck/);
    const crew = await (await fetch(`${origin}/crew`)).text();
    assert.match(crew, /<svg class="crew-map"/);
    assert.match(crew, /The master checked the crew/);
    assert.match(crew, /The required lanes are working/);
    assert.match(crew, /Understand/);
    assert.match(crew, /Reach/);
    assert.match(crew, /href="\/plan"/);
    assert.match(crew, /href="\/persona"/);
    assert.match(crew, /Where it stuck/);
    assert.match(crew, /Nothing is stuck/);
    const persona = await (await fetch(`${origin}/persona`)).text();
    assert.match(persona, /Harbor Studio/);
    assert.match(persona, /Founders of small software firms/);
    const questions = await (await fetch(`${origin}/questions`)).text();
    assert.match(questions, /Who it is for/);
    assert.match(questions, /A desk that keeps outreach/);
    const trends = await (await fetch(`${origin}/trends`)).text();
    assert.match(trends, /<svg/);
    const results = await (await fetch(`${origin}/results`)).text();
    assert.match(results, /What worked/);
    assert.match(results, /What did not work/);
    const tracking = await (await fetch(`${origin}/tracking`)).text();
    assert.match(tracking, /Platforms today/);
    assert.match(tracking, /Where it stuck/);
    const legacy = await fetch(`${origin}/?tab=trends`, { redirect: 'manual' });
    assert.equal(legacy.status, 303);
    assert.equal(legacy.headers.get('location'), '/trends');
    const planPage = await (await fetch(`${origin}/plan`)).text();
    assert.match(planPage, /Today's plan/);
    assert.match(planPage, /Nothing planned yet/);
    assert.match(planPage, /name="new_body"/);
    const planPosted = await fetch(`${origin}/desk/plan`, {
      method: 'POST',
      body: new URLSearchParams({ note: 'Test day', new_body: 'Write the first line' }),
      redirect: 'manual',
    });
    assert.equal(planPosted.status, 303);
    assert.equal(planPosted.headers.get('location'), '/plan?ok=plan');
    const planSaved = await (await fetch(`${origin}${planPosted.headers.get('location')}`)).text();
    assert.match(planSaved, /Plan saved/);
    assert.match(planSaved, /Test day/);
    assert.match(planSaved, /Write the first line/);
    const planId = /name="body_(\d+)"/.exec(planSaved)?.[1];
    assert.ok(planId);
    const planEdited = await fetch(`${origin}/desk/plan`, {
      method: 'POST',
      body: new URLSearchParams({ note: 'Test day', item: planId, [`body_${planId}`]: 'Changed line', done: planId }),
      redirect: 'manual',
    });
    assert.equal(planEdited.status, 303);
    const planAfter = await (await fetch(`${origin}${planEdited.headers.get('location')}`)).text();
    assert.match(planAfter, /Changed line/);
    assert.match(planAfter, new RegExp(`name="done" value="${planId}" checked`));
    const planRemoved = await fetch(`${origin}/desk/plan`, {
      method: 'POST',
      body: new URLSearchParams({ note: 'Kept the note', item: planId, [`body_${planId}`]: 'Changed line', remove: planId }),
      redirect: 'manual',
    });
    assert.equal(planRemoved.status, 303);
    const planEmpty = await (await fetch(`${origin}${planRemoved.headers.get('location')}`)).text();
    assert.match(planEmpty, /Nothing planned yet/);
    assert.match(planEmpty, /Kept the note/);
    assert.doesNotMatch(planEmpty, /Changed line/);
    const boundary = '----LeadlineBoundary';
    const uploadPdf = tinyPdf('Harbor Studio sells websites to local clinics.');
    const uploadBody = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="links"\r\n\r\nhttps://www.linkedin.com/in/harbor\r\n` +
        `--${boundary}\r\nContent-Disposition: form-data; name="pdf"; filename="deck.pdf"\r\nContent-Type: application/pdf\r\n\r\n`,
      ),
      uploadPdf,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    const uploaded = await fetch(`${origin}/setup/materials`, {
      method: 'POST',
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
      body: uploadBody,
      redirect: 'manual',
    });
    assert.equal(uploaded.status, 303);
    assert.match(uploaded.headers.get('location') || '', /ok=materials/);
    const materialsPage = await (await fetch(`${origin}/setup`)).text();
    assert.match(materialsPage, /deck\.pdf/);
    assert.match(materialsPage, /linkedin\.com\/in\/harbor/);
    assert.match(materialsPage, /Waiting to be read/);

    const home = await fetch(`${origin}/`);
    assert.equal(home.status, 200);
    assert.match(await home.text(), /Leadline/);
    assert.equal((await fetch(`${origin}/health`)).status, 200);
    for (const route of ['/discover', '/reach', '/create', '/gtm', '/permissions', '/settings', '/browser', '/learn']) {
      const res = await fetch(`${origin}${route}`);
      assert.equal(res.status, 200, route);
    }
    assert.equal((await fetch(`${origin}/missing`)).status, 404);

    const gtm = await fetch(`${origin}/gtm`, {
      method: 'POST',
      body: new URLSearchParams({ name: 'Harbor push', goal: 'Five conversations', channels: 'email' }),
      redirect: 'manual',
    });
    assert.equal(gtm.status, 303);
    assert.match(await (await fetch(`${origin}/gtm`)).text(), /Harbor push/);

    const permBody = new URLSearchParams();
    for (const channel of CHANNELS) {
      permBody.set(`mode_${channel.id}`, channel.id === 'email' ? 'approve' : 'draft');
      permBody.set(`cap_${channel.id}`, '5');
    }
    const permsPost = await fetch(`${origin}/permissions`, { method: 'POST', body: permBody, redirect: 'manual' });
    assert.equal(permsPost.status, 303);
    assert.match(await (await fetch(`${origin}/permissions`)).text(), /approve/);

    const { getSettings } = await import('../src/kernel/desk.js');
    const { nextStrategy, trainStrategy, listStrategies } = await import('../src/kernel/strategies.js');
    const { saveLead: saveAnother, setFit: fitAnother } = await import('../src/discover/leads.js');
    const { draftMessage: draftAnother } = await import('../src/reach/messages.js');
    assert.equal(getSettings().full_power, 0);
    assert.equal(getSettings().adaptability, 1);
    assert.ok(listStrategies().some((row) => row.id === 'ig-comments'));
    assert.equal(nextStrategy('Instagram').id, 'ig-comments');
    assert.equal(trainStrategy('ig-comments', 'wrong', 'Look at the bio first', 'agent').code, 'human_only');
    assert.equal(trainStrategy('ig-comments', 'wrong', 'Look at the bio first', 'person').ok, true);
    assert.equal(nextStrategy('Instagram').id, 'ig-bio');
    assert.equal(saveDesk({ running: 1, full_power: 1, adaptability: 1 }, 'agent').code, 'human_only');
    assert.equal(saveDesk({ running: 0, full_power: 1, adaptability: 0 }, 'person').ok, true);
    const powered = saveAnother({
      source: 'web', source_url: 'https://powered.example/about', name: 'Power',
      email: 'power@example.com', company: 'Powerco', snippet: 'Needs a calmer desk',
    });
    fitAnother(powered.id, 'yes', 'Fits');
    const poweredMsg = draftAnother({
      leadId: powered.id, channel: 'email', subject: 'Desk', body: 'Power, the desk sends when you have allowed it.',
    });
    assert.equal(canSend(poweredMsg.id).ok, true);
    assert.equal(saveDesk({ running: 0, full_power: 0, adaptability: 1 }, 'person').ok, true);
    assert.equal(canSend(poweredMsg.id).code, 'not_approved');
    const settingsPage = await fetch(`${origin}/settings`);
    assert.equal(settingsPage.status, 200);
    const settingsHtml = await settingsPage.text();
    assert.match(settingsHtml, /Turn on full power/);
    const flipped = await fetch(`${origin}/desk/power`, {
      method: 'POST',
      headers: { referer: `${origin}/settings` },
      body: new URLSearchParams({ power: '1' }),
      redirect: 'manual',
    });
    assert.equal(flipped.status, 303);
    assert.match(flipped.headers.get('location') || '', /\/settings\?ok=power_on/);
    assert.match(await (await fetch(`${origin}/settings`)).text(), /Full power is on/);
    const reachOn = await (await fetch(`${origin}/reach`)).text();
    assert.match(reachOn, /Full power is on/);
    assert.doesNotMatch(reachOn, /Approve send/);
    assert.match(await (await fetch(`${origin}/`)).text(), /Open the crew/);
    assert.match(await (await fetch(`${origin}/learn`)).text(), /Try this next/);

    const exe = chromePath();
    if (exe) {
      const { chromium } = await import('playwright-core');
      const browser = await chromium.launch({ executablePath: exe, headless: true });
      const page = await browser.newPage();
      try {
      await page.goto(`${origin}/setup`);
      assert.match(await page.locator('body').innerText(), /Sign in to those accounts/);
      assert.equal(await page.inputValue('[name=name]'), 'Harbor Studio');
      await page.fill('[name=name]', 'Harbor Studio Live');
      await page.getByRole('button', { name: 'Save profile' }).click();
      await page.waitForURL(/\/setup\?ok=saved/);
      assert.equal(await page.inputValue('[name=name]'), 'Harbor Studio Live');
      await page.goto(`${origin}/permissions`);
      assert.match(await page.locator('body').innerText(), /Who may be contacted/);
      await page.goto(`${origin}/settings`);
      assert.match(await page.locator('body').innerText(), /Full power/);
      await page.locator('[name=full_power]').check();
      await page.getByRole('button', { name: 'Save settings' }).click();
      await page.waitForURL(/\/settings\?ok=desk/);
      assert.match(await page.locator('body').innerText(), /Settings saved/);
      await page.goto(`${origin}/`);
      assert.match(await page.locator('body').innerText(), /Open the crew/);
      await page.locator('aside').getByRole('link', { name: 'Crew', exact: true }).click();
      await page.waitForURL(/\/crew$/);
      assert.match(await page.locator('body').innerText(), /The crew/);
      await page.locator('aside').getByRole('link', { name: 'Plan', exact: true }).click();
      await page.waitForURL(/\/plan$/);
      assert.match(await page.locator('body').innerText(), /Today's plan/);
      await page.goto(`${origin}/reach`);
      assert.doesNotMatch(await page.locator('body').innerText(), /Approve send/);
      await page.goto(`${origin}/learn`);
      await page.getByRole('button', { name: 'This is wrong' }).first().click();
      await page.waitForURL(/\/learn\?ok=trained/);
      } finally {
        await browser.close();
      }
    }

    assert.ok(get("SELECT status FROM messages WHERE id = ?", draft.id).status === 'sent');
  } catch (err) {
    failure = err;
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    const { closeDb } = await import('../src/kernel/db.js');
    closeDb();
    for (let attempt = 0; attempt < 20; attempt += 1) {
      try {
        rmSync(dir, { recursive: true, force: true });
        cleanupError = undefined;
        break;
      } catch (err) {
        cleanupError = err;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    }
  }
  if (failure) throw failure;
  if (cleanupError) throw cleanupError;
});

/**
 * @param {string} sentence
 */
function tinyPdf(sentence) {
  const stream = `BT (${sentence}) Tj ET`;
  return Buffer.from(`%PDF-1.4\n1 0 obj<</Length ${stream.length}>>stream\n${stream}\nendstream\nendobj\n%%EOF\n`);
}

/**
 * @param {string} sentence
 */
function flatePdf(sentence) {
  const payload = Buffer.from(`BT (${sentence}) Tj ET`);
  const compressed = zlib.deflateSync(payload);
  return Buffer.concat([
    Buffer.from(`%PDF-1.4\n1 0 obj<</Filter/FlateDecode/Length ${compressed.length}>>stream\n`),
    compressed,
    Buffer.from('\nendstream\nendobj\n%%EOF\n'),
  ]);
}
