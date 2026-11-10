import { describe, expect, it } from 'vitest';
import { timeAgo } from './time';

const now = new Date('2026-11-10T12:00:00Z');
const ago = (ms: number) => new Date(now.getTime() - ms);

describe('timeAgo', () => {
  it.each([
    [10_000, 'hace un momento'],
    [5 * 60_000, 'hace 5 min'],
    [5 * 3_600_000, 'hace 5 h'],
    [30 * 3_600_000, 'ayer'],
    [4 * 86_400_000, 'hace 4 días'],
    [-60_000, 'hace un momento'],
  ])('%i ms → %s', (ms, expected) => expect(timeAgo(ago(ms), now)).toBe(expected));
});
