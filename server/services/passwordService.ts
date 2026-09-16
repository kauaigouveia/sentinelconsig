import argon2 from 'argon2';
import crypto from 'crypto';

/**
 * Modern Argon2id Password Service for Sentinel Consig.
 * Conforms to RFC 9106 / OWASP guidelines for cryptographic password storage.
 */

// Dummy Argon2id hash used to equalize execution time during failed logins for nonexistent accounts
const DUMMY_ARGON2_HASH =
  '$argon2id$v=19$m=65536,t=3,p=4$c29tZXJhbmRvbXNhbHQ$WJ2W4hZ+U3c61q8cOeV9E7+n0aC3iI5W7rYkK5L6N8A';

export interface PasswordVerificationResult {
  valid: boolean;
  needsRehash: boolean;
}

/**
 * Hashes a plaintext password using Argon2id with OWASP-recommended parameters.
 */
export async function hashPassword(password: string): Promise<string> {
  if (!password || typeof password !== 'string' || password.trim().length === 0) {
    throw new Error('Senha não pode ser vazia.');
  }

  return argon2.hash(password.trim(), {
    type: argon2.argon2id,
    memoryCost: 65536, // 64 MB
    timeCost: 3,       // 3 iterations
    parallelism: 4,    // 4 parallel threads
  });
}

/**
 * Checks whether a given string is already an Argon2 hash.
 */
export function isArgon2Hash(hash: string): boolean {
  if (!hash || typeof hash !== 'string') return false;
  return hash.startsWith('$argon2id$') || hash.startsWith('$argon2i$') || hash.startsWith('$argon2d$');
}

/**
 * Verifies a plaintext password against a stored hash or legacy plaintext string.
 *
 * CRITICAL SECURITY INVARIANTS:
 * 1. NEVER uses includes(), substring, or partial matches.
 * 2. Compares legacy credentials strictly in constant time using crypto.timingSafeEqual.
 * 3. Flags needsRehash: true for legacy credentials so they can be seamlessly migrated to Argon2id upon successful login.
 */
export async function verifyPassword(
  passwordAttempt: string,
  storedHashOrPlain: string
): Promise<PasswordVerificationResult> {
  if (!passwordAttempt || !storedHashOrPlain) {
    return { valid: false, needsRehash: false };
  }

  const cleanAttempt = passwordAttempt.trim();
  const cleanStored = storedHashOrPlain.trim();

  if (isArgon2Hash(cleanStored)) {
    try {
      const isValid = await argon2.verify(cleanStored, cleanAttempt);
      if (!isValid) {
        return { valid: false, needsRehash: false };
      }
      const needsRehash = argon2.needsRehash(cleanStored, {
        memoryCost: 65536,
        timeCost: 3,
        parallelism: 4,
      });
      return { valid: true, needsRehash };
    } catch {
      return { valid: false, needsRehash: false };
    }
  }

  // Legacy credential comparison: strictly constant-time, whole-string equality
  // Hash both with SHA-256 first so buffers have identical length (32 bytes)
  const hashAttempt = crypto.createHash('sha256').update(cleanAttempt, 'utf8').digest();
  const hashStored = crypto.createHash('sha256').update(cleanStored, 'utf8').digest();

  const isLegacyMatch = crypto.timingSafeEqual(hashAttempt, hashStored);
  if (isLegacyMatch) {
    return { valid: true, needsRehash: true };
  }

  return { valid: false, needsRehash: false };
}

/**
 * Dummy verification executed when a user account does not exist.
 * Prevents account enumeration via response time analysis.
 */
export async function dummyVerify(passwordAttempt: string): Promise<void> {
  try {
    await argon2.verify(DUMMY_ARGON2_HASH, passwordAttempt || 'dummy');
  } catch {
    // Expected to fail, time consumed intentionally
  }
}
