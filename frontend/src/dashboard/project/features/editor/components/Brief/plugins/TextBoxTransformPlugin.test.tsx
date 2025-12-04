import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { LexicalComposer } from '@lexical/react/LexicalComposer';
import TextBoxTransformPlugin from './TextBoxTransformPlugin';

const config = {
  theme: {},
  namespace: 'test',
  onError: console.error,
};

describe('TextBoxTransformPlugin', () => {
  it('renders without crashing', () => {
    const { container } = render(
      <LexicalComposer initialConfig={config}>
        <TextBoxTransformPlugin />
      </LexicalComposer>
    );
    expect(container).toBeTruthy();
  });
});