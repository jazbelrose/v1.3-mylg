declare module '@storybook/react' {
  import type { ComponentType, ReactElement } from 'react';

  export type Meta<T> = {
    title: string;
    component?: T;
    tags?: string[];
    parameters?: Record<string, unknown>;
    decorators?: Array<(story: () => ReactElement) => ReactElement>;
  };

  export type StoryObj<T> = {
    args?: Partial<T extends ComponentType<infer P> ? P : Record<string, unknown>>;
    render?: (args: T extends ComponentType<infer P> ? P : Record<string, unknown>) => ReactElement;
    name?: string;
    parameters?: Record<string, unknown>;
  };
}









