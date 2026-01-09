import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";

import SlidesPdfExportMenu from "./SlidesPdfExportMenu";

test("clicking PDF (High) enqueues exactly one job with preset=high", () => {
  const onExportAllPdf = vi.fn();
  render(<SlidesPdfExportMenu onExportAllPdf={onExportAllPdf as any} isExportingPdf={false} />);

  fireEvent.click(screen.getByText("PDF (High) — crisp (default)"));

  expect(onExportAllPdf).toHaveBeenCalledTimes(1);
  expect(onExportAllPdf).toHaveBeenCalledWith("high");
  expect(onExportAllPdf).not.toHaveBeenCalledWith("screen");
  expect(onExportAllPdf).not.toHaveBeenCalledWith("print");
});

test("menu always shows the three preset actions even while exporting (no Exporting... rows)", () => {
  const onExportAllPdf = vi.fn();
  render(<SlidesPdfExportMenu onExportAllPdf={onExportAllPdf as any} isExportingPdf={true} />);

  expect(screen.getByText("PDF (Screen) — small & fast")).toBeTruthy();
  expect(screen.getByText("PDF (High) — crisp (default)")).toBeTruthy();
  expect(screen.getByText("PDF (Print) — very large")).toBeTruthy();
  expect(screen.queryByText(/Exporting\.{3}/i)).toBeNull();

  // Actions are disabled while an export is in progress.
  const buttons = screen.getAllByRole("button");
  expect(buttons.length).toBe(3);
  buttons.forEach((b) => expect((b as HTMLButtonElement).disabled).toBe(true));
});
