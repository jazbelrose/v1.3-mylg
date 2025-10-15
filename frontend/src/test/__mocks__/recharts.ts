import React from 'react';

const createContainer = (role: string) =>
  function Container({ children }: { children?: React.ReactNode }) {
    return React.createElement('div', { 'data-recharts': role }, children);
  };

export const ResponsiveContainer = createContainer('responsive-container');
export const PieChart = createContainer('pie-chart');
export const Pie = createContainer('pie');
export const Cell = ({ children }: { children?: React.ReactNode }) =>
  React.createElement(React.Fragment, null, children);
export const Tooltip = () => null;
export const Sector = (props: Record<string, unknown>) =>
  React.createElement('div', { 'data-recharts': 'sector', ...props });

export default {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Sector,
};
