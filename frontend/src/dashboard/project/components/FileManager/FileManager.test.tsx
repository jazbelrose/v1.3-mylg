import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import { vi, test, expect, beforeEach } from "vitest";

// -- Types ---------------------------------------------------------------------
interface MockS3Item {
  key: string;
  lastModified: string;
}

interface MockUser {
  userId: string;
  role: string;
}

interface MockProject {
  projectId: string;
  invoices?: Array<{ fileName: string; url: string }>;
}

interface MockDataValue {
  activeProject: MockProject;
  user: MockUser;
  isAdmin: boolean;
}
vi.mock("lucide-react", () => ({
  Folder: () => null,
  FileText: () => null,
  Download: () => null,
  Layout: () => null,
  Upload: () => null,
  PenTool: () => null,
}));

// Ensure a root element exists (some code may query #root)
const root = document.createElement("div");
root.id = "root";
document.body.appendChild(root);

vi.mock("@/app/contexts/useData", () => ({
  useData: vi.fn(),
}));

vi.mock("aws-amplify/storage", () => ({
  list: vi.fn().mockResolvedValue({ items: [] }),
  uploadData: vi.fn(),
}));

vi.mock("./PDFPreview", () => ({
  default: (props: { title: string }) => <canvas title={props.title} />
}));

const MOCK_S3_BASE = "https://s3";

