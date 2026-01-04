import { describe, expect, it } from 'vitest';
import { getFileNameFromUrl, generateUniqueLexicalImageKey } from './fileUtils';

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

describe('generateUniqueLexicalImageKey', () => {
  it('generates a key with correct path structure', () => {
    const fileName = 'test-image.jpg';
    const projectId = 'project123';
    const key = generateUniqueLexicalImageKey(fileName, projectId);
    
    expect(key).toMatch(/^projects\/project123\/lexical\/\d+_[a-z0-9]{6}_test-image\.jpg$/);
  });

  it('sanitizes filenames with special characters', () => {
    const fileName = 'test image (1) [copy].jpg';
    const projectId = 'project123';
    const key = generateUniqueLexicalImageKey(fileName, projectId);
    
    // Should replace non-alphanumeric characters (except .-_) with hyphens
    expect(key).toMatch(/^projects\/project123\/lexical\/\d+_[a-z0-9]{6}_test-image-1-copy-\.jpg$/);
  });

  it('generates unique keys for the same filename', () => {
    const fileName = 'test.jpg';
    const projectId = 'project123';
    const key1 = generateUniqueLexicalImageKey(fileName, projectId);
    const key2 = generateUniqueLexicalImageKey(fileName, projectId);
    
    // Keys should be different due to timestamp and random ID
    expect(key1).not.toBe(key2);
  });

  it('preserves file extension', () => {
    const fileName = 'image.png';
    const projectId = 'project123';
    const key = generateUniqueLexicalImageKey(fileName, projectId);
    
    expect(key).toContain('.png');
    expect(key).toMatch(/\.png$/);
  });
});









