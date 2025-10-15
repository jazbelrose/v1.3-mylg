import type { Meta, StoryObj } from '@storybook/react';
import React from 'react';

import Squircle from './Squircle';

const radii = [12, 16, 20, 24];
const smoothness = [0.4, 0.6, 0.8];

const meta: Meta<typeof Squircle> = {
  title: 'Shared/Squircle',
  component: Squircle,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
  },
};

export default meta;

type Story = StoryObj<typeof Squircle>;

export const RadiusSmoothingMatrix: Story = {
  render: () => (
    <div
      style={{
        display: 'grid',
        gap: '1.5rem',
        gridTemplateColumns: `repeat(${smoothness.length + 1}, minmax(0, 1fr))`,
        alignItems: 'center',
        justifyItems: 'center',
        maxWidth: 'min(900px, 100%)',
      }}
    >
      <div />
      {smoothness.map((value) => (
        <strong key={`header-${value}`}>smoothing {value}</strong>
      ))}
      {radii.map((radius) => (
        <React.Fragment key={`row-${radius}`}>
          <strong>radius {radius}px</strong>
          {smoothness.map((value) => (
            <Squircle
              key={`${radius}-${value}`}
              radius={radius}
              smoothing={value}
              style={{
                width: 120,
                height: 80,
                background:
                  'linear-gradient(135deg, rgba(120, 82, 255, 0.85), rgba(0, 200, 255, 0.85))',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 600,
              }}
            >
              {radius}/{value}
            </Squircle>
          ))}
        </React.Fragment>
      ))}
    </div>
  ),
};

export const AsymmetricExamples: Story = {
  render: () => (
    <div
      style={{
        display: 'flex',
        gap: '1.5rem',
        alignItems: 'center',
        flexWrap: 'wrap',
      }}
    >
      <Squircle
        radius={24}
        cornerRadii={{ top: 26, bottom: 22 }}
        style={{
          width: 220,
          padding: '1.5rem',
          background:
            'linear-gradient(135deg, rgba(250, 51, 86, 0.25), rgba(94, 72, 255, 0.25))',
          color: '#fff',
          fontWeight: 600,
        }}
      >
        Asymmetric card
      </Squircle>
      <Squircle
        as="button"
        radius={14}
        smoothing={0.75}
        cornerRadii={{ top: 16, bottom: 12 }}
        style={{
          padding: '0.6rem 1.5rem',
          border: 'none',
          background: 'rgba(235, 93, 250, 0.2)',
          color: '#fff',
          fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        Pill action
      </Squircle>
    </div>
  ),
};









