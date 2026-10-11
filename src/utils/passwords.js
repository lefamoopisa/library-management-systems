const ITERATIONS = 120_000;
const encoder = new TextEncoder();

function toBase64(bytes) {
  return btoa(String.fromCharCode(...bytes));
}

function fromBase64(value) {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}

async function derivePasswordHash(password, salt) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: ITERATIONS, hash: "SHA-256" },
    key,
    256,
  );
  return new Uint8Array(bits);
}

export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derivePasswordHash(password, salt);
  return { passwordSalt: toBase64(salt), passwordHash: toBase64(hash) };
}

export async function verifyPassword(password, passwordSalt, expectedHash) {
  if (!passwordSalt || !expectedHash) return false;
  const actualHash = await derivePasswordHash(password, fromBase64(passwordSalt));
  const storedHash = fromBase64(expectedHash);
  if (actualHash.length !== storedHash.length) return false;
  let difference = 0;
  for (let index = 0; index < actualHash.length; index += 1) {
    difference |= actualHash[index] ^ storedHash[index];
  }
  return difference === 0;
}
