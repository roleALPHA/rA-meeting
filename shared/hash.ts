import { sha256 } from '@noble/hashes/sha2.js';

export function sha256Hex(text: string): string {
  return Array.from(sha256(new TextEncoder().encode(text)), n => n.toString(16).padStart(2, '0')).join('');
}
