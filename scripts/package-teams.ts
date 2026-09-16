import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { deflateSync } from 'node:zlib';
if (existsSync('.env')) process.loadEnvFile('.env');
const required = ['APP_ID', 'ENTRA_CLIENT_ID', 'PUBLIC_URL', 'CUSTOMER_NAME', 'PRIVACY_URL', 'TERMS_URL'] as const;
for (const key of required) if (!process.env[key]) throw new Error(`${key} fehlt. Das Paket benötigt kundenspezifische Werte.`);
const base = new URL(process.env.PUBLIC_URL!);
if (base.protocol !== 'https:' || base.pathname !== '/' || base.search || base.hash) throw new Error('PUBLIC_URL muss ein HTTPS-Origin sein.');
const vars = { ...process.env, DOMAIN: base.hostname, PUBLIC_URL: base.origin };
const template = readFileSync('teams/manifest.template.json', 'utf8');
const manifest = template.replace(/\{\{(\w+)\}\}/g, (_match, key: keyof typeof vars) => JSON.stringify(vars[key] ?? '').slice(1, -1));
JSON.parse(manifest);
mkdirSync('teams/package', { recursive: true });
writeFileSync('teams/package/manifest.json', manifest);
// Simple branded typographic mark, generated locally without fonts or external assets.
function crc32(bytes: Buffer) { let crc = 0xffffffff; for (const byte of bytes) { crc ^= byte; for (let k = 0; k < 8; k++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1)); } return (crc ^ 0xffffffff) >>> 0; }
function chunk(type: string, data: Buffer) { const name = Buffer.from(type); const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([name, data]))); return Buffer.concat([len, name, data, crc]); }
function icon(size: number, outline: boolean) {
  const pixels = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const X = x / size, Y = y / size;
    const mark = (X > .23 && X < .34 && Y > .27 && Y < .73) || (X > .34 && X < .61 && Y > .27 && Y < .38) || (X > .50 && X < .61 && Y > .38 && Y < .57) || (X > .34 && X < .61 && Y > .49 && Y < .60) || (X > .60 && X < .72 && Y > .57 && Y < .73);
    const c = outline ? (mark ? [255, 255, 255, 255] : [0, 0, 0, 0]) : (mark ? [218, 250, 117, 255] : [23, 63, 53, 255]);
    pixels.set(c, y * (size * 4 + 1) + 1 + x * 4);
  }
  const header = Buffer.alloc(13); header.writeUInt32BE(size, 0); header.writeUInt32BE(size, 4); header[8] = 8; header[9] = 6;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', header), chunk('IDAT', deflateSync(pixels)), chunk('IEND', Buffer.alloc(0))]);
}
writeFileSync('teams/package/color.png', icon(192, false)); writeFileSync('teams/package/outline.png', icon(32, true));
execFileSync('zip', ['-j', resolve('teams/package/rolealpha-meetings.zip'), 'teams/package/manifest.json', 'teams/package/color.png', 'teams/package/outline.png']);
console.log('Teams-Paket: teams/package/rolealpha-meetings.zip');
