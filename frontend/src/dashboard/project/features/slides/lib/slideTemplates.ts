/**
 * slideTemplates.ts - Predefined slide templates for quick creation
 */

export interface SlideTemplate {
  id: string;
  name: string;
  description: string;
  icon: string; // Lucide icon name
  category: 'basic' | 'content' | 'media' | 'comparison';
  /** Lexical JSON content */
  content: string;
  /** Default background color */
  backgroundColor?: string;
}

// Empty paragraph for Lexical
const emptyParagraph = {
  children: [],
  direction: null,
  format: "",
  indent: 0,
  type: "paragraph",
  version: 1,
};

// Helper to create Lexical root structure
function createLexicalContent(children: unknown[]): string {
  return JSON.stringify({
    root: {
      children,
      direction: null,
      format: "",
      indent: 0,
      type: "root",
      version: 1,
    },
  });
}

// Helper to create a heading paragraph (reserved for future use)
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function _createHeading(text: string, tag: 'h1' | 'h2' | 'h3' = 'h1') {
  return {
    children: [
      {
        detail: 0,
        format: 0,
        mode: "normal",
        style: "",
        text,
        type: "text",
        version: 1,
      },
    ],
    direction: "ltr",
    format: "center",
    indent: 0,
    type: "heading",
    tag,
    version: 1,
  };
}

// Helper to create a text paragraph
function createTextParagraph(text: string, format: string = "") {
  return {
    children: text ? [
      {
        detail: 0,
        format: 0,
        mode: "normal",
        style: "",
        text,
        type: "text",
        version: 1,
      },
    ] : [],
    direction: text ? "ltr" : null,
    format,
    indent: 0,
    type: "paragraph",
    version: 1,
  };
}

// Helper to create a text box node
function createTextBox(
  x: number,
  y: number,
  width: number,
  height: number,
  content: unknown[],
  options: {
    fontSize?: number;
    textAlign?: string;
    verticalAlign?: string;
    backgroundColor?: string;
  } = {}
) {
  return {
    type: "textbox",
    version: 1,
    x,
    y,
    width,
    height,
    rotation: 0,
    locked: false,
    backgroundColor: options.backgroundColor || "transparent",
    borderColor: "transparent",
    borderWidth: 0,
    borderRadius: 0,
    padding: 24,
    fontSize: options.fontSize || 48,
    fontFamily: "Inter",
    textAlign: options.textAlign || "left",
    verticalAlign: options.verticalAlign || "top",
    content: {
      root: {
        children: content,
        direction: null,
        format: "",
        indent: 0,
        type: "root",
        version: 1,
      },
    },
  };
}

