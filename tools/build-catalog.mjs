// Writes catalog.json from plugins/: each plugin's manifest, where its files are at this commit, and each file's
// SHA-256 and size. Otterm checks every file against it before using a plugin.
//
//   node tools/build-catalog.mjs --commit <sha>   write catalog.json for that commit (the workflow, on main)
//   node tools/build-catalog.mjs --check          check every plugin, and that a changed one has a higher version
//
// Each otterm-plugin.json is checked against types/otterm-plugin.schema.json (the schema Otterm's plugin kit has too)
// and the rules below, which match how Otterm reads a manifest.

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO = 'https://raw.githubusercontent.com/cognikas/otterm-plugins';
const ID = /^[a-z0-9][a-z0-9-]{0,39}$/;
const FILE = /^(?!.*\.\.)(?!\.)(?!.*\/\.)[\w./-]+\.(m?js|css|json|png|svg|woff2?|md)$/;
const PERMISSIONS = ['type', 'screen', 'chat'];
const MAX_FILE = 2 * 1024 * 1024;
const MAX_PLUGIN = 10 * 1024 * 1024;

const args = process.argv.slice(2);
const commit = args.includes('--commit') ? args[args.indexOf('--commit') + 1] : null;
const checking = args.includes('--check');
if (!checking && !/^[0-9a-f]{40}$/.test(commit ?? '')) throw new Error('--commit <40-character sha>, or --check');

const problems = [];
const schema = JSON.parse(fs.readFileSync(path.join(root, 'types', 'otterm-plugin.schema.json'), 'utf8'));
const fitsSchema = new Ajv2020({ allErrors: true, strict: false }).compile(schema);
const semver = (v) => (/^\d+\.\d+\.\d+$/.test(v) ? v.split('.').map(Number) : null);
const newer = (a, b) => {
  const [x, y] = [semver(a), semver(b)];
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i];
  return false;
};

function files(dir, base = '') {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const rel = base ? `${base}/${d.name}` : d.name;
    if (d.name.startsWith('.') || d.name === 'node_modules') return [];
    return d.isDirectory() ? files(path.join(dir, d.name), rel) : [rel];
  });
}

const plugins = [];
const dir = path.join(root, 'plugins');
for (const id of fs.existsSync(dir) ? fs.readdirSync(dir).sort() : []) {
  const at = path.join(dir, id);
  if (!fs.statSync(at).isDirectory()) continue;
  const bad = (why) => problems.push(`${id}: ${why}`);
  let m;
  try {
    m = JSON.parse(fs.readFileSync(path.join(at, 'otterm-plugin.json'), 'utf8'));
  } catch {
    bad('otterm-plugin.json is missing or not JSON');
    continue;
  }
  if (!fitsSchema(m)) for (const e of fitsSchema.errors ?? []) bad(`otterm-plugin.json${e.instancePath || ''} ${e.message}${e.params?.additionalProperty ? `: ${e.params.additionalProperty}` : ''}`);
  if (!ID.test(id) || m.id !== id) bad('its id must be its folder’s name: lower-case letters, digits and dashes');
  if (typeof m.name !== 'string' || !m.name.trim() || m.name.length > 60) bad('it needs a name of up to 60 characters');
  if (!semver(m.version)) bad('its version must look like 1.0.0');
  if (!Number.isInteger(m.api) || m.api < 1) bad('it needs the plugin API it was written for (api: 1)');
  if (typeof m.main !== 'string' || !/\.m?js$/.test(m.main) || !fs.existsSync(path.join(at, m.main))) bad('main must be a .js file in its folder');
  for (const p of m.permissions ?? []) if (!PERMISSIONS.includes(p)) bad(`unknown permission ${p}`);
  const list = files(at);
  let total = 0;
  const entries = [];
  for (const f of list) {
    if (!FILE.test(f)) {
      bad(`${f}: only .js, .mjs, .css, .json, .md and images, with plain names`);
      continue;
    }
    const body = fs.readFileSync(path.join(at, ...f.split('/')));
    if (body.length > MAX_FILE) bad(`${f} is over 2 MB`);
    total += body.length;
    entries.push({ path: f, sha256: createHash('sha256').update(body).digest('hex'), size: body.length });
  }
  if (total > MAX_PLUGIN) bad('the plugin is over 10 MB');
  const manifest = { ...m };
  delete manifest.$schema;
  plugins.push({ ...manifest, base: `${REPO}/${commit ?? '0'.repeat(40)}/plugins/${id}/`, files: entries });
}

if (checking) {
  // A plugin whose files changed against main needs a higher version than main's catalog says.
  let before = { plugins: [] };
  try {
    before = JSON.parse(execFileSync('git', ['show', 'origin/main:catalog.json'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));
  } catch {
    // No catalog.json on main yet: every plugin is new.
  }
  for (const p of plugins) {
    const was = before.plugins.find((x) => x.id === p.id);
    if (!was) continue;
    const same = JSON.stringify(was.files.map((f) => [f.path, f.sha256])) === JSON.stringify(p.files.map((f) => [f.path, f.sha256]));
    if (!same && !newer(p.version, was.version)) problems.push(`${p.id}: its files changed, so its version must go up from ${was.version}`);
  }
}

if (problems.length) {
  console.error(problems.map((p) => `✗ ${p}`).join('\n'));
  process.exit(1);
}
if (!checking) {
  fs.writeFileSync(path.join(root, 'catalog.json'), `${JSON.stringify({ version: 1, commit, plugins }, null, 2)}\n`);
}
console.log(`${plugins.length} plugin${plugins.length === 1 ? '' : 's'}${checking ? ' checked' : ` in catalog.json for ${commit.slice(0, 7)}`}`);
