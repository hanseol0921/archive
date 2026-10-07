import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
const git = (...args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
const files = [...new Set(git('ls-files', '--cached', '--others', '--exclude-standard', '-z').split('\0').filter(Boolean))];
const patterns = [
  ['private key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ['Google API key', /AIza[\w-]{30,}/],
  ['GitHub token', /(?:gh[pousr]_[\w]{30,}|github_pat_[\w]{30,})/],
  ['AWS access key', /(?:AKIA|ASIA)[A-Z0-9]{16}/],
  ['Supabase secret key', /sb_secret_[\w-]{20,}/],
  ['service role JWT', /eyJ[\w-]+\.[\w-]+\.[\w-]+/],
];
const secrets = [];
for (const name of fs.readdirSync('.').filter((name) => name.startsWith('.env'))) {
  for (const line of fs.readFileSync(name, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([\w]+)\s*=\s*(.*?)\s*$/);
    if (!match || match[1].startsWith('VITE_') || !/(KEY|SECRET|TOKEN|PASSWORD)/i.test(match[1])) continue;
    const value = match[2].replace(/^['"]|['"]$/g, '');
    if (value.length >= 12) secrets.push([match[1], value]);
  }
}
function check(text, file, history = false) {
  const results = [];
  for (const [label, pattern] of patterns) {
    const match = text.match(pattern);
    if (!match) continue;
    if (label === 'service role JWT') {
      try { if (JSON.parse(Buffer.from(match[0].split('.')[1], 'base64url')).role !== 'service_role') continue; } catch { continue; }
    }
    results.push(label);
  }
  for (const [name, value] of secrets) if (text.includes(value)) results.push(`local secret: ${name}`);
  if (results.length) console.log(JSON.stringify({ file, history, findings: results }));
}
let scanned = 0;
for (const file of files) {
  if (!fs.existsSync(file) || !fs.statSync(file).isFile() || /\.(png|jpg|jpeg|gif|woff2?|zip|pdf)$/i.test(file)) continue;
  check(fs.readFileSync(file, 'utf8'), file); scanned++;
}
const historyFiles = git('rev-list', '--objects', '--all').trim().split('\n');
let historyScanned = 0;
for (const line of historyFiles) {
  const [hash, ...parts] = line.split(' '); const file = parts.join(' ');
  if (!file || /\.(png|jpg|jpeg|gif|woff2?|zip|pdf)$/i.test(file)) continue;
  try { if (git('cat-file', '-t', hash).trim() !== 'blob') continue; check(git('cat-file', '-p', hash), file, true); historyScanned++; } catch { /* deleted paths */ }
}
let buildFilesScanned = 0;
function scanBuild(directory) {
  if (!fs.existsSync(directory)) return;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) scanBuild(path);
    else if (/\.(js|css|html|map)$/.test(path)) { check(fs.readFileSync(path, 'utf8'), path); buildFilesScanned++; }
  }
}
scanBuild('dist');
console.log(JSON.stringify({ buildFilesScanned }));
console.log(JSON.stringify({ candidateTextFiles: scanned, historyBlobs: historyScanned, sensitiveLocalVariablesChecked: secrets.map(([name]) => name), ignoredEnvFiles: fs.readdirSync('.').filter((name) => name.startsWith('.env')).map((name) => ({ name, ignored: Boolean(git('check-ignore', name).trim()) })) }));
