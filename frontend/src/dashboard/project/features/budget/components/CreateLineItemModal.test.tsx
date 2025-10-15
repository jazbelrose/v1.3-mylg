import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi, it, expect, beforeAll } from "vitest";

// Mock ModalWithStack
vi.mock("../../../../../../shared/ui/ModalWithStack", () => ({
  default: ({ children, ...props }: { children?: React.ReactNode; [key: string]: unknown }) =>
    React.createElement('div', { 'data-testid': 'modal', ...props }, children),
}));

vi.mock("@/app/contexts/useData", () => ({
  useData: () => ({
    activeProject: { color: "#6E7BFF" },
  }),
}));

// Import the component under test
let CreateLineItemModal: React.ComponentType<{
  isOpen: boolean;
  onRequestClose: () => void;
  onSubmit?: (data: Record<string, unknown>, isAutoSave?: boolean) => Promise<{ budgetItemId?: string } | void | null>;
  initialData?: Record<string, unknown> | null;
}>;

beforeAll(async () => {
  const root = document.createElement("div");
  root.setAttribute("id", "root");
  document.body.appendChild(root);

  // Lazy import inside beforeAll to ensure root is available
  const { default: CreateLineItemModalImport } = await import("./CreateLineItemModal");
  CreateLineItemModal = CreateLineItemModalImport;
});

it("does not autosave when fields change", async () => {
  const onSubmit = vi.fn(() => Promise.resolve({}));

  render(
    <CreateLineItemModal
      isOpen={true}
      onRequestClose={() => {}}
      onSubmit={onSubmit}
    />
  );

  const user = userEvent.setup();
  const desc = screen.getByLabelText("Description");

  await user.type(desc, "Test");

  await new Promise((resolve) => setTimeout(resolve, 1100));
  expect(onSubmit).not.toHaveBeenCalled();

  await user.click(screen.getByText("Create"));

  await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
});

it("closing with unsaved changes prompts to save for existing items", async () => {
  const onSubmit = vi.fn(() => Promise.resolve({}));
  const onRequestClose = vi.fn();

  const user = userEvent.setup();

  render(
    <CreateLineItemModal
      isOpen={true}
      onRequestClose={onRequestClose}
      onSubmit={onSubmit}
      initialData={{ description: "Initial" }}
    />
  );

  const desc = screen.getByLabelText("Description");

  await user.clear(desc);
  await user.type(desc, "Changed");
  await user.click(screen.getByText("Cancel"));

  expect(
    await screen.findByText(
      "You have unsaved changes, do you want to save this line item?"
    )
  ).toBeInTheDocument();

  await user.click(screen.getByText("Yes"));
  await waitFor(() => expect(onSubmit).toHaveBeenCalled());
  expect(onRequestClose).toHaveBeenCalled();
});

it("closing with unsaved changes prompts to save for new items", async () => {
  const onSubmit = vi.fn(() => Promise.resolve({}));
  const onRequestClose = vi.fn();

  const user = userEvent.setup();

  render(
    <CreateLineItemModal
      isOpen={true}
      onRequestClose={onRequestClose}
      onSubmit={onSubmit}
    />
  );

  const desc = screen.getByLabelText("Description");

  await user.type(desc, "New item");
  await user.click(screen.getByText("Cancel"));

  expect(
    await screen.findByText(
      "You have unsaved changes, do you want to save this line item?"
    )
  ).toBeInTheDocument();

  await user.click(screen.getByText("Yes"));
  await waitFor(() => expect(onSubmit).toHaveBeenCalled());
  expect(onRequestClose).toHaveBeenCalled();
});









