import { describe, expect, it } from 'vitest';
import { SUPPORTER_MARK, supporterAuthor } from '../../../src/app/supporter';

describe('supporter author mark', () => {
  it('adds the leaf once, only for supporters with a name, within 24 characters', () => {
    expect(supporterAuthor('Dani', true)).toBe(`Dani ${SUPPORTER_MARK}`);
    expect(supporterAuthor(`Dani ${SUPPORTER_MARK}`, true)).toBe(`Dani ${SUPPORTER_MARK}`);
    expect(supporterAuthor('Dani', false)).toBe('Dani');
    expect(supporterAuthor('  ', true)).toBe('  ');
    expect(supporterAuthor('x'.repeat(24), true).length).toBe(24);
  });
});
