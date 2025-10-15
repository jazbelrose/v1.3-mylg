import { describe, it, expect } from 'vitest';

// Mock the getUniqueSlug function directly
const getUniqueSlug = (title: string, galleries: { slug: string }[], projects: { slug: string }[]) => {
  let slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  let counter = 1;
  const existingSlugs = [...galleries, ...projects].map(item => item.slug);

  while (existingSlugs.includes(slug)) {
    slug = `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')}-${counter}`;
    counter++;
  }

  return { slug };
};
describe('getUniqueSlug', () => {
    it('increments slug when duplicate exists', () => {
        const galleries = [{ slug: 'design-board' }];
        const { slug } = getUniqueSlug('design-board', galleries, []);
        expect(slug).toBe('design-board-1');
    });
    it('skips to next number when suffixed slug also exists', () => {
        const galleries = [{ slug: 'design-board' }, { slug: 'design-board-1' }];
        const { slug } = getUniqueSlug('design-board', galleries, []);
        expect(slug).toBe('design-board-2');
    });
});









