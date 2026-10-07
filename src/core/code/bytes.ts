/**
 * Byte-level helpers for the level code (§3.3): a growable writer and a bounds-checked reader
 * with unsigned LEB128 varints and zigzag-signed varints, plus strict base64url.
 */

/** Thrown when the bytes run out or a value is malformed. */
export class TruncatedError extends Error {
  constructor(message = 'unexpected end of data') {
    super(message);
    this.name = 'TruncatedError';
  }
}

export class ByteWriter {
  private buf = new Uint8Array(256);
  private len = 0;

  private ensure(n: number): void {
    if (this.len + n <= this.buf.length) return;
    let size = this.buf.length * 2;
    while (size < this.len + n) size *= 2;
    const next = new Uint8Array(size);
    next.set(this.buf.subarray(0, this.len));
    this.buf = next;
  }

  u8(v: number): void {
    this.ensure(1);
    this.buf[this.len++] = v & 0xff;
  }

  u32(v: number): void {
    this.ensure(4);
    for (let i = 0; i < 4; i++) this.buf[this.len++] = (v >>> (8 * i)) & 0xff;
  }

  /** Unsigned varint (0 … 2^35 is plenty; inputs here are small integers). */
  uv(v: number): void {
    if (!Number.isInteger(v) || v < 0)
      throw new RangeError(`uv: ${v} is not a non-negative integer`);
    let x = v;
    while (x >= 0x80) {
      this.u8((x % 0x80) | 0x80);
      x = Math.floor(x / 0x80);
    }
    this.u8(x);
  }

  /** Signed varint (zigzag). */
  sv(v: number): void {
    if (!Number.isInteger(v)) throw new RangeError(`sv: ${v} is not an integer`);
    this.uv(v >= 0 ? v * 2 : -v * 2 - 1);
  }

  bytes(b: Uint8Array): void {
    this.ensure(b.length);
    this.buf.set(b, this.len);
    this.len += b.length;
  }

  /** UTF-8 string with a varint byte-length prefix. */
  str(s: string): void {
    const b = utf8Encode(s);
    this.uv(b.length);
    this.bytes(b);
  }

  finish(): Uint8Array {
    return this.buf.slice(0, this.len);
  }
}

export class ByteReader {
  private pos = 0;
  constructor(private readonly buf: Uint8Array) {}

  get offset(): number {
    return this.pos;
  }

  get remaining(): number {
    return this.buf.length - this.pos;
  }

  u8(): number {
    if (this.pos >= this.buf.length) throw new TruncatedError();
    return this.buf[this.pos++] as number;
  }

  u32(): number {
    let v = 0;
    for (let i = 0; i < 4; i++) v += this.u8() * 2 ** (8 * i);
    return v >>> 0;
  }

  uv(): number {
    let result = 0;
    let mul = 1;
    for (let i = 0; i < 6; i++) {
      const b = this.u8();
      result += (b & 0x7f) * mul;
      if ((b & 0x80) === 0) {
        // Canonical encodings only: no superfluous zero continuation bytes.
        if (i > 0 && b === 0) throw new TruncatedError('non-canonical varint');
        return result;
      }
      mul *= 0x80;
    }
    throw new TruncatedError('varint too long');
  }

  sv(): number {
    const z = this.uv();
    return z % 2 === 0 ? z / 2 : -(z + 1) / 2;
  }

  bytes(n: number): Uint8Array {
    if (n < 0 || this.pos + n > this.buf.length) throw new TruncatedError();
    const out = this.buf.slice(this.pos, this.pos + n);
    this.pos += n;
    return out;
  }

  str(maxBytes: number): string {
    const n = this.uv();
    if (n > maxBytes) throw new TruncatedError('string too long');
    return utf8Decode(this.bytes(n));
  }
}

// --- UTF-8 (no TextEncoder: the core stays free of host APIs) --------------------------------

export function utf8Encode(s: string): Uint8Array {
  const out: number[] = [];
  for (const ch of s) {
    const c = ch.codePointAt(0) as number;
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else
      out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return Uint8Array.from(out);
}

export function utf8Decode(b: Uint8Array): string {
  let s = '';
  let i = 0;
  const cont = (): number => {
    const v = b[i++];
    if (v === undefined || (v & 0xc0) !== 0x80) throw new TruncatedError('invalid UTF-8');
    return v & 63;
  };
  while (i < b.length) {
    const c = b[i++] as number;
    let cp: number;
    if (c < 0x80) cp = c;
    else if ((c & 0xe0) === 0xc0) cp = ((c & 31) << 6) | cont();
    else if ((c & 0xf0) === 0xe0) cp = ((c & 15) << 12) | (cont() << 6) | cont();
    else if ((c & 0xf8) === 0xf0) cp = ((c & 7) << 18) | (cont() << 12) | (cont() << 6) | cont();
    else throw new TruncatedError('invalid UTF-8');
    s += String.fromCodePoint(cp);
  }
  return s;
}

// --- base64url (RFC 4648 §5, no padding) ------------------------------------------------------

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const LOOKUP = new Map([...ALPHABET].map((c, i) => [c, i]));

export function base64urlEncode(b: Uint8Array): string {
  let out = '';
  for (let i = 0; i < b.length; i += 3) {
    const n = ((b[i] as number) << 16) | ((b[i + 1] ?? 0) << 8) | (b[i + 2] ?? 0);
    const chars = i + 2 < b.length ? 4 : i + 1 < b.length ? 3 : 2;
    for (let k = 0; k < chars; k++) out += ALPHABET[(n >> (18 - 6 * k)) & 63];
  }
  return out;
}

/** Strict decoding: rejects foreign characters, impossible lengths and non-zero padding bits. */
export function base64urlDecode(s: string): Uint8Array {
  if (s.length % 4 === 1) throw new TruncatedError('invalid base64url length');
  const out: number[] = [];
  for (let i = 0; i < s.length; i += 4) {
    const chunk = s.slice(i, i + 4);
    let n = 0;
    for (let k = 0; k < 4; k++) {
      const ch = chunk[k];
      const v = ch === undefined ? 0 : LOOKUP.get(ch);
      if (v === undefined) throw new TruncatedError(`invalid base64url character '${ch}'`);
      n = (n << 6) | v;
    }
    const bytes = chunk.length - 1;
    const all = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    // Unused low bits of a short final chunk must be zero (one text ⇔ one byte string).
    if (bytes < 3 && all.slice(bytes).some((v) => v !== 0)) {
      throw new TruncatedError('non-canonical base64url');
    }
    out.push(...all.slice(0, bytes));
  }
  return Uint8Array.from(out);
}
