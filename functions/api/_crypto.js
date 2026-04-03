/**
 * AES-256-GCM encryption/decryption helper using Web Crypto API.
 * Used for PII field-level encryption in D1.
 */

const ALGO = 'AES-GCM';
const KEY_LENGTH = 256;
const IV_LENGTH = 12;

/**
 * Import the encryption key from the ENCRYPTION_KEY secret (base64).
 */
async function getKey(env) {
  const raw = Uint8Array.from(atob(env.ENCRYPTION_KEY), c => c.charCodeAt(0));
  return crypto.subtle.importKey('raw', raw, { name: ALGO, length: KEY_LENGTH }, false, ['encrypt', 'decrypt']);
}

/**
 * Encrypt a plaintext string. Returns base64(iv + ciphertext).
 */
async function encrypt(plaintext, env) {
  if (!plaintext) return null;
  const key = await getKey(env);
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const encoded = new TextEncoder().encode(plaintext);
  const ciphertext = await crypto.subtle.encrypt({ name: ALGO, iv }, key, encoded);

  // Combine IV + ciphertext
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.length);

  return btoa(String.fromCharCode(...combined));
}

/**
 * Decrypt a base64(iv + ciphertext) string. Returns plaintext.
 */
async function decrypt(encrypted, env) {
  if (!encrypted) return null;
  const key = await getKey(env);
  const combined = Uint8Array.from(atob(encrypted), c => c.charCodeAt(0));
  const iv = combined.slice(0, IV_LENGTH);
  const ciphertext = combined.slice(IV_LENGTH);

  const decrypted = await crypto.subtle.decrypt({ name: ALGO, iv }, key, ciphertext);
  return new TextDecoder().decode(decrypted);
}

/**
 * Encrypt file bytes for R2 storage. Returns ArrayBuffer.
 */
async function encryptFile(fileBytes, env) {
  const key = await getKey(env);
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const ciphertext = await crypto.subtle.encrypt({ name: ALGO, iv }, key, fileBytes);

  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.length);
  return combined.buffer;
}

/**
 * Decrypt file from R2 storage. Returns ArrayBuffer.
 */
async function decryptFile(encryptedBytes, env) {
  const key = await getKey(env);
  const data = new Uint8Array(encryptedBytes);
  const iv = data.slice(0, IV_LENGTH);
  const ciphertext = data.slice(IV_LENGTH);
  return crypto.subtle.decrypt({ name: ALGO, iv }, key, ciphertext);
}

/**
 * SHA-256 hash of bytes.
 */
async function hashBytes(bytes) {
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export { encrypt, decrypt, encryptFile, decryptFile, hashBytes };
