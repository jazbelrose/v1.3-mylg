// __tests__/GalleryComponent.admin.test.tsx
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import Modal from "react-modal";
import { MemoryRouter } from "react-router-dom";
import { ToastContainer } from "react-toastify";
import { vi, describe, it, expect } from "vitest";

// Create spies for functions that need to be tested
const updateProjectFields = vi.fn();

// ---- Mocks ----
vi.mock("lucide-react", () => ({ GalleryVerticalEnd: () => <div /> }));

vi.mock("react-modal", () => {
  const Modal = ({ children }: { children?: React.ReactNode }) =>
    React.createElement('div', { 'data-testid': 'modal' }, children);
  Modal.setAppElement = vi.fn();
  return { default: Modal };
});

// Mock the API functions
vi.mock("../../../../shared/utils/api", () => ({
  deleteGallery: vi.fn(),
  deleteGalleryFiles: vi.fn(),
  updateGallery: vi.fn(),
  getFileUrl: vi.fn((keyOrUrl) => {
    if (keyOrUrl.startsWith('http')) {
      return keyOrUrl;
    }
    return `https://s3.amazonaws.com/bucket/${keyOrUrl}?t=555`;
  }),
  fetchGalleries: vi.fn(),
  S3_PUBLIC_BASE: "https://s3.amazonaws.com/bucket/",
}));

vi.mock("../../../../app/contexts/useData", () => ({
  useData: vi.fn(() => ({
    projects: [],
    setProjects: vi.fn(),
    setUserProjects: vi.fn(),
    isLoading: false,
    setIsLoading: vi.fn(),
    loadingProfile: false,
    activeProject: {
      projectId: "1",
      galleries: [{ id: "g1", name: "Old", slug: "old", url: "http://a.com" }],
    },
    setActiveProject: vi.fn(),
    selectedProjects: [],
    setSelectedProjects: vi.fn(),
    fetchProjectDetails: vi.fn(),
    fetchProjects: vi.fn(),
    fetchUserProfile: vi.fn(),
    fetchRecentActivity: vi.fn(),
    opacity: 1,
    setOpacity: vi.fn(),
    settingsUpdated: false,
    toggleSettingsUpdated: vi.fn(),
    dmReadStatus: {},
    setDmReadStatus: vi.fn(),
    projectsError: false,
    updateTimelineEvents: vi.fn(),
    updateProjectFields: updateProjectFields,
    isAdmin: true,
    isBuilder: false,
    isDesigner: false,
    user: null,
    allUsers: [],
    userId: "",
    userName: "",
    userData: null,
    setUserData: vi.fn(),
    setUser: vi.fn(),
    refreshUsers: vi.fn(),
    refreshUser: vi.fn(),
    updateUserProfile: vi.fn(),
    isVendor: false,
    isClient: false,
    inbox: [],
    setInbox: vi.fn(),
    projectMessages: {},
    setProjectMessages: vi.fn(),
    deletedMessageIds: new Set(),
    markMessageDeleted: vi.fn(),
    clearDeletedMessageId: vi.fn(),
    toggleReaction: vi.fn(),
  })),
}));

// Mock the missing GalleryComponent
// vi.mock("../dashboard/components/SingleProject/GalleryComponent", () => ({
//   default: () => (
//     <div>
//       <button>Galleries</button>
//       <button aria-label="Edit gallery">Edit</button>
//       <button aria-label="Delete gallery">Delete</button>
//       <input placeholder="Gallery Name" />
//       <input placeholder="Password" type="password" />
//       <button>Save</button>
//       <button aria-label="Show password">Toggle</button>
//       <div>Old</div>
//       <div>New Name</div>
//     </div>
//   ),
// }));

// SUT
import { GalleryComponent } from "../../components";
import { useData } from "../../../../app/contexts/useData";

import {
  deleteGallery,
  deleteGalleryFiles,
  updateGallery,
  S3_PUBLIC_BASE,
} from "../../../../shared/utils/api";

import { flushQueue } from "../../../../shared/utils/requestQueue";

const mockUseData = vi.mocked(useData);

// ensure root element exists for React Modal
const root = document.createElement("div");
root.id = "root";
document.body.appendChild(root);
Modal.setAppElement(root);

