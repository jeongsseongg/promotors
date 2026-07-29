/* .fig (fig-kiwi) 디코더 — 외부 의존성 없음
   구조: "fig-kiwi" + uint32 version + [uint32 len + deflate(schema)] + [uint32 len + deflate(data)] */
const fs = require('fs');
const zlib = require('zlib');
const path = require('path');

const BUILTIN = ['bool', 'byte', 'int', 'uint', 'float', 'string', 'int64', 'uint64'];
const KIND = ['ENUM', 'STRUCT', 'MESSAGE'];

class Reader {
  constructor(buf) { this.buf = buf; this.i = 0; this.f32 = new Float32Array(1); this.i32 = new Int32Array(this.f32.buffer); }
  get eof() { return this.i >= this.buf.length; }
  byte() { if (this.i >= this.buf.length) throw new Error('EOF'); return this.buf[this.i++]; }
  varUint() {
    let value = 0, shift = 0, b;
    do { b = this.byte(); value |= (b & 0x7f) * Math.pow(2, shift); shift += 7; } while (b & 0x80);
    return value >>> 0 === value ? value >>> 0 : value;
  }
  varInt() { const v = this.varUint(); return (v & 1) ? ~(v >>> 1) : (v >>> 1); }
  varUint64() {
    let value = 0n, shift = 0n, b;
    do { b = this.byte(); value |= BigInt(b & 0x7f) << shift; shift += 7n; } while (b & 0x80);
    return value;
  }
  varInt64() { const v = this.varUint64(); return (v & 1n) ? ~(v >> 1n) : (v >> 1n); }
  float() {
    const first = this.byte();
    if (first === 0) return 0;
    const bits = (first | (this.byte() << 8) | (this.byte() << 16) | (this.byte() << 24)) >>> 0;
    this.i32[0] = ((bits << 23) | (bits >>> 9)) | 0;
    return this.f32[0];
  }
  string() {
    const start = this.i;
    while (this.buf[this.i] !== 0) { if (this.i >= this.buf.length) throw new Error('EOF in string'); this.i++; }
    const s = this.buf.toString('utf8', start, this.i);
    this.i++;
    return s;
  }
  bool() { return !!this.byte(); }
}

function decodeSchema(buf) {
  const r = new Reader(buf);
  const count = r.varUint();
  const defs = [];
  for (let i = 0; i < count; i += 1) {
    const name = r.string();
    const kind = KIND[r.byte()];
    const fieldCount = r.varUint();
    const fields = [];
    for (let j = 0; j < fieldCount; j += 1) {
      fields.push({ name: r.string(), type: r.varInt(), isArray: !!(r.byte() & 1), value: r.varUint() });
    }
    defs.push({ name, kind, fields });
  }
  return defs;
}

function makeDecoder(defs) {
  const byIndex = defs;
  function readField(r, type, isArray) {
    if (isArray) {
      const n = r.varUint();
      const out = new Array(n);
      for (let i = 0; i < n; i += 1) out[i] = readValue(r, type);
      return out;
    }
    return readValue(r, type);
  }
  function readValue(r, type) {
    if (type < 0) {
      switch (BUILTIN[~type]) {
        case 'bool': return r.bool();
        case 'byte': return r.byte();
        case 'int': return r.varInt();
        case 'uint': return r.varUint();
        case 'float': return r.float();
        case 'string': return r.string();
        case 'int64': return Number(r.varInt64());
        case 'uint64': return Number(r.varUint64());
        default: throw new Error('unknown builtin ' + type);
      }
    }
    const def = byIndex[type];
    if (!def) throw new Error('unknown definition index ' + type);
    if (def.kind === 'ENUM') {
      const v = r.varUint();
      const hit = def.fields.find(f => f.value === v);
      return hit ? hit.name : v;
    }
    const out = {};
    if (def.kind === 'STRUCT') {
      for (const f of def.fields) out[f.name] = readField(r, f.type, f.isArray);
      return out;
    }
    /* MESSAGE */
    for (;;) {
      const id = r.varUint();
      if (id === 0) break;
      const f = def.fields.find(x => x.value === id);
      if (!f) throw new Error(`unknown field id ${id} in ${def.name}`);
      out[f.name] = readField(r, f.type, f.isArray);
    }
    return out;
  }
  return { readValue, byIndex };
}

function chunks(buf) {
  if (buf.toString('latin1', 0, 8) !== 'fig-kiwi') throw new Error('not a fig-kiwi file');
  const version = buf.readUInt32LE(8);
  const out = [];
  let off = 12;
  while (off + 4 <= buf.length) {
    const len = buf.readUInt32LE(off);
    off += 4;
    if (len === 0 || off + len > buf.length) break;
    out.push(buf.subarray(off, off + len));
    off += len;
  }
  return { version, out };
}

const inflate = b => {
  const opts = { finishFlush: zlib.constants.Z_SYNC_FLUSH, maxOutputLength: 512 * 1024 * 1024 };
  /* Figma 최신 파일은 데이터 청크를 zstd로 압축한다 */
  const isZstd = b.length > 4 && b.readUInt32LE(0) === 0xFD2FB528;
  const attempts = isZstd && zlib.zstdDecompressSync
    ? [() => zlib.zstdDecompressSync(b, { maxOutputLength: 1024 * 1024 * 1024 })]
    : [
    () => zlib.inflateRawSync(b, opts),
    () => zlib.inflateSync(b, opts),
    () => zlib.gunzipSync(b, opts)
  ];
  let last = null;
  for (const fn of attempts) {
    try {
      const out = fn();
      if (out && out.length) return out;
    } catch (e) { last = e; }
  }
  throw new Error('inflate failed: ' + (last && last.message));
};

/* ---------------- main ---------------- */
const file = process.argv[2];
const outDir = process.argv[3];
const raw = fs.readFileSync(file);
const { version, out: parts } = chunks(raw);
console.error(`version=${version} chunks=${parts.length} sizes=${parts.map(p => p.length).join(',')}`);

const schemaBuf = inflate(parts[0]);
const defs = decodeSchema(schemaBuf);
console.error(`definitions=${defs.length}`);

const dataBuf = inflate(parts[1]);
const dec = makeDecoder(defs);
const rootIndex = defs.findIndex(d => d.name === 'Message');
const root = dec.readValue(new Reader(dataBuf), rootIndex >= 0 ? rootIndex : defs.length - 1);

fs.writeFileSync(path.join(outDir, 'schema-defs.json'), JSON.stringify(defs.map(d => ({ name: d.name, kind: d.kind, fields: d.fields.length })), null, 1));
fs.writeFileSync(path.join(outDir, 'canvas.json'), JSON.stringify(root));
const nodes = root.nodeChanges || [];
console.log(JSON.stringify({
  rootKeys: Object.keys(root),
  nodeChanges: nodes.length,
  sampleNode: nodes[0] ? Object.keys(nodes[0]) : null
}, null, 2));
