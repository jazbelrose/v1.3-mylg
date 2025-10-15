import React, {
  useState,
  useEffect,
  forwardRef,
  useImperativeHandle,
  useCallback,
  ChangeEvent,
  CSSProperties,
} from "react";
import Modal from "@/shared/ui/ModalWithStack";
import { X, Pencil, Trash2, Link2 } from "lucide-react";
import { useData } from "@/app/contexts/useData";
import { enqueueProjectUpdate } from "@/shared/utils/requestQueue";
import SpinnerOverlay from "@/shared/ui/SpinnerOverlay";
import { toast } from "react-toastify";
import { apiFetch, PROJECTS_SERVICE_URL } from "@/shared/utils/api";

if (typeof document !== "undefined") {
  Modal.setAppElement("#root");
}

type QuickLink = { id: string; name: string; url: string };

type QuickLinksRef = {
  openModal: () => void;
};

export type { QuickLinksRef };

type QuickLinksProps = {
  style?: CSSProperties;
  hideTrigger?: boolean;
};

const generateId = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 8)}`;

const QuickLinksComponent = forwardRef<QuickLinksRef, QuickLinksProps>(
  ({ style, hideTrigger = false }, ref) => {
    const { activeProject, updateProjectFields } = useData();

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [links, setLinks] = useState<QuickLink[]>([]);
    const [newLink, setNewLink] = useState<QuickLink>({
      id: "",
      name: "",
      url: "",
    });
    const [errorMessage, setErrorMessage] = useState("");
    const [editingIndex, setEditingIndex] = useState<number | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [saving, setSaving] = useState(false);

    const projectId = activeProject?.projectId;
    const apiUrl = projectId
      ? `${PROJECTS_SERVICE_URL}/projects/${encodeURIComponent(projectId)}/quick-links`
      : null;

    const fetchQuickLinks = useCallback(async () => {
      if (!apiUrl) return;
      setLoading(true);
      setError("");
      try {
        const data = await apiFetch<{ quickLinks?: QuickLink[] }>(apiUrl);
        if (Array.isArray(data.quickLinks)) {
          setLinks([...data.quickLinks]);
        }
      } catch (err) {
        console.error("Error fetching quick links:", err);
        setError("Failed to fetch quick links.");
        toast.error("Failed to fetch quick links.");
      } finally {
        setLoading(false);
      }
    }, [apiUrl]);

    // Sync with project data when activeProject changes
    useEffect(() => {
      if (Array.isArray(activeProject?.quickLinks)) {
        const linksWithIds = activeProject.quickLinks.map((l: QuickLink) =>
          l.id ? l : { ...l, id: generateId() }
        );
        setLinks(linksWithIds);
      }
    }, [activeProject]);

    const openModal = () => {
      setIsModalOpen(true);
      fetchQuickLinks(); // ensure fresh data
    };

    const closeModal = () => {
      setIsModalOpen(false);
      setEditingIndex(null);
      setNewLink({ id: "", name: "", url: "" });
      setError("");
    };

    useImperativeHandle(ref, () => ({ openModal }));

    const handleInputChange = (
      e: ChangeEvent<HTMLInputElement>
    ): void => {
      const { name, value } = e.target;
      setNewLink((prev) => ({ ...prev, [name]: value }));
      if (errorMessage) setErrorMessage("");
    };

    const validateUrl = (url: string) => {
      try {
        new URL(url);
        return true;
      } catch {
        return false;
      }
    };

    const updateQuickLinksToAPI = async (updatedLinks: QuickLink[]) => {
      if (!activeProject?.projectId) {
        console.error("Active project or project ID is undefined");
        return;
      }
      try {
        setSaving(true);
        await enqueueProjectUpdate(
          updateProjectFields,
          activeProject.projectId,
          { quickLinks: updatedLinks }
        );
        toast.success("Saved. Nice.");
      } catch (err) {
        console.error("Error updating Quick Links:", err);
        setError("Failed to update Quick Links.");
        toast.error("Failed to update Quick Links.");
      } finally {
        setSaving(false);
      }
    };

    const handleSubmit = async () => {
      if (!newLink.name || !newLink.url) {
        setErrorMessage("Both fields are required.");
        return;
      }
      if (!validateUrl(newLink.url)) {
        setErrorMessage("Please enter a valid URL.");
        return;
      }

      setErrorMessage("");
      let updated: QuickLink[];

      if (editingIndex !== null) {
        updated = [...links];
        updated[editingIndex] = newLink;
      } else {
        const linkWithId: QuickLink = { ...newLink, id: generateId() };
        updated = [linkWithId, ...links]; // newest on top
      }

      setLinks(updated);
      await updateQuickLinksToAPI(updated);

      // reset form state
      setEditingIndex(null);
      setNewLink({ id: "", name: "", url: "" });
    };

    const handleEdit = (index: number) => {
      setEditingIndex(index);
      setNewLink(links[index]);
      setIsModalOpen(true);
    };

    const handleDelete = async (index: number) => {
      const updated = links.filter((_, i) => i !== index);
      setLinks(updated);
      await updateQuickLinksToAPI(updated);
    };

    return (
      <>
        {!hideTrigger && (
          <div
            className="dashboard-item files files-shared-style"
            onClick={openModal}
            style={{
              ...style,
              cursor: "pointer",
              display: "flex",
              alignItems: "flex-start",
            }}
          >
            <div style={{ display: "flex", alignItems: "center" }}>
              <Link2 size={24} style={{ marginRight: 8, marginTop: 1 }} />
              <span>Quick Links</span>
            </div>
            <span style={{ marginLeft: "auto", alignSelf: "flex-start" }}>
              &gt;
            </span>
          </div>
        )}

        <Modal
          isOpen={isModalOpen}
          onRequestClose={closeModal}
          contentLabel="Quick Links Modal"
          style={{
            overlay: {
              backgroundColor: "rgba(0, 0, 0, 0.75)",
              zIndex: 1000,
            },
            content: {
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              width: "95%",
              maxWidth: "500px",
              height: "auto",
              minHeight: "65vh",
              maxHeight: "95vh",
              borderRadius: "10px",
              padding: "20px",
              backgroundColor: "rgba(0, 0, 0, 0.85)",
              color: "#fff",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            },
          }}
        >
          {loading && <SpinnerOverlay />}
          {error && (
            <div style={{ color: "#FA3356", marginBottom: 10 }}>{error}</div>
          )}
          {saving && (
            <div style={{ color: "#FA3356", marginBottom: 10 }}>Saving...</div>
          )}

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 10,
            }}
          >
            <h3 style={{ margin: 0, color: "#fff", fontSize: "1.2rem" }}>
              Add Quick Links
            </h3>
            <button
              onClick={closeModal}
              aria-label="Close modal"
              style={{ background: "none", border: "none", color: "#fff" }}
            >
              <X size={20} />
            </button>
          </div>

          <div style={{ flexGrow: 1, overflowY: "auto", marginBottom: 15 }}>
            {links.length > 0 && (
              <div className="quick-links-list">
                {links.map((link, index) => (
                  <div
                    key={link.id}
                    className="quick-link-item"
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: 10,
                      borderBottom: "1px solid #444",
                    }}
                  >
                    <a
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: "#FA3356", textDecoration: "none" }}
                    >
                      {link.name}
                    </a>
                    <div>
                      <button
                        onClick={() => handleEdit(index)}
                        aria-label="Edit link"
                        style={{
                          background: "none",
                          border: "none",
                          color: "#fff",
                          marginRight: 10,
                        }}
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        onClick={() => handleDelete(index)}
                        aria-label="Delete link"
                        style={{
                          background: "none",
                          border: "none",
                          color: "#FA3356",
                        }}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 10,
              marginTop: "auto",
            }}
          >
            <input
              type="text"
              name="name"
              placeholder="Enter name"
              value={newLink.name}
              onChange={handleInputChange}
              className="modal-input"
              style={{ marginBottom: 5 }}
            />
            <input
              type="url"
              name="url"
              placeholder="Enter URL"
              value={newLink.url}
              onChange={handleInputChange}
              className="modal-input"
              style={{ marginBottom: 5 }}
            />
            {errorMessage && (
              <span style={{ color: "#ff6b6b", fontSize: "0.9rem" }}>
                {errorMessage}
              </span>
            )}
            <button
              onClick={handleSubmit}
              disabled={
                !newLink.name || !newLink.url || Boolean(errorMessage)
              }
              style={{
                width: "100%",
                padding: 10,
                background: "#FA3356",
                color: "#fff",
                border: "none",
                opacity:
                  !newLink.name || !newLink.url || errorMessage ? 0.6 : 1,
                cursor:
                  !newLink.name || !newLink.url || errorMessage
                    ? "not-allowed"
                    : "pointer",
              }}
            >
              {editingIndex !== null ? "Save Changes" : "Add Link"}
            </button>
          </div>
        </Modal>
      </>
    );
  }
);

export default QuickLinksComponent;









