/* eslint-disable */
import React, { useState, useRef, useEffect, useMemo, ChangeEvent } from 'react';
import {
    Bold,
    Italic,
    Underline,
    Strikethrough,
    Code,
    Heading1,
    Heading2,
    Quote,
    List,
    ListOrdered,
    AlignLeft,
    AlignCenter,
    AlignRight,
    AlignJustify,
    Square,
    Circle,
    Pencil,
    Type,
    Image as ImageIcon,
    MousePointer,
    ClipboardCopy,
    ClipboardPaste,
    Trash2,
    Eraser,
    Eye,
    Save,
    Undo2,
    Redo2,
    Figma,
    Mic,
    FileText,
    Paintbrush,
    LayoutDashboard,
} from 'lucide-react';
import { LayoutOutlined as LayoutIcon } from '@ant-design/icons';
import { motion } from 'framer-motion';
import './UnifiedToolbar.css';
import ColorPicker from '@/shared/ui/ColorPicker';

type EditorMode = string;

type ModeDefinition = {
    key: EditorMode;
    label: string;
    icon: React.ComponentType<{ size?: number }>;
};

const DEFAULT_MODE_DEFINITIONS: ModeDefinition[] = [
    { key: 'brief', label: 'Brief', icon: FileText },
    { key: 'canvas', label: 'Canvas', icon: Paintbrush },
    { key: 'moodboard', label: 'Moodboard', icon: LayoutDashboard },
];

interface UnifiedToolbarProps {
    onBold?: () => void;
    onItalic?: () => void;
    onUnderline?: () => void;
    onStrikethrough?: () => void;
    onCode?: () => void;
    onParagraph?: () => void;
    onHeading1?: () => void;
    onHeading2?: () => void;
    onQuote?: () => void;
    onUnorderedList?: () => void;
    onOrderedList?: () => void;
    onFontChange?: (font: string) => void;
    onFontSizeChange?: (size: string) => void;
    onFontColorChange?: (value: string) => void;
    onBgColorChange?: (value: string) => void;
    onAlignLeft?: () => void;
    onAlignCenter?: () => void;
    onAlignRight?: () => void;
    onAlignJustify?: () => void;
    onAddRectangle?: () => void;
    onAddCircle?: () => void;
    onFreeDraw?: () => void;
    onSelectTool?: () => void;
    onAddText?: () => void;
    onAddImage?: () => void;
    onInsertLayout?: (template: string) => void;
    onColorChange?: (e: ChangeEvent<HTMLInputElement>) => void;
    onFigma?: () => void;
    onVoice?: () => void;
    onCopy?: () => void;
    onPaste?: () => void;
    onDelete?: () => void;
    onClearCanvas?: () => void;
    onPreview?: () => void;
    onSave?: () => void;
    onUndo?: () => void;
    onRedo?: () => void;
    initialMode?: EditorMode;
    onModeChange?: (mode: EditorMode) => void;
    theme?: 'dark' | 'light';
    orientation?: 'horizontal' | 'vertical';
    modes?: ModeDefinition[];
}