// Predefined templates
export const SLIDE_TEMPLATES: SlideTemplate[] = [
  // === BASIC ===
  {
    id: 'blank',
    name: 'Blank',
    description: 'Empty slide to start from scratch',
    icon: 'Square',
    category: 'basic',
    backgroundColor: '#101112',
    content: createLexicalContent([emptyParagraph]),
  },
  {
    id: 'title',
    name: 'Title Slide',
    description: 'Large centered title with optional subtitle',
    icon: 'Type',
    category: 'basic',
    backgroundColor: '#101112',
    content: createLexicalContent([
      createTextBox(160, 400, 1600, 200, [
        createTextParagraph('Presentation Title', 'center'),
      ], { fontSize: 72, textAlign: 'center', verticalAlign: 'center' }),
      createTextBox(360, 620, 1200, 80, [
        createTextParagraph('Your subtitle or tagline here', 'center'),
      ], { fontSize: 28, textAlign: 'center', verticalAlign: 'center' }),
    ]),
  },
  {
    id: 'section',
    name: 'Section Header',
    description: 'Section divider with large text',
    icon: 'Heading1',
    category: 'basic',
    backgroundColor: '#1a1a1e',
    content: createLexicalContent([
      createTextBox(160, 440, 1600, 200, [
        createTextParagraph('Section Title', 'center'),
      ], { fontSize: 64, textAlign: 'center', verticalAlign: 'center' }),
    ]),
  },

  // === CONTENT ===
  {
    id: 'title-content',
    name: 'Title + Content',
    description: 'Title at top with content area below',
    icon: 'LayoutList',
    category: 'content',
    backgroundColor: '#101112',
    content: createLexicalContent([
      createTextBox(120, 80, 1680, 120, [
        createTextParagraph('Slide Title', 'left'),
      ], { fontSize: 48, textAlign: 'left', verticalAlign: 'center' }),
      createTextBox(120, 240, 1680, 720, [
        createTextParagraph('• Add your content here', 'left'),
        createTextParagraph('• Use bullet points for key ideas', 'left'),
        createTextParagraph('• Keep text concise and readable', 'left'),
      ], { fontSize: 32, textAlign: 'left', verticalAlign: 'top' }),
    ]),
  },
  {
    id: 'two-columns',
    name: 'Two Columns',
    description: 'Title with two content columns',
    icon: 'Columns2',
    category: 'content',
    backgroundColor: '#101112',
    content: createLexicalContent([
      createTextBox(120, 80, 1680, 120, [
        createTextParagraph('Comparison Title', 'left'),
      ], { fontSize: 48, textAlign: 'left', verticalAlign: 'center' }),
      createTextBox(120, 240, 800, 720, [
        createTextParagraph('Left Column', 'left'),
        emptyParagraph,
        createTextParagraph('• Point one', 'left'),
        createTextParagraph('• Point two', 'left'),
        createTextParagraph('• Point three', 'left'),
      ], { fontSize: 28, textAlign: 'left', verticalAlign: 'top' }),
      createTextBox(1000, 240, 800, 720, [
        createTextParagraph('Right Column', 'left'),
        emptyParagraph,
        createTextParagraph('• Point one', 'left'),
        createTextParagraph('• Point two', 'left'),
        createTextParagraph('• Point three', 'left'),
      ], { fontSize: 28, textAlign: 'left', verticalAlign: 'top' }),
    ]),
  },
  {
    id: 'quote',
    name: 'Quote',
    description: 'Large quote with attribution',
    icon: 'Quote',
    category: 'content',
    backgroundColor: '#101112',
    content: createLexicalContent([
      createTextBox(200, 300, 1520, 300, [
        createTextParagraph('"Your inspiring quote goes here. Make it memorable and impactful."', 'center'),
      ], { fontSize: 40, textAlign: 'center', verticalAlign: 'center' }),
      createTextBox(200, 640, 1520, 60, [
        createTextParagraph('— Attribution Name', 'center'),
      ], { fontSize: 24, textAlign: 'center', verticalAlign: 'center' }),
    ]),
  },

  // === MEDIA ===
  {
    id: 'image-left',
    name: 'Image + Text',
    description: 'Image on left, content on right',
    icon: 'LayoutPanelLeft',
    category: 'media',
    backgroundColor: '#101112',
    content: createLexicalContent([
      createTextBox(40, 40, 880, 1000, [
        createTextParagraph('[Image placeholder]', 'center'),
      ], { fontSize: 24, textAlign: 'center', verticalAlign: 'center', backgroundColor: 'rgba(255,255,255,0.05)' }),
      createTextBox(960, 80, 880, 120, [
        createTextParagraph('Title Here', 'left'),
      ], { fontSize: 42, textAlign: 'left', verticalAlign: 'center' }),
      createTextBox(960, 220, 880, 740, [
        createTextParagraph('Add your description and key points here. This layout works great for showcasing a product, feature, or concept with supporting text.', 'left'),
      ], { fontSize: 26, textAlign: 'left', verticalAlign: 'top' }),
    ]),
  },
  {
    id: 'image-full',
    name: 'Full Image',
    description: 'Full-bleed background with text overlay',
    icon: 'Image',
    category: 'media',
    backgroundColor: '#0a0a0b',
    content: createLexicalContent([
      createTextBox(120, 800, 1680, 180, [
        createTextParagraph('Overlay Title', 'left'),
        createTextParagraph('Supporting text on dark background', 'left'),
      ], { fontSize: 48, textAlign: 'left', verticalAlign: 'bottom' }),
    ]),
  },

  // === COMPARISON ===
  {
    id: 'comparison',
    name: 'Before & After',
    description: 'Side-by-side comparison layout',
    icon: 'ArrowLeftRight',
    category: 'comparison',
    backgroundColor: '#101112',
    content: createLexicalContent([
      createTextBox(120, 80, 1680, 100, [
        createTextParagraph('Comparison', 'center'),
      ], { fontSize: 42, textAlign: 'center', verticalAlign: 'center' }),
      createTextBox(120, 200, 840, 100, [
        createTextParagraph('Before', 'center'),
      ], { fontSize: 32, textAlign: 'center', verticalAlign: 'center', backgroundColor: 'rgba(239,68,68,0.15)' }),
      createTextBox(960, 200, 840, 100, [
        createTextParagraph('After', 'center'),
      ], { fontSize: 32, textAlign: 'center', verticalAlign: 'center', backgroundColor: 'rgba(34,197,94,0.15)' }),
      createTextBox(120, 320, 840, 640, [
        createTextParagraph('Previous state or problem description', 'left'),
      ], { fontSize: 24, textAlign: 'left', verticalAlign: 'top' }),
      createTextBox(960, 320, 840, 640, [
        createTextParagraph('New state or solution description', 'left'),
      ], { fontSize: 24, textAlign: 'left', verticalAlign: 'top' }),
    ]),
  },
  {
    id: 'stats',
    name: 'Key Stats',
    description: 'Highlight 3 key statistics or metrics',
    icon: 'BarChart3',
    category: 'comparison',
    backgroundColor: '#101112',
    content: createLexicalContent([
      createTextBox(120, 80, 1680, 100, [
        createTextParagraph('Key Metrics', 'center'),
      ], { fontSize: 42, textAlign: 'center', verticalAlign: 'center' }),
      createTextBox(120, 300, 520, 500, [
        createTextParagraph('85%', 'center'),
        createTextParagraph('Metric Label One', 'center'),
      ], { fontSize: 72, textAlign: 'center', verticalAlign: 'center' }),
      createTextBox(700, 300, 520, 500, [
        createTextParagraph('2.5x', 'center'),
        createTextParagraph('Metric Label Two', 'center'),
      ], { fontSize: 72, textAlign: 'center', verticalAlign: 'center' }),
      createTextBox(1280, 300, 520, 500, [
        createTextParagraph('$1.2M', 'center'),
        createTextParagraph('Metric Label Three', 'center'),
      ], { fontSize: 72, textAlign: 'center', verticalAlign: 'center' }),
    ]),
  },
];

// Get templates by category
export function getTemplatesByCategory(category: SlideTemplate['category']): SlideTemplate[] {
  return SLIDE_TEMPLATES.filter(t => t.category === category);
}

// Get template by ID
export function getTemplateById(id: string): SlideTemplate | undefined {
  return SLIDE_TEMPLATES.find(t => t.id === id);
}

// Template categories for UI
export const TEMPLATE_CATEGORIES = [
  { id: 'basic', name: 'Basic', description: 'Simple starter layouts' },
  { id: 'content', name: 'Content', description: 'Text-focused layouts' },
  { id: 'media', name: 'Media', description: 'Image-centric layouts' },
  { id: 'comparison', name: 'Comparison', description: 'Side-by-side layouts' },
] as const;
