import '@testing-library/jest-dom';
import React from 'react';

vi.mock('lucide-react', () => {
  const Icon: React.FC = () => null;
  return new Proxy({}, {
    get: () => Icon,
  });
});









