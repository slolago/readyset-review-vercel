import { describe, it, expect } from 'vitest';
import { coerceToDate, formatDate } from '@/lib/format-date';

const FIXED_ISO = '2026-04-20T15:42:00.000Z';
const FIXED_EPOCH_S = Math.floor(new Date(FIXED_ISO).getTime() / 1000);
const FIXED_EPOCH_MS = new Date(FIXED_ISO).getTime();

describe('coerceToDate', () => {
  it('returns null for null/undefined', () => {
    expect(coerceToDate(null)).toBeNull();
    expect(coerceToDate(undefined)).toBeNull();
  });

  it('passes through a valid Date', () => {
    const d = new Date(FIXED_ISO);
    expect(coerceToDate(d)?.toISOString()).toBe(FIXED_ISO);
  });

  it('returns null for invalid Date instance', () => {
    expect(coerceToDate(new Date('not a date'))).toBeNull();
  });

  it('handles Firestore client Timestamp (toDate())', () => {
    const ts = { toDate: () => new Date(FIXED_ISO) };
    expect(coerceToDate(ts)?.toISOString()).toBe(FIXED_ISO);
  });

  it('handles admin-serialized {_seconds,_nanoseconds}', () => {
    expect(
      coerceToDate({ _seconds: FIXED_EPOCH_S, _nanoseconds: 0 })?.toISOString()
    ).toBe(FIXED_ISO);
  });

  it('handles raw {seconds,nanoseconds}', () => {
    expect(
      coerceToDate({ seconds: FIXED_EPOCH_S, nanoseconds: 0 })?.toISOString()
    ).toBe(FIXED_ISO);
  });

  it('handles ISO string', () => {
    expect(coerceToDate(FIXED_ISO)?.toISOString()).toBe(FIXED_ISO);
  });

  it('handles epoch ms number', () => {
    expect(coerceToDate(FIXED_EPOCH_MS)?.toISOString()).toBe(FIXED_ISO);
  });

  it('returns null for garbage inputs', () => {
    expect(coerceToDate('not a date')).toBeNull();
    expect(coerceToDate({})).toBeNull();
    expect(coerceToDate([])).toBeNull();
    expect(coerceToDate(true)).toBeNull();
  });

  it('returns null when toDate throws', () => {
    const bad = { toDate: () => { throw new Error('boom'); } };
    expect(coerceToDate(bad)).toBeNull();
  });
});

describe('formatDate', () => {
  it('returns em-dash for null/undefined', () => {
    expect(formatDate(null)).toBe('—');
    expect(formatDate(undefined)).toBe('—');
  });

  it('returns em-dash for invalid input', () => {
    expect(formatDate('not a date')).toBe('—');
    expect(formatDate({})).toBe('—');
  });

  it('produces human-readable string for every shape', () => {
    const shapes: unknown[] = [
      new Date(FIXED_ISO),
      { toDate: () => new Date(FIXED_ISO) },
      { _seconds: FIXED_EPOCH_S, _nanoseconds: 0 },
      { seconds: FIXED_EPOCH_S, nanoseconds: 0 },
      FIXED_ISO,
      FIXED_EPOCH_MS,
    ];
    for (const s of shapes) {
      const out = formatDate(s);
      expect(out).not.toBe('—');
      expect(out).not.toBe('Invalid Date');
      expect(out).toMatch(/Apr/);
      expect(out).toMatch(/2026/);
    }
  });
});