vi.mock("@/shared/utils/api", () => {
  const buildUrl = (key: string) => {
    if (!key || typeof key !== "string") return key;
    if (key.startsWith("http") || key.startsWith("blob:")) return key;
    const sanitized = key.replace(/^https?:\/\/.+?\//, "");
    const parts = sanitized.split('/');
    const lastPart = parts.pop();
    const path = parts.join('/');
    return `${MOCK_S3_BASE}/${path}/${encodeURIComponent(lastPart)}`;
  };

  const toKey = (url: string) => {
    if (!url || typeof url !== "string") return url;
    if (!url.startsWith(MOCK_S3_BASE)) return url;
    const path = url.slice(`${MOCK_S3_BASE}/`.length);
    return decodeURIComponent(path);
  };

  return {
    API_BASE_URL: "base",
    ZIP_FILES_URL: "zip",
    DELETE_PROJECT_MESSAGE_URL: "delMsg",
    GET_PROJECT_MESSAGES_URL: "getMsgs",
    EDIT_MESSAGE_URL: "editMsg",
    getFileUrl: buildUrl,
    normalizeFileUrl: (u: string) => buildUrl(u),
    fileUrlsToKeys: (urls: string[]) => urls.map(toKey),
    projectFileDeleteUrl: (projectId: string) => `delete/${projectId}`,
    apiFetch: vi.fn(() =>
      Promise.resolve({ ok: true, json: vi.fn().mockResolvedValue([]) })
    ),
  };
});
// -- Imports that use the mocks -------------------------------------------------
import FileManagerComponent from "./FileManager";

// Mock NotificationContainer since it's just a wrapper
vi.mock('@/shared/ui/ToastNotifications', () => ({
  NotificationContainer: () => null,
  notify: vi.fn(),
}));

// Import mocked modules after mocks are defined
import { NotificationContainer } from '@/shared/ui/ToastNotifications';

type Mock = ReturnType<typeof vi.fn>;

let useDataMock: Mock;
let apiFetchMock: Mock;

// -- Setup ----------------------------------------------------------------------
beforeEach(async () => {
  const dataModule = await import('@/app/contexts/useData');
  useDataMock = dataModule.useData as Mock;

  const apiModule = await import('@/shared/utils/api');
  apiFetchMock = apiModule.apiFetch as Mock;

  useDataMock.mockReset();
  useDataMock.mockReturnValue({
    activeProject: {
      projectId: '1',
      invoices: [
        { fileName: 'file1.txt', url: 'https://s3/projects/1/invoices/file1.txt' },
        { fileName: 'file2.pdf', url: 'https://s3/projects/1/invoices/file2.pdf' },
        { fileName: 'file3.txt', url: 'https://s3/projects/1/invoices/file3.txt' },
      ],
    },
    user: { userId: 'u1', role: 'admin' },
    isAdmin: true,
  } as MockDataValue);

  apiFetchMock.mockReset();
  apiFetchMock.mockResolvedValue({ ok: true, json: vi.fn().mockResolvedValue([]) });
});

// -- Tests ----------------------------------------------------------------------
test.skip("deleting a file via toast confirmation updates the list without closing modal", async () => {
  render(
    <>
      <NotificationContainer />
      <FileManagerComponent folder="invoices" />
    </>
  );

  await userEvent.click(screen.getByText("Invoices"));
  await userEvent.click(screen.getByLabelText("Select files"));
  await userEvent.click(screen.getByText("file1.txt"));
  await userEvent.click(screen.getByLabelText("Delete selected"));

  const yesButton = await screen.findByText("Yes");
  await userEvent.click(yesButton);

  await waitFor(() => {
    expect(screen.queryByText("file1.txt")).not.toBeInTheDocument();
  });

  expect(screen.getByRole("dialog")).toBeInTheDocument();
  expect(
    apiFetchMock.mock.calls.some((call) => typeof call[0] === "string" && call[0].startsWith("delete/"))
  ).toBe(true);
});

test("sorts files by selected option including kind", async () => {
  localStorage.setItem("fileManagerViewMode", "list");

  render(
    <>
      <NotificationContainer />
      <FileManagerComponent folder="invoices" />
    </>
  );

  await userEvent.click(screen.getByText("Invoices"));

  const initial = await screen.findAllByText(/file\d\.(txt|pdf)/);
  expect(initial.map((n) => n.textContent)).toEqual([
    "file1.txt",
    "file2.pdf",
    "file3.txt",
  ]);

  const sortTrigger = screen.getByLabelText("Sort files");
  await userEvent.click(sortTrigger);
  await userEvent.click(screen.getByText("Name (Z-A)"));

  await waitFor(() => {
    const sorted = screen.getAllByText(/file\d\.(txt|pdf)/);
    expect(sorted.map((n) => n.textContent)).toEqual([
      "file3.txt",
      "file2.pdf",
      "file1.txt",
    ]);
  });

  await userEvent.click(sortTrigger);
  await userEvent.click(screen.getByText("Type (A-Z)"));

  await waitFor(() => {
    const sorted = screen.getAllByText(/file\d\.(txt|pdf)/);
    expect(sorted.map((n) => n.textContent)).toEqual([
      "file2.pdf",
      "file1.txt",
      "file3.txt",
    ]);
  });
});

test("filters files by kind", async () => {
  render(
    <>
      <NotificationContainer />
      <FileManagerComponent folder="invoices" />
    </>
  );

  await userEvent.click(screen.getByText("Invoices"));

  const filter = await screen.findByLabelText("Filter files");
  await userEvent.click(filter);
  await userEvent.click(screen.getByRole("option", { name: /pdf/i }));

  await waitFor(() => {
    expect(screen.getByText("file2.pdf")).toBeInTheDocument();
    expect(screen.queryByText("file1.txt")).toBeNull();
  });
});

test("previews PDF files in a modal", async () => {
  render(
    <>
      <NotificationContainer />
      <FileManagerComponent folder="invoices" />
    </>
  );

  await userEvent.click(screen.getByText("Invoices"));
  await userEvent.click(await screen.findByText("file2.pdf"));

  await waitFor(() => {
    expect(screen.getByTitle("file2.pdf")).toBeInTheDocument();
  });
});

test("encodes + in S3 keys and renders without repeated errors", async () => {
  const { list } = vi.mocked(await import("aws-amplify/storage"));
  const listMock = list as vi.MockedFunction<typeof list>;
  listMock.mockClear();
  listMock.mockResolvedValue({
    items: [
      {
        key: "projects/1/invoices/My+Doc.pdf",
        lastModified: "2024-01-01T00:00:00Z",
      } as MockS3Item,
    ],
  });

  useDataMock.mockReturnValue({
    activeProject: { projectId: "1", invoices: [] },
    user: { userId: "u1", role: "admin" },
    isAdmin: true,
  } as MockDataValue);

  const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

  render(
    <>
      <NotificationContainer />
      <FileManagerComponent folder="invoices" />
    </>
  );

  await userEvent.click(screen.getByText("Invoices"));

  const file = await screen.findByText("My+Doc.pdf");
  expect(file).toBeInTheDocument();

  await userEvent.click(file);

  const downloadLink = await screen.findByLabelText("Download image");
  const href = downloadLink.getAttribute("href") ?? "";
  expect(href).toContain("My%2BDoc.pdf");
  expect(href).not.toContain("My+Doc.pdf");

  expect(listMock).toHaveBeenCalled();
  expect(consoleErrorSpy).not.toHaveBeenCalled();

  consoleErrorSpy.mockRestore();
});






