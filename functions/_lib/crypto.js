import { HttpError } from './http.js';

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });

function bytesToBase64(bytes) {
  let binary = '';
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }
  return btoa(binary);
}

function base64ToBytes(value) {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export function base64urlEncode(value) {
  const bytes = value instanceof Uint8Array ? value : encoder.encode(String(value));
  return bytesToBase64(bytes).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/g, '');
}

export function base64urlDecode(value) {
  const normalized = String(value || '').replaceAll('-', '+').replaceAll('_', '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  return base64ToBytes(padded);
}

export function randomToken(size = 32) {
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  return base64urlEncode(bytes);
}

export async function sha256(value) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(String(value ?? '')));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function hmacKey(secret, usage) {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(String(secret || '')),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    [usage],
  );
}

export async function signValue(value, secret) {
  if (!secret) throw new HttpError(503, 'SNIPERPLUG_SESSION_SECRET is not configured.');
  const signature = await crypto.subtle.sign('HMAC', await hmacKey(secret, 'sign'), encoder.encode(String(value)));
  return base64urlEncode(new Uint8Array(signature));
}

export async function verifyValue(value, signature, secret) {
  if (!secret || !signature) return false;
  try {
    return crypto.subtle.verify(
      'HMAC',
      await hmacKey(secret, 'verify'),
      base64urlDecode(signature),
      encoder.encode(String(value)),
    );
  } catch {
    return false;
  }
}

async function aesKey(secret) {
  if (!secret) throw new HttpError(503, 'WHOP_TOKEN_SECRET is not configured.');
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(String(secret)));
  return crypto.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

export async function sealJson(value, secret) {
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    await aesKey(secret),
    encoder.encode(JSON.stringify(value)),
  );
  return `${base64urlEncode(iv)}.${base64urlEncode(new Uint8Array(encrypted))}`;
}

export async function openJson(value, secret) {
  try {
    const [ivPart, encryptedPart] = String(value || '').split('.', 2);
    if (!ivPart || !encryptedPart) return null;
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: base64urlDecode(ivPart) },
      await aesKey(secret),
      base64urlDecode(encryptedPart),
    );
    return JSON.parse(decoder.decode(decrypted));
  } catch {
    return null;
  }
}

export async function constantTimeTextEqual(left, right) {
  const leftDigest = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(String(left ?? ''))));
  const rightDigest = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(String(right ?? ''))));
  if (typeof crypto.subtle.timingSafeEqual === 'function') {
    return crypto.subtle.timingSafeEqual(leftDigest, rightDigest);
  }
  let difference = 0;
  for (let index = 0; index < leftDigest.length; index += 1) difference |= leftDigest[index] ^ rightDigest[index];
  return difference === 0;
}