describe("GalleryComponent admin edit", () => {

  it("allows admin to edit gallery details", async () => {
    render(
      <MemoryRouter>
        <GalleryComponent />
      </MemoryRouter>
    );

    await userEvent.click(screen.getByText("Galleries"));
    await userEvent.click(screen.getByLabelText(/Edit .* gallery/));

    // Debug: Check if we're in edit mode
    expect(screen.getByPlaceholderText("Gallery Name")).toBeInTheDocument();

    const nameInput = screen.getByPlaceholderText("Gallery Name");
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, "New Name");

    // Debug: Check if Save button is present
    const saveButton = screen.getByText("Save");
    expect(saveButton).toBeInTheDocument();

    await userEvent.click(saveButton);

    // Flush the queue to ensure updateProjectFields is called
    await flushQueue();

    expect(updateProjectFields).toHaveBeenCalled();
    const [projectId, fields] = updateProjectFields.mock.calls[0];
    expect(projectId).toBe("1");
    expect(Object.keys(fields)).toContain("galleries");
    expect(screen.getByText("New Name")).toBeInTheDocument();
  });

  it('supports editing when project uses "galleries"', async () => {
    mockUseData.mockReturnValue({
      projects: [],
      setProjects: vi.fn(),
      setUserProjects: vi.fn(),
      isLoading: false,
      setIsLoading: vi.fn(),
      loadingProfile: false,
      activeProject: {
        projectId: "2",
        galleries: [{ id: "g2", name: "Old2", slug: "old2", url: "http://b.com" }],
      },
      setActiveProject: vi.fn(),
      selectedProjects: [],
      setSelectedProjects: vi.fn(),
      fetchProjectDetails: vi.fn(),
      fetchProjects: vi.fn(),
      fetchUserProfile: vi.fn(),
      fetchRecentActivity: vi.fn(),
      opacity: 1,
      setOpacity: vi.fn(),
      settingsUpdated: false,
      toggleSettingsUpdated: vi.fn(),
      dmReadStatus: {},
      setDmReadStatus: vi.fn(),
      projectsError: false,
      updateTimelineEvents: vi.fn(),
      updateProjectFields,
      isAdmin: true,
      isBuilder: false,
      isDesigner: false,
      user: null,
      allUsers: [],
      userId: "",
      userName: "",
      userData: null,
      setUserData: vi.fn(),
      setUser: vi.fn(),
      refreshUsers: vi.fn(),
      refreshUser: vi.fn(),
      updateUserProfile: vi.fn(),
      isVendor: false,
      isClient: false,
      inbox: [],
      setInbox: vi.fn(),
      projectMessages: {},
      setProjectMessages: vi.fn(),
      deletedMessageIds: new Set(),
      markMessageDeleted: vi.fn(),
      clearDeletedMessageId: vi.fn(),
      toggleReaction: vi.fn(),
    });

    render(
      <MemoryRouter>
        <GalleryComponent />
      </MemoryRouter>
    );

    await userEvent.click(screen.getByText("Galleries"));
    await userEvent.click(screen.getByLabelText(/Edit .* gallery/));
    await userEvent.type(screen.getByPlaceholderText("Gallery Name"), "X");
    await userEvent.click(screen.getByText("Save"));

    // Flush the queue to ensure updateProjectFields is called
    await flushQueue();

    expect(updateProjectFields).toHaveBeenCalled();
    const [projectId, fields] = updateProjectFields.mock.calls[0];
    expect(projectId).toBe("2");
    expect(Object.keys(fields)).toContain("galleries");
  });

  it("toggles password visibility", async () => {
    render(
      <MemoryRouter>
        <GalleryComponent />
      </MemoryRouter>
    );

    await userEvent.click(screen.getByText("Galleries"));
    await userEvent.click(screen.getByLabelText(/Edit .* gallery/));

    const pwdInput = screen.getByPlaceholderText("Password");
    expect(pwdInput).toHaveAttribute("type", "password");

    const toggleBtn = screen.getByLabelText("Show password");
    await userEvent.click(toggleBtn);

    expect(pwdInput).toHaveAttribute("type", "text");
  });

  it("allows admin to delete a gallery", async () => {
    render(
      <MemoryRouter>
        <ToastContainer />
        <GalleryComponent />
      </MemoryRouter>
    );

    await userEvent.click(screen.getByText("Galleries"));
    await userEvent.click(screen.getByLabelText(/Delete .* gallery/));

    const yesButton = await screen.findByText("Yes");
    await userEvent.click(yesButton);

    await waitFor(() => expect(deleteGallery).toHaveBeenCalled());
    expect(deleteGalleryFiles).toHaveBeenCalled();
    expect(updateProjectFields).not.toHaveBeenCalled();
  });

  it("updates password enabled field", async () => {
    mockUseData.mockReturnValue({
      projects: [],
      setProjects: vi.fn(),
      setUserProjects: vi.fn(),
      isLoading: false,
      setIsLoading: vi.fn(),
      loadingProfile: false,
      activeProject: {
        projectId: "3",
        galleries: [
          {
            galleryId: "gid",
            name: "Old",
            slug: "old",
            url: "http://a.com",
            passwordEnabled: true,
          },
        ],
      },
      setActiveProject: vi.fn(),
      selectedProjects: [],
      setSelectedProjects: vi.fn(),
      fetchProjectDetails: vi.fn(),
      fetchProjects: vi.fn(),
      fetchUserProfile: vi.fn(),
      fetchRecentActivity: vi.fn(),
      opacity: 1,
      setOpacity: vi.fn(),
      settingsUpdated: false,
      toggleSettingsUpdated: vi.fn(),
      dmReadStatus: {},
      setDmReadStatus: vi.fn(),
      projectsError: false,
      updateTimelineEvents: vi.fn(),
      updateProjectFields,
      isAdmin: true,
      isBuilder: false,
      isDesigner: false,
      user: null,
      allUsers: [],
      userId: "",
      userName: "",
      userData: null,
      setUserData: vi.fn(),
      setUser: vi.fn(),
      refreshUsers: vi.fn(),
      refreshUser: vi.fn(),
      updateUserProfile: vi.fn(),
      isVendor: false,
      isClient: false,
      inbox: [],
      setInbox: vi.fn(),
      projectMessages: {},
      setProjectMessages: vi.fn(),
      deletedMessageIds: new Set(),
      markMessageDeleted: vi.fn(),
      clearDeletedMessageId: vi.fn(),
      toggleReaction: vi.fn(),
    });

    render(
      <MemoryRouter>
        <GalleryComponent />
      </MemoryRouter>
    );

    await userEvent.click(screen.getByText("Galleries"));
    await userEvent.click(screen.getByLabelText(/Edit .* gallery/));

    const enableBox = screen.getByLabelText("Enable");
    await userEvent.click(enableBox);
    await userEvent.click(screen.getByText("Save"));

    await waitFor(() => expect(updateGallery).toHaveBeenCalled());
    const [galleryId, fields] = vi.mocked(updateGallery).mock.calls[0];
    expect(galleryId).toBe("gid");
    expect(fields.passwordEnabled).toBe(false);
  });

  it("uploads new cover image and updates gallery", async () => {
    render(
      <MemoryRouter>
        <GalleryComponent />
      </MemoryRouter>
    );

    await userEvent.click(screen.getByText("Galleries"));
    await userEvent.click(screen.getByLabelText(/Change cover for .* gallery/));

    const fileInput = document.querySelector(
      'input[accept="image/*"]'
    ) as HTMLInputElement | null;

    const file = new File(["abc"], "cover.png", { type: "image/png" });
    expect(fileInput).toBeTruthy();
    await userEvent.upload(fileInput as HTMLInputElement, file);

    await waitFor(() => expect(updateGallery).toHaveBeenCalled());
    const [galleryId] = vi.mocked(updateGallery).mock.calls[0];
    expect(galleryId).toBe("g1");
  });

  it("selects existing cover image from modal", async () => {
    mockUseData.mockReturnValue({
      projects: [],
      setProjects: vi.fn(),
      setUserProjects: vi.fn(),
      isLoading: false,
      setIsLoading: vi.fn(),
      loadingProfile: false,
      activeProject: {
        projectId: "1",
        galleries: [
          {
            id: "g1",
            name: "Old",
            slug: "old",
            imageUrls: ["https://img1", "https://img2"],
          },
        ],
      },
      setActiveProject: vi.fn(),
      selectedProjects: [],
      setSelectedProjects: vi.fn(),
      fetchProjectDetails: vi.fn(),
      fetchProjects: vi.fn(),
      fetchUserProfile: vi.fn(),
      fetchRecentActivity: vi.fn(),
      opacity: 1,
      setOpacity: vi.fn(),
      settingsUpdated: false,
      toggleSettingsUpdated: vi.fn(),
      dmReadStatus: {},
      setDmReadStatus: vi.fn(),
      projectsError: false,
      updateTimelineEvents: vi.fn(),
      updateProjectFields,
      isAdmin: true,
      isBuilder: false,
      isDesigner: false,
      user: null,
      allUsers: [],
      userId: "",
      userName: "",
      userData: null,
      setUserData: vi.fn(),
      setUser: vi.fn(),
      refreshUsers: vi.fn(),
      refreshUser: vi.fn(),
      updateUserProfile: vi.fn(),
      isVendor: false,
      isClient: false,
      inbox: [],
      setInbox: vi.fn(),
      projectMessages: {},
      setProjectMessages: vi.fn(),
      deletedMessageIds: new Set(),
      markMessageDeleted: vi.fn(),
      clearDeletedMessageId: vi.fn(),
      toggleReaction: vi.fn(),
    });

    render(
      <MemoryRouter>
        <GalleryComponent />
      </MemoryRouter>
    );

    await userEvent.click(screen.getByText("Galleries"));
    await userEvent.click(screen.getByLabelText(/Change cover for .* gallery/));

    const option = await screen.findByAltText("Cover option 1");
    await userEvent.click(option);

    await waitFor(() => expect(updateGallery).toHaveBeenCalled());
    const [galleryId, fields] = vi.mocked(updateGallery).mock.calls[0];
    expect(galleryId).toBe("g1");
    expect(fields.coverImageUrl).toBe("https://img1");
  });

  it("updates preview after new cover upload", async () => {
    const fixedTime = 12345;
    const spy = vi.spyOn(Date, "now").mockReturnValue(fixedTime);

    render(
      <MemoryRouter>
        <GalleryComponent />
      </MemoryRouter>
    );

    await userEvent.click(screen.getByText("Galleries"));
    await userEvent.click(screen.getByLabelText(/Change cover for .* gallery/));

    const fileInput = document.querySelector(
      'input[accept="image/*"]'
    ) as HTMLInputElement | null;

    const file = new File(["abc"], "cover.png", { type: "image/png" });
    expect(fileInput).toBeTruthy();
    await userEvent.upload(fileInput as HTMLInputElement, file);

    const expectedUrl = `${S3_PUBLIC_BASE}projects/1/galleries/g1/cover/cover.png?t=${fixedTime}`;

    await waitFor(() => {
      expect(updateGallery).toHaveBeenCalled();
    });

    const img = document.querySelector("img") as HTMLImageElement | null;
    expect(img?.getAttribute("src")).toBe(expectedUrl);

    spy.mockRestore();
  });

  it("uploads cover for legacy gallery without id using slug", async () => {
    const fixedTime = 555;
    const spy = vi.spyOn(Date, "now").mockReturnValue(fixedTime);

    updateProjectFields.mockClear();

    mockUseData.mockReturnValue({
      projects: [],
      setProjects: vi.fn(),
      setUserProjects: vi.fn(),
      isLoading: false,
      setIsLoading: vi.fn(),
      loadingProfile: false,
      activeProject: { projectId: "1", gallery: [{ name: "Legacy", link: "/legacy" }] },
      setActiveProject: vi.fn(),
      selectedProjects: [],
      setSelectedProjects: vi.fn(),
      fetchProjectDetails: vi.fn(),
      fetchProjects: vi.fn(),
      fetchUserProfile: vi.fn(),
      fetchRecentActivity: vi.fn(),
      opacity: 1,
      setOpacity: vi.fn(),
      settingsUpdated: false,
      toggleSettingsUpdated: vi.fn(),
      dmReadStatus: {},
      setDmReadStatus: vi.fn(),
      projectsError: false,
      updateTimelineEvents: vi.fn(),
      updateProjectFields,
      isAdmin: true,
      isBuilder: false,
      isDesigner: false,
      user: null,
      allUsers: [],
      userId: "",
      userName: "",
      userData: null,
      setUserData: vi.fn(),
      setUser: vi.fn(),
      refreshUsers: vi.fn(),
      refreshUser: vi.fn(),
      updateUserProfile: vi.fn(),
      isVendor: false,
      isClient: false,
      inbox: [],
      setInbox: vi.fn(),
      projectMessages: {},
      setProjectMessages: vi.fn(),
      deletedMessageIds: new Set(),
      markMessageDeleted: vi.fn(),
      clearDeletedMessageId: vi.fn(),
      toggleReaction: vi.fn(),
    });

    render(
      <MemoryRouter>
        <GalleryComponent />
      </MemoryRouter>
    );

    await userEvent.click(screen.getByText("Galleries"));
    await userEvent.click(screen.getByLabelText(/Change cover for .* gallery/));

    const fileInput = document.querySelector(
      'input[accept="image/*"]'
    ) as HTMLInputElement | null;

    const file = new File(["abc"], "my cover.png", { type: "image/png" });
    expect(fileInput).toBeTruthy();
    await userEvent.upload(fileInput as HTMLInputElement, file);

    await waitFor(() => expect(updateProjectFields).toHaveBeenCalled());

    const galleryUpdateCall = updateProjectFields.mock.calls.find(call => call[1].galleryUpdate);
    expect(galleryUpdateCall).toBeTruthy();
    const [projectId, fields] = galleryUpdateCall!;
    expect(projectId).toBe("1");

    const img = document.querySelector("img") as HTMLImageElement | null;
    const expectedSrc = `${S3_PUBLIC_BASE}projects/1/galleries/legacy/cover/my%20cover.png?t=${fixedTime}`;

    expect(fields.gallery[0].coverImageUrl).toBe(expectedSrc);
    expect(img?.getAttribute("src")).toBe(expectedSrc);

    spy.mockRestore();
  });
});











