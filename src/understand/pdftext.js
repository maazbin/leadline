// src/understand/pdftext.js — pull selectable text out of a PDF the person uploaded.
//
// Owns: a local read of text operators. No network and no OCR.
// Must not: render pages, fill a form, or guess words that are not in the file.
// A scan with no text operators returns no_text.

import zlib from 'node:zlib';

const MAX_BYTES = 8_000_000;
const MAX_TEXT = 12_000;

/**
 * @param {Buffer} bytes
 * @returns {{ ok: true, text: string } | { ok: false, code: string }}
 */
export function extractPdfText(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 8 || bytes.subarray(0, 5).toString('latin1') !== '%PDF-') {
    return { ok: false, code: 'bad_pdf' };
  }
  if (bytes.length > MAX_BYTES) return { ok: false, code: 'too_large' };
  const raw = bytes.toString('latin1');
  const pieces = [];
  const re = /stream\r?\n([\s\S]*?)endstream/g;
  for (const match of raw.matchAll(re)) {
    const dictStart = raw.lastIndexOf('<<', match.index);
    const dict = dictStart >= 0 ? raw.slice(dictStart, match.index) : '';
    if (/\/Image\b|\/Subtype\s*\/Image/i.test(dict)) continue;
    let data = Buffer.from(match[1], 'latin1');
    if (data.length && data[data.length - 1] === 0x0a) data = data.subarray(0, data.length - 1);
    if (data.length && data[data.length - 1] === 0x0d) data = data.subarray(0, data.length - 1);
    if (/FlateDecode/.test(dict)) {
      try {
        data = zlib.inflateSync(data);
      } catch {
        continue;
      }
    }
    const body = data.toString('latin1');
    if (!/Tj|TJ/.test(body)) continue;
    pieces.push(stringsFrom(body));
  }
  const text = pieces.join('\n').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').replace(/[ \t]{2,}/g, ' ').trim();
  if (text.length < 12) return { ok: false, code: 'no_text' };
  return { ok: true, text: text.slice(0, MAX_TEXT) };
}

/**
 * @param {string} body
 * @returns {string}
 */
function stringsFrom(body) {
  const parts = [];
  const re = /\((?:\\.|[^\\)])*\)/g;
  for (const match of body.matchAll(re)) {
    const text = decodeLiteral(match[0].slice(1, -1));
    if (text.trim()) parts.push(text);
  }
  return joinParts(parts);
}

/**
 * @param {string[]} parts
 * @returns {string}
 */
function joinParts(parts) {
  let out = '';
  for (const part of parts) {
    if (!out) {
      out = part;
      continue;
    }
    const prev = out[out.length - 1];
    const glue = part.length === 1 && /[A-Za-z0-9]/.test(part) && /[A-Za-z0-9]/.test(prev);
    out += glue ? part : `${prev === ' ' || part.startsWith(' ') ? '' : ' '}${part}`;
  }
  return out;
}

/**
 * @param {string} raw
 * @returns {string}
 */
function decodeLiteral(raw) {
  const codes = [];
  for (let i = 0; i < raw.length; i += 1) {
    if (raw[i] !== '\\' || i + 1 >= raw.length) {
      codes.push(raw.charCodeAt(i) & 0xff);
      continue;
    }
    const next = raw[i + 1];
    if (next >= '0' && next <= '7') {
      let oct = next;
      let j = i + 2;
      while (j < raw.length && j < i + 4 && raw[j] >= '0' && raw[j] <= '7') {
        oct += raw[j];
        j += 1;
      }
      codes.push(parseInt(oct, 8) & 0xff);
      i = j - 1;
      continue;
    }
    const named = { n: 10, r: 13, t: 9, b: 8, f: 12, '(': 40, ')': 41, '\\': 92 };
    codes.push(named[next] ?? (next.charCodeAt(0) & 0xff));
    i += 1;
  }
  if (codes.length >= 2 && codes[0] === 0xfe && codes[1] === 0xff) {
    let text = '';
    for (let i = 2; i + 1 < codes.length; i += 2) {
      const code = (codes[i] << 8) | codes[i + 1];
      if (code) text += String.fromCharCode(code);
    }
    return text;
  }
  return Buffer.from(codes).toString('utf8');
}
