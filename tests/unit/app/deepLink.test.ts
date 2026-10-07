import { describe, expect, it } from 'vitest';
import { codeFromUrl, linkForCode } from '../../../src/app/deepLink';

const CODE = 'PL1-AbCdEf_123-xyz';

describe('deep links', () => {
  it('reads codes from web, app-link and custom-scheme URLs', () => {
    expect(codeFromUrl(`https://pathlings.example/l#${CODE}`)).toBe(CODE);
    expect(codeFromUrl(`https://pathlings.example/l/#${CODE}`)).toBe(CODE);
    expect(codeFromUrl(`http://localhost:5191/#${CODE}`)).toBe(CODE);
    expect(codeFromUrl(`pathlings://l/${CODE}`)).toBe(CODE);
    expect(codeFromUrl(`https://x.example/l#${encodeURIComponent(' PL1-AbCd EfGh ')}`)).toBe(
      'PL1-AbCdEfGh',
    );
  });

  it('ignores everything else', () => {
    for (const url of [
      'https://pathlings.example/l',
      'https://pathlings.example/other#PL1-AbCdEfGh',
      'https://pathlings.example/l#hello',
      'pathlings://settings',
      'mailto:a@b.c',
      'not a url',
    ]) {
      expect(codeFromUrl(url), url).toBeNull();
    }
  });

  it('builds share links that round-trip', () => {
    const link = linkForCode(CODE, 'https://pathlings.example/');
    expect(link).toBe(`https://pathlings.example/l#${CODE}`);
    expect(codeFromUrl(link)).toBe(CODE);
  });
});