const UnifiedToolbar: React.FC<UnifiedToolbarProps> = ({ onBold, onItalic, onUnderline, onStrikethrough, onCode, onParagraph, onHeading1, onHeading2, onQuote, onUnorderedList, onOrderedList, onFontChange, onFontSizeChange, onFontColorChange, onBgColorChange, onAlignLeft, onAlignCenter, onAlignRight, onAlignJustify, onAddRectangle, onAddCircle, onFreeDraw, onSelectTool, onAddText, onAddImage, onInsertLayout, onColorChange, onFigma, onVoice, onCopy, onPaste, onDelete, onClearCanvas, onPreview, onSave, onUndo, onRedo, initialMode = 'brief', onModeChange, theme = 'dark', orientation = 'horizontal', modes }) => {
    const [mode, setMode] = useState<EditorMode>(initialMode);
    const [fontColor, setFontColor] = useState<string>('');
    const [bgColor, setBgColor] = useState<string>('');
    const [layoutOpen, setLayoutOpen] = useState(false);
    const layoutButtonRef = useRef<HTMLButtonElement | null>(null);

    useEffect(() => {
        setMode(initialMode);
    }, [initialMode]);
    
    const handleFontColorChange = (e: { target: { value: string } }) => {
        const value = e.target.value;
        setFontColor(value);
        if (onFontColorChange)
            onFontColorChange(value);
    };

    const handleBgColorChange = (e: { target: { value: string } }) => {
        const value = e.target.value;
        setBgColor(value);
        if (onBgColorChange)
            onBgColorChange(value);
    };

    const toggleLayoutDropdown = () => setLayoutOpen((prev) => !prev);
    const handleInsertLayout = (template: string) => {
        if (onInsertLayout)
            onInsertLayout(template);
        setLayoutOpen(false);
    };

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (layoutButtonRef.current && !layoutButtonRef.current.contains(event.target as Node)) {
                setLayoutOpen(false);
            }
        };
        if (layoutOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [layoutOpen]);
    
    const handleBlockChange = (value: string) => {
        switch (value) {
            case 'body':
                onParagraph && onParagraph();
                break;
            case 'heading':
                onHeading1 && onHeading1();
                break;
            case 'subheading':
                onHeading2 && onHeading2();
                break;
            case 'quote':
                onQuote && onQuote();
                break;
            case 'bulleted':
                onUnorderedList && onUnorderedList();
                break;
            case 'numbered':
                onOrderedList && onOrderedList();
                break;
            default:
                break;
        }
    };
    const handleModeChange = (newMode: EditorMode) => {
        setMode(newMode);
        if (onModeChange)
            onModeChange(newMode);
    };

    const modeDefinitions = useMemo<ModeDefinition[]>(() => {
        if (Array.isArray(modes)) {
            return modes;
        }
        return DEFAULT_MODE_DEFINITIONS;
    }, [modes]);
    
    const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
    const [indicator, setIndicator] = useState<{ left: number; width: number }>({ left: 0, width: 0 });
    useEffect(() => {
        const node = tabRefs.current[mode];
        if (node) {
            const nextLeft = node.offsetLeft;
            const nextWidth = node.offsetWidth;
            setIndicator((prev) => {
                if (prev.left === nextLeft && prev.width === nextWidth) {
                    return prev;
                }
                return { left: nextLeft, width: nextWidth };
            });
        } else if (modeDefinitions.length === 0) {
            setIndicator((prev) => {
                if (prev.left === 0 && prev.width === 0) {
                    return prev;
                }
                return { left: 0, width: 0 };
            });
        }
    }, [mode, modeDefinitions]);
    
    return (
        <div className={`unified-toolbar ${theme} ${orientation}`}>
            {modeDefinitions.length > 0 && (
                <div className="toolbar-group mode-switcher">
                    <div className="segmented-control motion" role="tablist" aria-label="Editor mode">
                        <motion.span
                            className="segmented-active"
                            initial={false}
                            animate={{ x: indicator.left, width: indicator.width }}
                            transition={{ type: 'tween', duration: 0.2 }}
                            style={{ opacity: indicator.width ? 1 : 0 }}
                        />
                        {modeDefinitions.map(({ key, label, icon: Icon }) => (
                            <button
                                key={key}
                                type="button"
                                role="tab"
                                ref={(el) => { tabRefs.current[key] = el; }}
                                onClick={() => handleModeChange(key)}
                                className={mode === key ? 'active' : ''}
                                aria-selected={mode === key}
                            >
                                <Icon size={16} />
                                <span>{label}</span>
                            </button>
                        ))}
                    </div>
                </div>
            )}
            
            {mode === 'brief' && (
                <div className="toolbar-group mode-actions brief-actions">
                    <select onChange={(e) => handleBlockChange(e.target.value)} title="Block format">
                        <option value="body">Body</option>
                        <option value="heading">Heading</option>
                        <option value="subheading">Subheading</option>
                        <option value="quote">Quote</option>
                        <option value="bulleted">Bulleted</option>
                        <option value="numbered">Numbered</option>
                    </select>
                    <select onChange={(e) => onFontChange && onFontChange(e.target.value)} title="Font">
                        <option value="Arial">Arial</option>
                        <option value="Times New Roman">Times New Roman</option>
                        <option value="Courier New">Courier New</option>
                    </select>
                    <select onChange={(e) => onFontSizeChange && onFontSizeChange(e.target.value)} title="Font size">
                        <option value="12">12</option>
                        <option value="14">14</option>
                        <option value="16">16</option>
                        <option value="18">18</option>
                        <option value="24">24</option>
                        <option value="32">32</option>
                    </select>
                    <ColorPicker color={fontColor} onChange={handleFontColorChange} title="Font color" />
                    <ColorPicker color={bgColor} onChange={handleBgColorChange} title="Background color" />
                    <button type="button" onClick={onBold} title="Bold">
                        <Bold size={16} />
                    </button>
                    <button type="button" onClick={onItalic} title="Italic">
                        <Italic size={16} />
                    </button>
                    <button type="button" onClick={onUnderline} title="Underline">
                        <Underline size={16} />
                    </button>
                    <button type="button" onClick={onStrikethrough} title="Strikethrough">
                        <Strikethrough size={16} />
                    </button>
                    <button type="button" onClick={onCode} title="Code">
                        <Code size={16} />
                    </button>
                    <button type="button" onClick={onAlignLeft} title="Align left">
                        <AlignLeft size={16} />
                    </button>
                    <button type="button" onClick={onAlignCenter} title="Align center">
                        <AlignCenter size={16} />
                    </button>
                    <button type="button" onClick={onAlignRight} title="Align right">
                        <AlignRight size={16} />
                    </button>
                    <button type="button" onClick={onAlignJustify} title="Justify">
                        <AlignJustify size={16} />
                    </button>
                    <button type="button" onClick={onAddImage} title="Add image">
                        <ImageIcon size={16} />
                    </button>
                    <div style={{ position: 'relative' }}>
                        <button
                            type="button"
                            onClick={toggleLayoutDropdown}
                            ref={layoutButtonRef}
                            title="Insert layout"
                        >
                            <LayoutIcon style={{ fontSize: 16 }} />
                        </button>
                        {layoutOpen && (
                            <div className="layout-dropdown">
                                <button
                                    type="button"
                                    onClick={() => handleInsertLayout('1fr 1fr')}
                                    className="layout-dropdown-item"
                                >
                                    2 Columns (Equal Width)
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleInsertLayout('25% 75%')}
                                    className="layout-dropdown-item"
                                >
                                    2 Columns (25% - 75%)
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleInsertLayout('1fr 1fr 1fr')}
                                    className="layout-dropdown-item"
                                >
                                    3 Columns (Equal Width)
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleInsertLayout('25% 50% 25%')}
                                    className="layout-dropdown-item"
                                >
                                    3 Columns (25% - 50% - 25%)
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleInsertLayout('1fr 1fr 1fr 1fr')}
                                    className="layout-dropdown-item"
                                >
                                    4 Columns (Equal Width)
                                </button>
                            </div>
                        )}
                    </div>
                    <button type="button" onClick={onFigma} title="Figma">
                        <Figma size={16} />
                    </button>
                    <button type="button" onClick={onVoice} title="Voice">
                        <Mic size={16} />
                    </button>
                </div>
            )}
            
            {mode === 'canvas' && (
                <div className="toolbar-group mode-actions canvas-actions">
                    <button type="button" onClick={onSelectTool} title="Select tool">
                        <MousePointer size={16} />
                    </button>
                    <button type="button" onClick={onAddRectangle} title="Add rectangle">
                        <Square size={16} />
                    </button>
                    <button type="button" onClick={onAddCircle} title="Add circle">
                        <Circle size={16} />
                    </button>
                    <button type="button" onClick={onFreeDraw} title="Free draw">
                        <Pencil size={16} />
                    </button>
                    <button type="button" onClick={onAddText} title="Add text">
                        <Type size={16} />
                    </button>
                    <button type="button" onClick={onAddImage} title="Add image">
                        <ImageIcon size={16} />
                    </button>
                    <input type="color" onChange={onColorChange} title="Color" className="color-input" />
                    <button type="button" onClick={onCopy} title="Copy">
                        <ClipboardCopy size={16} />
                    </button>
                    <button type="button" onClick={onPaste} title="Paste">
                        <ClipboardPaste size={16} />
                    </button>
                    <button type="button" onClick={onDelete} title="Delete selected">
                        <Trash2 size={16} />
                    </button>
                    <button type="button" onClick={onClearCanvas} title="Clear canvas">
                        <Eraser size={16} />
                    </button>
                </div>
            )}
            
            <div className="toolbar-group global-actions">
                <button type="button" onClick={onPreview} title="Preview">
                    <Eye size={16} />
                </button>
                <button type="button" onClick={onSave} title="Save" disabled={mode === 'moodboard'}>
                    <Save size={16} />
                </button>
                <button type="button" onClick={onUndo} title="Undo">
                    <Undo2 size={16} />
                </button>
                <button type="button" onClick={onRedo} title="Redo">
                    <Redo2 size={16} />
                </button>
            </div>
        </div>
    );
};
export default UnifiedToolbar;
