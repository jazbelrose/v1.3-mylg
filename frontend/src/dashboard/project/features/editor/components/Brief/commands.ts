import { createCommand, type LexicalCommand } from 'lexical';

export const SET_TEXT_COLOR_COMMAND: LexicalCommand<string> = createCommand('SET_TEXT_COLOR');
export const SET_BG_COLOR_COMMAND: LexicalCommand<string> = createCommand('SET_BG_COLOR');
export const INSERT_IMAGE_COMMAND = 'INSERT_IMAGE_COMMAND' as const;
export const SET_FONT_FAMILY_COMMAND: LexicalCommand<string> = createCommand('SET_FONT_FAMILY');
export const SET_FONT_SIZE_COMMAND: LexicalCommand<string> = createCommand('SET_FONT_SIZE');
export const OPEN_IMAGE_COMMAND: LexicalCommand<string> = createCommand('OPEN_IMAGE');
export const OPEN_FIGMA_COMMAND: LexicalCommand<string> = createCommand('OPEN_FIGMA');
export const TOGGLE_SPEECH_COMMAND: LexicalCommand<void> = createCommand('TOGGLE_SPEECH');









