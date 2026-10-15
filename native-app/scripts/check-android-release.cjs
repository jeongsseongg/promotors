#!/usr/bin/env node
// Read-only: never accepts a keystore, password, private key, or signing operation.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const {inflateRawSync} = require('node:zlib');
const {spawnSync} = require('node:child_process');
const PACKAGE = 'kr.promotors.app';
function requireCheck(value, code) {if (!value) throw new Error(code);}
const crcTable = Array.from({length: 256}, (_, value) => {
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ value >>> 1 : value >>> 1;
  return value >>> 0;
});
function crc32(bytes) {let value = 0xffffffff; for (const byte of bytes) value = crcTable[(value ^ byte) & 255] ^ value >>> 8; return (value ^ 0xffffffff) >>> 0;}
function readZip(file) {
  const bytes = fs.readFileSync(file);
  requireCheck(bytes.length < 512 * 1024 * 1024, 'AAB_TOO_LARGE');
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (bytes.readUInt32LE(i) === 0x06054b50 && i + 22 + bytes.readUInt16LE(i + 20) === bytes.length) {end = i; break;}
  }
  requireCheck(end >= 0 && bytes.readUInt16LE(end + 4) === 0 && bytes.readUInt16LE(end + 6) === 0, 'INVALID_ZIP');
  const count = bytes.readUInt16LE(end + 10), entries = new Map();
  let offset = bytes.readUInt32LE(end + 16);
  requireCheck(count > 0 && count < 50000 && offset < end, 'UNSUPPORTED_ZIP');
  for (let index = 0; index < count; index++) {
    requireCheck(offset + 46 <= end && bytes.readUInt32LE(offset) === 0x02014b50, 'INVALID_ZIP_DIRECTORY');
    const nameLength = bytes.readUInt16LE(offset + 28);
    const name = bytes.subarray(offset + 46, offset + 46 + nameLength).toString('utf8');
    const entry = {offset: bytes.readUInt32LE(offset + 42), size: bytes.readUInt32LE(offset + 24),
      compressed: bytes.readUInt32LE(offset + 20), crc: bytes.readUInt32LE(offset + 16), method: bytes.readUInt16LE(offset + 10)};
    requireCheck(!entries.has(name) && !(bytes.readUInt16LE(offset + 8) & 1), 'DUPLICATE_OR_ENCRYPTED_ZIP_ENTRY');
    entries.set(name, entry);
    offset += 46 + nameLength + bytes.readUInt16LE(offset + 30) + bytes.readUInt16LE(offset + 32);
  }
  function read(name) {
    const item = entries.get(name);
    requireCheck(item && item.size <= 128 * 1024 * 1024, 'MISSING_OR_OVERSIZED_ENTRY');
    const position = item.offset;
    requireCheck(position + 30 <= bytes.length && bytes.readUInt32LE(position) === 0x04034b50, 'INVALID_ZIP_ENTRY');
    const start = position + 30 + bytes.readUInt16LE(position + 26) + bytes.readUInt16LE(position + 28);
    requireCheck(start + item.compressed <= bytes.length && [0, 8].includes(item.method), 'INVALID_ZIP_COMPRESSION');
    const content = bytes.subarray(start, start + item.compressed);
    const value = item.method === 0 ? content : inflateRawSync(content, {maxOutputLength: item.size + 1});
    requireCheck(value.length === item.size, 'INVALID_ZIP_ENTRY_SIZE');
    requireCheck(crc32(value) === item.crc, 'INVALID_ZIP_CRC');
    return value;
  }
  return {names: [...entries.keys()], read};
}
function command(executable, args) {
  const result = spawnSync(executable, args, {encoding: 'utf8', shell: false, timeout: 120000, maxBuffer: 24 * 1024 * 1024});
  requireCheck(!result.error, 'VERIFICATION_TOOL_UNAVAILABLE');
  return {status: result.status, output: `${result.stdout || ''}\n${result.stderr || ''}`};
}
function xmlValue(value) {
  return value.replace(/&(?:amp|lt|gt|quot|apos);|&#(?:x[0-9a-f]+|[0-9]+);/gi, item => {
    const known = {'&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'"};
    if (known[item]) return known[item];
    return String.fromCodePoint(item[2].toLowerCase() === 'x' ? parseInt(item.slice(3, -1), 16) : parseInt(item.slice(2, -1), 10));
  });
}
function parseManifest(xml) {
  requireCheck(!/<!DOCTYPE|<!ENTITY/i.test(xml), 'UNSUPPORTED_MANIFEST_XML');
  const roots = [], stack = [];
  for (const match of xml.matchAll(/<\/?([\w:.-]+)\b([^>]*?)>/g)) {
    if (match[0].startsWith('</')) {requireCheck(stack.pop()?.tag === match[1], 'INVALID_MANIFEST_XML'); continue;}
    const node = {tag: match[1], attrs: {}, children: []};
    for (const attr of match[2].matchAll(/([\w:.-]+)\s*=\s*"([^"]*)"/g)) node.attrs[attr[1]] = xmlValue(attr[2]);
    if (stack.length) stack.at(-1).children.push(node); else roots.push(node);
    if (!match[2].trimEnd().endsWith('/')) stack.push(node);
  }
  requireCheck(!stack.length && roots.length === 1 && roots[0].tag === 'manifest', 'INVALID_MANIFEST_XML');
  return roots[0];
}
function checkManifest(xml, release) {
  const root = parseManifest(xml);
  const namespace = Object.entries(root.attrs).find(([key, value]) => key.startsWith('xmlns:') && value === 'http://schemas.android.com/apk/res/android');
  requireCheck(namespace, 'ANDROID_NAMESPACE_MISSING');
  const prefix = namespace[0].slice(6) + ':';
  requireCheck(root.attrs.package === PACKAGE, 'PACKAGE_MISMATCH');
  requireCheck(root.attrs[prefix + 'versionName'] === release.version && Number(root.attrs[prefix + 'versionCode']) === release.androidCode, 'RELEASE_VERSION_MISMATCH');
  const app = root.children.find(node => node.tag === 'application');
  requireCheck(app && app.attrs[prefix + 'debuggable'] !== 'true', 'DEBUGGABLE_RELEASE');
  const fullName = name => name?.startsWith('.') ? PACKAGE + name : name?.includes('.') ? name : PACKAGE + '.' + name;
  requireCheck(fullName(app.attrs[prefix + 'name']) === PACKAGE + '.MainApplication', 'NATIVE_APPLICATION_MISSING');
  const activities = app.children.filter(node => ['activity', 'activity-alias'].includes(node.tag));
  const launchers = activities.filter(node => node.children.some(filter => filter.tag === 'intent-filter' &&
    filter.children.some(item => item.tag === 'action' && item.attrs[prefix + 'name'] === 'android.intent.action.MAIN') &&
    filter.children.some(item => item.tag === 'category' && item.attrs[prefix + 'name'] === 'android.intent.category.LAUNCHER')));
  requireCheck(launchers.length === 1 && launchers[0].tag === 'activity' && fullName(launchers[0].attrs[prefix + 'name']) === PACKAGE + '.MainActivity', 'NATIVE_LAUNCHER_MISSING');
  requireCheck(!/androidbrowserhelper|trusted\.LauncherActivity|com\.getcapacitor|com\.google\.androidbrowserhelper/i.test(xml), 'WEB_WRAPPER_MANIFEST_FOUND');
  return {package: PACKAGE, version: release.version, versionCode: release.androidCode, launcher: PACKAGE + '.MainActivity'};
}
function dexClasses(bytes) {
  requireCheck(bytes.length >= 112 && /^dex\n\d{3}\0/.test(bytes.subarray(0, 8).toString('ascii')), 'INVALID_DEX');
  const strings = [], types = [];
  const readTable = (countAt, offsetAt, size, visit) => {
    const count = bytes.readUInt32LE(countAt), offset = bytes.readUInt32LE(offsetAt);
    requireCheck(count < 2000000 && offset + count * size <= bytes.length, 'INVALID_DEX_TABLE');
    for (let index = 0; index < count; index++) visit(offset + index * size);
  };
  readTable(56, 60, 4, offset => {
    let position = bytes.readUInt32LE(offset), length = 0;
    requireCheck(position < bytes.length, 'INVALID_DEX_STRING');
    while (bytes[position++] & 0x80) requireCheck(++length < 5 && position < bytes.length, 'INVALID_DEX_STRING');
    const end = bytes.indexOf(0, position);
    requireCheck(end >= position, 'INVALID_DEX_STRING');
    strings.push(bytes.subarray(position, end).toString('utf8'));
  });
  readTable(64, 68, 4, offset => {const value = strings[bytes.readUInt32LE(offset)]; requireCheck(value !== undefined, 'INVALID_DEX_TYPE'); types.push(value);});
  const classes = [];
  readTable(96, 100, 32, offset => {
    const name = types[bytes.readUInt32LE(offset)], superclass = bytes.readUInt32LE(offset + 8);
    requireCheck(name && (superclass === 0xffffffff || types[superclass]), 'INVALID_DEX_CLASS');
    classes.push({name, superclass: superclass === 0xffffffff ? null : types[superclass]});
  });
  return classes;
}
function checkNative(zip) {
  const files = zip.names.filter(name => /^base\/dex\/classes(?:\d+)?\.dex$/.test(name));
  requireCheck(files.length, 'NATIVE_DEX_MISSING');
  const classes = files.flatMap(name => dexClasses(zip.read(name)));
  const activity = classes.find(item => item.name === 'Lkr/promotors/app/MainActivity;');
  requireCheck(activity?.superclass === 'Lcom/facebook/react/ReactActivity;', 'NATIVE_REACT_ACTIVITY_MISSING');
  requireCheck(classes.some(item => item.name === 'Lkr/promotors/app/PromotorsPushModule;'), 'NATIVE_PUSH_MODULE_MISSING');
  requireCheck(!classes.some(item => /^L(?:com\/google\/androidbrowserhelper\/trusted\/|com\/getcapacitor\/|com\/reactnativecommunity\/webview\/)/.test(item.name)), 'WEB_WRAPPER_DEX_FOUND');
  return {dexFiles: files.length, nativeActivitySuperclass: 'com.facebook.react.ReactActivity', webWrapperClasses: 0};
}
function checkSources(file, zip) {
  if (!file) return {sourceMapChecked: false};
  const sources = [];
  function visit(map) {
    requireCheck(map && map.version === 3, 'INVALID_SOURCE_MAP');
    if (Array.isArray(map.sources)) sources.push(...map.sources);
    if (Array.isArray(map.sections)) map.sections.forEach(section => visit(section.map));
  }
  visit(JSON.parse(fs.readFileSync(file, 'utf8')));
  requireCheck(sources.length > 0 && sources.every(source => typeof source === 'string'), 'EMPTY_SOURCE_MAP');
  requireCheck(!sources.some(source => /(?:^|\/)src\/qa(?:\/|$)|(?:^|\/)index\.qa\.js(?:$|[?#])/.test(source.replaceAll('\\', '/'))), 'QA_SOURCE_IN_RELEASE');
  const bundle = zip.read('base/assets/index.android.bundle');
  requireCheck(!bundle.includes(Buffer.from('PROMOTORS_NATIVE_QA_READY')), 'QA_MARKER_IN_RELEASE');
  return {sourceMapChecked: true, sourceCount: sources.length, qaSources: 0};
}
function checkSignature(aab, zip, java, mode, expectedFingerprint) {
  const blocks = zip.names.filter(name => /^META-INF\/[^/]+\.(RSA|DSA|EC)$/i.test(name));
  const manifests = zip.names.filter(name => /^META-INF\/[^/]+\.SF$/i.test(name));
  if (mode === 'unsigned') {requireCheck(!blocks.length && !manifests.length, 'EXPECTED_UNSIGNED_AAB'); return {signed: false};}
  const expected = expectedFingerprint?.replaceAll(':', '').toUpperCase();
  requireCheck(/^[A-F0-9]{64}$/.test(expected || ''), 'EXPECTED_PUBLIC_CERTIFICATE_REQUIRED');
  requireCheck(blocks.length === 1 && manifests.length === 1 && blocks[0].replace(/\.(RSA|DSA|EC)$/i, '').toUpperCase() === manifests[0].replace(/\.SF$/i, '').toUpperCase(), 'AMBIGUOUS_OR_MISSING_AAB_SIGNER');
  const bin = path.dirname(java), suffix = process.platform === 'win32' ? '.exe' : '';
  const privateStoreDisabled = '-J-Duser.home=' + path.join(os.tmpdir(), 'promotors-verification-no-store-' + crypto.randomUUID());
  const locale = ['-J-Duser.language=en', '-J-Duser.country=US', privateStoreDisabled];
  const verified = command(path.join(bin, 'jarsigner' + suffix), [...locale, '-verify', '-strict', aab]);
  requireCheck([0, 4].includes(verified.status) && /jar verified/.test(verified.output), 'AAB_SIGNATURE_INVALID');
  requireCheck(!/disabled|security risk|weak|has expired|not yet valid/i.test(verified.output), 'AAB_SIGNATURE_ALGORITHM_OR_VALIDITY');
  const certificate = command(path.join(bin, 'keytool' + suffix), [...locale, '-printcert', '-jarfile', aab, '-rfc']);
  const pem = certificate.output.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/);
  requireCheck(certificate.status === 0 && pem, 'SIGNER_PUBLIC_CERTIFICATE_MISSING');
  const cert = new crypto.X509Certificate(pem[0]);
  requireCheck(Date.parse(cert.validFrom) <= Date.now() && Date.parse(cert.validTo) > Date.now(), 'SIGNER_CERTIFICATE_EXPIRED');
  requireCheck(cert.fingerprint256.replaceAll(':', '').toUpperCase() === expected, 'SIGNER_CERTIFICATE_MISMATCH');
  return {signed: true, signatureVerified: true, certificateSha256: cert.fingerprint256};
}
async function checkRelease(options) {
  requireCheck(['signed', 'unsigned'].includes(options.signature), 'SIGNATURE_MODE_REQUIRED');
  for (const key of ['aab', 'java', 'bundletool']) requireCheck(options[key] && fs.statSync(options[key]).isFile(), 'REQUIRED_FILE_MISSING');
  const release = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../release.json'), 'utf8'));
  requireCheck(typeof release.version === 'string' && Number.isInteger(release.androidCode) && release.androidCode > 0, 'INVALID_RELEASE_SOURCE');
  const aab = path.resolve(options.aab), zip = readZip(aab);
  const validated = command(options.java, ['-jar', options.bundletool, 'validate', '--bundle=' + aab]);
  requireCheck(validated.status === 0, 'INVALID_ANDROID_APP_BUNDLE');
  const manifest = command(options.java, ['-jar', options.bundletool, 'dump', 'manifest', '--bundle=' + aab, '--module=base']);
  requireCheck(manifest.status === 0, 'AAB_MANIFEST_UNREADABLE');
  return {passed: true, ...checkManifest(manifest.output.trim(), release), ...checkNative(zip),
    ...checkSignature(aab, zip, options.java, options.signature, options['certificate-sha256']),
    ...checkSources(options['source-map'], zip), aabSha256: crypto.createHash('sha256').update(fs.readFileSync(aab)).digest('hex')};
}
module.exports = {readZip, parseManifest, checkManifest, dexClasses, checkNative, checkSources, checkSignature, checkRelease};
if (require.main === module) {
  const allowed = new Set(['aab', 'java', 'bundletool', 'signature', 'certificate-sha256', 'source-map']);
  const options = {};
  try {
    for (let index = 2; index < process.argv.length; index += 2) {
      const key = process.argv[index].slice(2), value = process.argv[index + 1];
      requireCheck(process.argv[index].startsWith('--') && allowed.has(key) && value && !options[key], 'INVALID_ARGUMENT');
      options[key] = value;
    }
    checkRelease(options).then(result => console.log(JSON.stringify(result))).catch(error => {
      console.error(JSON.stringify({passed: false, code: /^[A-Z_]+$/.test(error.message) ? error.message : 'VERIFICATION_FAILED'})); process.exitCode = 1;
    });
  } catch (error) {console.error(JSON.stringify({passed: false, code: /^[A-Z_]+$/.test(error.message) ? error.message : 'VERIFICATION_FAILED'})); process.exitCode = 1;}
}
