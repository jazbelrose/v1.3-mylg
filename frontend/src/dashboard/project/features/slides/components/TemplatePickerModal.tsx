/**
 * TemplatePickerModal.tsx - Modal for selecting slide templates
 */
import React, { useState, useCallback } from 'react';
import {
  X,
  Square,
  Type,
  Heading1,
  LayoutList,
  Columns2,
  Quote,
  LayoutPanelLeft,
  Image,
  ArrowLeftRight,
  BarChart3,
} from 'lucide-react';
import {
  SLIDE_TEMPLATES,
  TEMPLATE_CATEGORIES,
  SlideTemplate,
} from '../lib/slideTemplates';
import './TemplatePickerModal.css';

// Icon mapping
const ICON_MAP: Record<string, React.ComponentType<{ size?: number }>> = {
  Square,
  Type,
  Heading1,
  LayoutList,
  Columns2,
  Quote,
  LayoutPanelLeft,
  Image,
  ArrowLeftRight,
  BarChart3,
};

interface TemplatePickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectTemplate: (template: SlideTemplate) => void;
}

export function TemplatePickerModal({
  isOpen,
  onClose,
  onSelectTemplate,
}: TemplatePickerModalProps) {
  const [selectedCategory, setSelectedCategory] = useState<string>('basic');
  const [hoveredTemplate, setHoveredTemplate] = useState<string | null>(null);

  const handleTemplateClick = useCallback(
    (template: SlideTemplate) => {
      onSelectTemplate(template);
      onClose();
    },
    [onSelectTemplate, onClose]
  );

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) {
        onClose();
      }
    },
    [onClose]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    },
    [onClose]
  );

  if (!isOpen) return null;

  const filteredTemplates = SLIDE_TEMPLATES.filter(
    (t) => t.category === selectedCategory
  );

  return (
    <div
      className="template-picker-backdrop"
      onClick={handleBackdropClick}
      onKeyDown={handleKeyDown}
      role="dialog"
      aria-modal="true"
      aria-labelledby="template-picker-title"
    >
      <div className="template-picker-modal">
        {/* Header */}
        <div className="template-picker-header">
          <h2 id="template-picker-title">Choose a Template</h2>
          <button
            className="template-picker-close"
            onClick={onClose}
            aria-label="Close template picker"
          >
            <X size={20} />
          </button>
        </div>

        {/* Category tabs */}
        <div className="template-picker-categories">
          {TEMPLATE_CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              className={`template-category-tab ${
                selectedCategory === cat.id ? 'active' : ''
              }`}
              onClick={() => setSelectedCategory(cat.id)}
            >
              <span className="category-name">{cat.name}</span>
              <span className="category-desc">{cat.description}</span>
            </button>
          ))}
        </div>

        {/* Template grid */}
        <div className="template-picker-grid">
          {filteredTemplates.map((template) => {
            const IconComponent = ICON_MAP[template.icon] || Square;
            const isHovered = hoveredTemplate === template.id;

            return (
              <button
                key={template.id}
                className={`template-card ${isHovered ? 'hovered' : ''}`}
                onClick={() => handleTemplateClick(template)}
                onMouseEnter={() => setHoveredTemplate(template.id)}
                onMouseLeave={() => setHoveredTemplate(null)}
                style={{
                  '--template-bg': template.backgroundColor || '#101112',
                } as React.CSSProperties}
              >
                <div className="template-preview">
                  <IconComponent size={32} />
                </div>
                <div className="template-info">
                  <span className="template-name">{template.name}</span>
                  <span className="template-desc">{template.description}</span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Footer hint */}
        <div className="template-picker-footer">
          <span>Click a template to add a new slide</span>
        </div>
      </div>
    </div>
  );
}

export default TemplatePickerModal;
