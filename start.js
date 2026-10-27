#!/usr/bin/env node
// start.js — the agent starts this. It installs dependencies, then serves the desk.
//
// The person does not run npm. The agent asks once, then runs this file.

import { ensureInstalled } from './src/kernel/runtime.js';

const ready = ensureInstalled();
if (!ready.ok) process.exit(1);

const { getDb } = await import('./src/kernel/db.js');
const { webOrigin } = await import('./src/kernel/ports.js');
const { startServer } = await import('./src/web/server.js');

getDb();
const running = await startServer();
console.log(`Leadline is at ${webOrigin()}`);
console.log('The agent asks once whether to start. The person does not run npm.');
if (!running.server) console.log('That port was already in use.');
