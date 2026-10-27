// src/kernel/ports.js — the web origin other modules put in tool results.
//
// Owns: the bound port after the server listens.
// Must not: open a socket. src/web/server.js does that.

let port = Number(process.env.LEADLINE_PORT || 7791);

/** @returns {number} Port passed to listen. 0 means the OS picks one. */
export function preferredPort() {
  const n = Number(process.env.LEADLINE_PORT ?? 7791);
  return Number.isFinite(n) && n >= 0 ? n : 7791;
}

/** @param {number} value */
export function setBoundPort(value) {
  port = value;
}

/** @returns {string} Origin of the local control plane. */
export function webOrigin() {
  return `http://127.0.0.1:${port}`;
}
