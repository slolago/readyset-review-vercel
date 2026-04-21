import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword, isBcryptHash } from '@/lib/review-links';

describe('review-links — password hashing (SEC-20)', () => {
  it('hashPassword produces a bcrypt-shaped string', () => {
    const h = hashPassword('hunter2');
    expect(isBcryptHash(h)).toBe(true);
    expect(h.startsWith('$2')).toBe(true);
  });

  it('hashPassword is non-deterministic (different salts)', () => {
    expect(hashPassword('hunter2')).not.toBe(hashPassword('hunter2'));
  });

  it('verifyPassword accepts bcrypt-hashed match', () => {
    const stored = hashPassword('hunter2');
    const { ok, needsUpgrade } = verifyPassword('hunter2', stored);
    expect(ok).toBe(true);
    expect(needsUpgrade).toBe(false);
  });

  it('verifyPassword rejects bcrypt-hashed mismatch', () => {
    const stored = hashPassword('hunter2');
    const { ok, needsUpgrade } = verifyPassword('wrong', stored);
    expect(ok).toBe(false);
    expect(needsUpgrade).toBe(false);
  });

  it('verifyPassword accepts legacy plaintext + flags upgrade', () => {
    const { ok, needsUpgrade } = verifyPassword('hunter2', 'hunter2');
    expect(ok).toBe(true);
    expect(needsUpgrade).toBe(true);
  });

  it('verifyPassword rejects legacy plaintext mismatch without upgrade flag', () => {
    const { ok, needsUpgrade } = verifyPassword('wrong', 'hunter2');
    expect(ok).toBe(false);
    expect(needsUpgrade).toBe(false);
  });

  it('verifyPassword returns false for empty stored', () => {
    expect(verifyPassword('x', '')).toEqual({ ok: false, needsUpgrade: false });
  });
});
