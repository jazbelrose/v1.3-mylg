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

import styles from "./QuickLinksComponent.module.css";

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
          const linksWithIds = data.quickLinks.map((l) => (l.id ? l : { ...l, id: generateId() }));
          setLinks(linksWithIds);
        }
      } catch (err) {
        console.error("Error fetching quick links:", err);
        setError("Failed to fetch quick links.");
        toast.error("Failed to fetch quick links.");
      } finally {
        setLoading(false);
      }
    }, [apiUrl]);

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
      fetchQuickLinks();
    };

    const closeModal = () => {
      setIsModalOpen(false);
      setEditingIndex(null);
      setNewLink({ id: "", name: "", url: "" });
      setError("");
      setErrorMessage("");
    };

    useImperativeHandle(ref, () => ({ openModal }));

    const handleInputChange = (e: ChangeEvent<HTMLInputElement>): void => {
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
        await enqueueProjectUpdate(updateProjectFields, activeProject.projectId, {
          quickLinks: updatedLinks,
        });
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
        updated = [linkWithId, ...links];
      }

      setLinks(updated);
      await updateQuickLinksToAPI(updated);

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
            <span style={{ marginLeft: "auto", alignSelf: "flex-start" }}>&gt;</span>
          </div>
        )}

        <Modal
          isOpen={isModalOpen}
          onRequestClose={closeModal}
          contentLabel="Quick Links"
          shouldCloseOnOverlayClick
          shouldCloseOnEsc
          closeTimeoutMS={180}
          className={{
            base: styles.modal,
            afterOpen: styles.modalAfterOpen,
            beforeClose: styles.modalBeforeClose,
          }}
          overlayClassName={{
            base: styles.overlay,
            afterOpen: styles.overlayAfterOpen,
            beforeClose: styles.overlayBeforeClose,
          }}
        >
          {loading && <SpinnerOverlay />}

          <div className={styles.header}>
            <div className={styles.titleGroup}>
              <span className={styles.icon} aria-hidden>
                <Link2 size={18} />
              </span>
              <div className={styles.titleText}>
                <h3 className={styles.title}>Quick Links</h3>
                <p className={styles.subtitle}>Manage handy links for this project.</p>
              </div>
            </div>
            <button type="button" onClick={closeModal} aria-label="Close" className={styles.iconButton}>
              <X size={18} aria-hidden />
            </button>
          </div>

          <div className={styles.body}>
            {error ? (
              <div className={`${styles.statusBar} ${styles.statusError}`} role="alert">
                <span>{error}</span>
              </div>
            ) : null}

            {saving ? (
              <div className={`${styles.statusBar} ${styles.statusSaving}`} role="status">
                <span>Saving…</span>
              </div>
            ) : null}

            <div className={styles.list} aria-label="Quick links">
              {links.length === 0 ? (
                <div className={styles.emptyState}>No quick links yet. Add one below.</div>
              ) : (
                links.map((link, index) => (
                  <div key={link.id} className={styles.row}>
                    <a
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.rowLink}
                      title={link.url}
                    >
                      <span className={styles.rowLinkText}>{link.name}</span>
                    </a>
                    <div className={styles.rowActions}>
                      <button type="button" onClick={() => handleEdit(index)} aria-label="Edit link" className={styles.iconButton}>
                        <Pencil size={16} aria-hidden />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(index)}
                        aria-label="Delete link"
                        className={`${styles.iconButton} ${styles.iconButtonDanger}`}
                      >
                        <Trash2 size={16} aria-hidden />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className={styles.form} aria-label="Add quick link">
              <input
                type="text"
                name="name"
                placeholder="Link name"
                value={newLink.name}
                onChange={handleInputChange}
                className={styles.input}
                autoComplete="off"
              />
              <input
                type="url"
                name="url"
                placeholder="https://…"
                value={newLink.url}
                onChange={handleInputChange}
                className={styles.input}
                autoComplete="off"
              />

              {errorMessage ? <div className={styles.fieldError}>{errorMessage}</div> : null}

              <div className={styles.actions}>
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={!newLink.name || !newLink.url || Boolean(errorMessage) || saving}
                  className={styles.primaryButton}
                >
                  {editingIndex !== null ? "Save changes" : "Add link"}
                </button>
              </div>
            </div>
          </div>
        </Modal>
      </>
    );
  }
);

export default QuickLinksComponent;









