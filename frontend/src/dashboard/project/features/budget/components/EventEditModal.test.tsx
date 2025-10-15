// Mock the hooks that BudgetProvider depends on
vi.mock("../../../app/contexts/useSocket", () => ({
  useSocket: vi.fn(() => ({
    ws: null,
  })),
}));

vi.mock("../../../../../app/contexts/useAuth", () => ({
  useAuth: vi.fn(() => ({
    userId: "test-user-id",
    isAuthenticated: true,
    authStatus: "authenticated",
    cognitoUser: null,
    loading: false,
  })),
}));

vi.mock("../../../app/contexts/useData", () => ({
  useData: vi.fn(() => ({
    user: { firstName: "Test User" },
    userId: "test-user-id",
    projects: [],
    messages: [],
    isLoading: false,
  })),
}));

vi.mock("../context/useBudget", () => ({
  default: vi.fn(() => ({
    budgetHeader: { projectTitle: "Test Project", revision: 1 },
    budgetItems: [],
    setBudgetHeader: vi.fn(),
    setBudgetItems: vi.fn(),
    refresh: vi.fn(() => Promise.resolve(null)),
    loading: false,
  })),
}));

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { vi, test, expect, beforeAll } from "vitest";
import EventEditModal from "./EventEditModal";
import { BudgetProvider } from "../context/BudgetProvider";
import { DataProvider } from "../../../../../app/contexts/DataProvider";
import { AuthProvider } from "../../../../../app/contexts/AuthContext";

beforeAll(() => {
  const root = document.createElement("div");
  root.setAttribute("id", "root");
  document.body.appendChild(root);
});

test("uses last event date as default after adding", () => {
  render(
    <AuthProvider>
      <DataProvider>
        <BudgetProvider projectId="p1">
          <EventEditModal
            isOpen={true}
            onRequestClose={() => {}}
            projectId="p1"
            budgetItemId="LINE-1"
            events={[]}
            defaultDate="2024-05-01"
            defaultDescription=""
          />
        </BudgetProvider>
      </DataProvider>
    </AuthProvider>
  );

  const dateInput = screen.getByLabelText(/event date/i) as HTMLInputElement;
  const hoursInput = screen.getByLabelText(/hours/i) as HTMLInputElement;
  const addButton = screen.getByRole("button", { name: /add event/i });

  fireEvent.change(dateInput, { target: { value: "2023-02-10" } });
  fireEvent.change(hoursInput, { target: { value: "2" } });
  fireEvent.click(addButton);

  expect(dateInput.value).toBe("2023-02-10");

  fireEvent.change(dateInput, { target: { value: "2023-03-15" } });
  fireEvent.change(hoursInput, { target: { value: "1" } });
  fireEvent.click(addButton);

  expect(dateInput.value).toBe("2023-03-15");
});

test("displays event description for existing events", () => {
  render(
    <DataProvider>
      <BudgetProvider projectId="p1">
        <EventEditModal
          isOpen={true}
          onRequestClose={() => {}}
          projectId="p1"
          budgetItemId="LINE-1"
          events={[
            { id: "1", date: "2024-05-01", hours: 2, description: "Setup" },
          ]}
          defaultDate="2024-05-01"
          defaultDescription=""
        />
      </BudgetProvider>
    </DataProvider>
  );

  expect(screen.getByText("Setup")).toBeInTheDocument();
});









