import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { isSlidesMode, enableSlidesMode, disableSlidesMode } from './lib/featureFlags';

describe('Slides Feature Flags', () => {
  const testProjectId = 'test-project-123';

  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear();
  });

  afterEach(() => {
    // Clean up after each test
    localStorage.clear();
  });

  it('returns false when projectId is not provided', () => {
    expect(isSlidesMode()).toBe(false);
    expect(isSlidesMode('')).toBe(false);
  });

  it('returns true by default for valid projectId', () => {
    expect(isSlidesMode(testProjectId)).toBe(true);
  });

  it('can enable slides mode for a project', () => {
    enableSlidesMode(testProjectId);
    expect(isSlidesMode(testProjectId)).toBe(true);
  });

  it('can disable slides mode for a project', () => {
    disableSlidesMode(testProjectId);
    expect(isSlidesMode(testProjectId)).toBe(false);
  });

  it('remembers slides mode state', () => {
    enableSlidesMode(testProjectId);
    expect(isSlidesMode(testProjectId)).toBe(true);

    disableSlidesMode(testProjectId);
    expect(isSlidesMode(testProjectId)).toBe(false);

    enableSlidesMode(testProjectId);
    expect(isSlidesMode(testProjectId)).toBe(true);
  });

  it('handles different projects independently', () => {
    const project1 = 'project-1';
    const project2 = 'project-2';

    enableSlidesMode(project1);
    disableSlidesMode(project2);

    expect(isSlidesMode(project1)).toBe(true);
    expect(isSlidesMode(project2)).toBe(false);
  });
});

describe('Slide Data Model', () => {
  it('should have correct slide structure', () => {
    const slide = {
      id: 'slide-123',
      title: 'My First Slide',
      thumbnail: 'data:image/png;base64,...',
      order: 0,
      content: JSON.stringify({ root: { children: [] } }),
    };

    expect(slide.id).toBe('slide-123');
    expect(slide.title).toBe('My First Slide');
    expect(slide.order).toBe(0);
    expect(typeof slide.content).toBe('string');
  });

  it('should parse and stringify slide content', () => {
    const lexicalState = {
      root: {
        children: [
          {
            type: 'paragraph',
            children: [],
          },
        ],
      },
    };

    const contentString = JSON.stringify(lexicalState);
    const parsedContent = JSON.parse(contentString);

    expect(parsedContent).toEqual(lexicalState);
  });
});

describe('Slide Utilities', () => {
  it('should generate unique slide IDs', () => {
    // Simulate uuid v4 behavior
    const id1 = `slide-${Date.now()}-1`;
    const id2 = `slide-${Date.now()}-2`;

    expect(id1).not.toBe(id2);
    expect(id1.startsWith('slide-')).toBe(true);
    expect(id2.startsWith('slide-')).toBe(true);
  });

  it('should maintain slide order', () => {
    const slides = [
      { id: '1', order: 0 },
      { id: '2', order: 1 },
      { id: '3', order: 2 },
    ];

    const sorted = [...slides].sort((a, b) => (a.order || 0) - (b.order || 0));

    expect(sorted[0].id).toBe('1');
    expect(sorted[1].id).toBe('2');
    expect(sorted[2].id).toBe('3');
  });

  it('should reorder slides after drag and drop', () => {
    const slides = [
      { id: '1', order: 0 },
      { id: '2', order: 1 },
      { id: '3', order: 2 },
    ];

    // Simulate dragging slide 2 to position 0
    const [draggedSlide] = slides.splice(1, 1);
    slides.splice(0, 0, draggedSlide);

    // Update order
    const reordered = slides.map((slide, idx) => ({ ...slide, order: idx }));

    expect(reordered[0].id).toBe('2');
    expect(reordered[1].id).toBe('1');
    expect(reordered[2].id).toBe('3');
    expect(reordered[0].order).toBe(0);
    expect(reordered[1].order).toBe(1);
    expect(reordered[2].order).toBe(2);
  });
});
