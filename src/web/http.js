// src/web/http.js — request helpers for the local control plane.
//
// Owns: status codes, redirects, and form parsing.
// Must not: decide outreach. Pages call team modules for that.

/**
 * @param {import('node:http').ServerResponse} res
 * @param {string} body
 * @param {number} [status]
 */
export function html(res, body, status = 200) {
  res.writeHead(status, {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store',
  });
  res.end(body);
}

/**
 * @param {import('node:http').ServerResponse} res
 * @param {unknown} obj
 * @param {number} [status]
 */
export function json(res, obj, status = 200) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  res.end(JSON.stringify(obj));
}

/**
 * @param {import('node:http').ServerResponse} res
 * @param {string} location
 */
export function redirect(res, location) {
  res.writeHead(303, { location, 'cache-control': 'no-store' });
  res.end();
}

/**
 * @param {import('node:http').IncomingMessage} req
 * @returns {Promise<string>}
 */
async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 1_000_000) {
      const err = new Error('too_large');
      err.code = 'too_large';
      throw err;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

/**
 * Parse a form or a JSON body. Repeated keys become an array.
 * @param {import('node:http').IncomingMessage} req
 */
export async function readForm(req) {
  const body = await readBody(req);
  const type = String(req.headers['content-type'] || '');
  if (type.includes('application/json')) {
    if (!body.trim()) return {};
    return JSON.parse(body);
  }
  const params = new URLSearchParams(body);
  /** @type {Record<string, string | string[]>} */
  const out = {};
  for (const key of new Set(params.keys())) {
    const values = params.getAll(key);
    out[key] = values.length > 1 ? values : values[0];
  }
  return out;
}

/**
 * Multipart body for a PDF upload. Caps the size and does not throw.
 * @param {import('node:http').IncomingMessage} req
 * @param {number} [maxBytes]
 */
export async function readMultipart(req, maxBytes = 8_000_000) {
  const type = String(req.headers['content-type'] || '');
  const match = /boundary=(?:"([^"]+)"|([^;\s]+))/i.exec(type);
  const boundary = match?.[1] || match?.[2];
  if (!boundary) return { ok: false, code: 'bad_upload' };
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) {
      req.destroy();
      return { ok: false, code: 'too_large' };
    }
    chunks.push(chunk);
  }
  return parseMultipart(Buffer.concat(chunks), boundary);
}

/**
 * @param {Buffer} buf
 * @param {string} boundary
 */
function parseMultipart(buf, boundary) {
  const delim = Buffer.from(`--${boundary}`);
  /** @type {Record<string, string>} */
  const fields = {};
  /** @type {Record<string, { filename: string, data: Buffer }>} */
  const files = {};
  let start = buf.indexOf(delim);
  if (start < 0) return { ok: false, code: 'bad_upload' };
  start += delim.length;
  while (start < buf.length) {
    if (buf[start] === 45 && buf[start + 1] === 45) break;
    if (buf[start] === 13 && buf[start + 1] === 10) start += 2;
    else if (buf[start] === 10) start += 1;
    const next = buf.indexOf(delim, start);
    if (next < 0) break;
    let part = buf.subarray(start, next);
    if (part.length >= 2 && part[part.length - 2] === 13 && part[part.length - 1] === 10) {
      part = part.subarray(0, part.length - 2);
    }
    const sep = part.indexOf('\r\n\r\n');
    const splitAt = sep >= 0 ? sep : part.indexOf('\n\n');
    const gap = sep >= 0 ? 4 : 2;
    if (splitAt < 0) {
      start = next + delim.length;
      continue;
    }
    const header = part.subarray(0, splitAt).toString('utf8');
    const body = part.subarray(splitAt + gap);
    const name = /name="([^"]+)"/.exec(header)?.[1];
    const filename = /filename="([^"]*)"/.exec(header)?.[1];
    if (name && filename) files[name] = { filename, data: body };
    else if (name) fields[name] = body.toString('utf8');
    start = next + delim.length;
  }
  return { ok: true, fields, files };
}

/**
 * @param {string | string[] | undefined} value
 * @returns {string[]}
 */
export function many(value) {
  if (Array.isArray(value)) return value.map(String);
  if (value == null || value === '') return [];
  return [String(value)];
}
