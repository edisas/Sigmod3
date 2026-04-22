// ============================================================
// Security Utilities
// ============================================================
import DOMPurify from 'dompurify';

/**
 * Sanitize user input to prevent XSS attacks.
 */
export function sanitizeInput(input: string): string {
  return DOMPurify.sanitize(input.trim(), { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
}

/**
 * Validate email format using RFC 5322 simplified regex.
 */
export function isValidEmail(email: string): boolean {
  const pattern = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
  return pattern.test(email);
}

/**
 * Validate password strength.
 * Returns an object with isValid and a list of unmet requirements.
 */
export function validatePassword(password: string): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  if (password.length < 8) errors.push('Mínimo 8 caracteres');
  if (!/[A-Z]/.test(password)) errors.push('Al menos una mayúscula');
  if (!/[a-z]/.test(password)) errors.push('Al menos una minúscula');
  if (!/[0-9]/.test(password)) errors.push('Al menos un número');
  if (!/[^A-Za-z0-9]/.test(password)) errors.push('Al menos un carácter especial');
  return { isValid: errors.length === 0, errors };
}

/**
 * Generate a CSRF-safe nonce for form submissions.
 */
export function generateNonce(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Rate limiter for login attempts.
 */
export class RateLimiter {
  private attempts: Map<string, { count: number; lastAttempt: number }> = new Map();
  private maxAttempts: number;
  private windowMs: number;

  constructor(maxAttempts = 5, windowMs = 15 * 60 * 1000) {
    this.maxAttempts = maxAttempts;
    this.windowMs = windowMs;
  }

  isRateLimited(key: string): boolean {
    const record = this.attempts.get(key);
    if (!record) return false;
    if (Date.now() - record.lastAttempt > this.windowMs) {
      this.attempts.delete(key);
      return false;
    }
    return record.count >= this.maxAttempts;
  }

  recordAttempt(key: string): void {
    const record = this.attempts.get(key);
    if (!record || Date.now() - record.lastAttempt > this.windowMs) {
      this.attempts.set(key, { count: 1, lastAttempt: Date.now() });
    } else {
      record.count += 1;
      record.lastAttempt = Date.now();
    }
  }

  getRemainingTime(key: string): number {
    const record = this.attempts.get(key);
    if (!record) return 0;
    const elapsed = Date.now() - record.lastAttempt;
    return Math.max(0, this.windowMs - elapsed);
  }
}

export const loginRateLimiter = new RateLimiter(5, 15 * 60 * 1000);
