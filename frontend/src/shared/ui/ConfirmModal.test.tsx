import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ConfirmModal from './ConfirmModal';
import { test, expect, vi, beforeAll } from 'vitest';

// Mock react-modal
vi.mock('react-modal', () => {
  const Modal = ({ children }: { children?: React.ReactNode }) =>
    React.createElement('div', { 'data-testid': 'modal' }, children);
  Modal.setAppElement = vi.fn();
  return { default: Modal };
});

import Modal from 'react-modal';

// Set up modal for testing
beforeAll(() => {
  const root = document.createElement('div');
  root.id = 'root';
  document.body.appendChild(root);
  Modal.setAppElement('#root');
});

// Note: react-modal is mocked in setup.ts

test("shows feedback when confirmation text doesn't match", async () => {
  const user = userEvent.setup();
  render(
    <ConfirmModal
      isOpen={true}
      onRequestClose={() => {}}
      onConfirm={() => {}}
      confirmText="Project"
    />
  );

  // Query within the modal container
  const modal = screen.getByTestId('modal');
  const input = within(modal).getByPlaceholderText(/type\s*"project"\s*to\s*confirm/i);

  await user.type(input, 'Wrong');

  expect(within(modal).getByText(/does not match/i)).toBeTruthy();
  const confirmBtn = within(modal).getByRole('button', { name: /yes/i }) as HTMLButtonElement;
  expect(confirmBtn.disabled).toBe(true);

  await user.clear(input);
  await user.type(input, 'Project');

  expect(within(modal).queryByText(/does not match/i)).toBeNull();
  expect(confirmBtn.disabled).toBe(false);
});








