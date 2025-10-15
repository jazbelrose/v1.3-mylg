import { describe, expect, it } from 'vitest';
import { getFileNameFromUrl } from './fileUtils';

describe('getFileNameFromUrl', () => {
  it('returns the filename for a valid URL', () => {
    const url = 'https://example.com/path/to/file.txt';
    expect(getFileNameFromUrl(url)).toBe('file.txt');
  });

  it('returns an empty string for an empty URL', () => {
    expect(getFileNameFromUrl('')).toBe('');
  });

  it('returns an empty string for an undefined URL', () => {
    expect(getFileNameFromUrl(undefined)).toBe('');
  });
});









