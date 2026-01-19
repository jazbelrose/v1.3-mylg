import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faXmark } from "@fortawesome/free-solid-svg-icons";
import { HexColorInput, HexColorPicker } from "react-colorful";
import { Pipette, Trash, Crown, MapPin, Check } from "lucide-react";

import type { Project } from "@/app/contexts/DataProvider";
import { generateSequentialPalette } from "@/shared/utils/colorUtils";
import Modal from "@/shared/ui/ModalWithStack";
import { updateProjectFields, NOMINATIM_SEARCH_URL, apiFetch } from "@/shared/utils/api";
import { useTeamMembers } from "../projectHeaderState/useTeamMembers";
import Map from "@/shared/ui/Map";

import styles from "./project-identity-modal.module.css";

import type {
  ColorModalState,
  DeleteConfirmationModalState,
  EditNameModalState,
  InvoiceInfoModalState,
  IdentityModalState,
} from "../projectHeaderTypes";

interface ProjectIdentityModalProps {
  modal: IdentityModalState;
  project: Project | null;
  editNameModal: EditNameModalState;
  colorModal: ColorModalState;
  invoiceInfoModal: InvoiceInfoModalState;
  deleteModal: DeleteConfirmationModalState;
  isAdmin: boolean;
  onProjectUpdate?: (updates: Partial<Project>) => void;
}

const DEFAULT_ACCENT = "#6e7bff";
const DEFAULT_ACCENT_RGB = "110, 123, 255";

/**
 * Collect text from a Lexical node tree recursively.
 * Handles text nodes, paragraphs, lists, tables, etc.
 */
function collectLexicalText(node: unknown): string {
  if (!node) return "";
  
  if (typeof node === "string") return node;
  
  if (Array.isArray(node)) {
    return node.map(collectLexicalText).filter(Boolean).join(" ");
  }
  
  if (typeof node !== "object") return "";
  
  const obj = node as Record<string, unknown>;
  const parts: string[] = [];
  
  // Handle text nodes
  if (typeof obj.text === "string") {
    parts.push(obj.text);
  }
  
  // Handle children (paragraphs, headings, etc.)
  if (Array.isArray(obj.children)) {
    parts.push(collectLexicalText(obj.children));
  }
  
  // Handle table rows
  if (Array.isArray(obj.rows)) {
    parts.push(collectLexicalText(obj.rows));
  }
  
  // Handle table cells
  if (Array.isArray(obj.cells)) {
    parts.push(collectLexicalText(obj.cells));
  }
  
  // Handle value property
  if (typeof obj.value === "string") {
    parts.push(obj.value);
  }
  
  return parts.filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}

/**
 * Extract plain text from a Lexical JSON description (legacy format).
 * If the string is not valid JSON or not a Lexical state, returns it as-is.
 */
function extractPlainTextFromDescription(description: string | undefined): string {
  if (!description) return "";
  
  const trimmed = description.trim();
  if (!trimmed) return "";
  
  // If it looks like JSON, try to parse it
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed);
      const root = (parsed as Record<string, unknown>).root ?? parsed;
      const text = collectLexicalText(root);
      if (text) return text;
    } catch {
      // Not valid JSON, continue below
    }
  }
  
  // Strip HTML tags if present
  return trimmed.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

interface NominatimResult {
  lat: string;
  lon: string;
  display_name?: string;
}

const ProjectIdentityModal = ({
  modal,
  project,
  editNameModal,
  colorModal,
  invoiceInfoModal,
  deleteModal,
  isAdmin,
  onProjectUpdate,
}: ProjectIdentityModalProps) => {
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [selectedOwnerId, setSelectedOwnerId] = useState<string>("");
  const [isUpdatingOwner, setIsUpdatingOwner] = useState(false);

  // Description state
  const [description, setDescription] = useState<string>("");
  
  // Basic info saving state (name + description together)
  const [isSavingBasicInfo, setIsSavingBasicInfo] = useState(false);
  const [basicInfoSaved, setBasicInfoSaved] = useState(false);

  // Address/Location state
  const [address, setAddress] = useState<string>("");
  const [location, setLocation] = useState<{ lat: number; lng: number }>({ lat: 34.0522, lng: -118.2437 });
  const [addressSearchQuery, setAddressSearchQuery] = useState<string>("");
  const [isSearchingAddress, setIsSearchingAddress] = useState(false);
  const [isSavingAddress, setIsSavingAddress] = useState(false);
  const [addressSaved, setAddressSaved] = useState(false);

  // Color saved state
  const [colorSaved, setColorSaved] = useState(false);

  // Ownership saved state
  const [ownershipSaved, setOwnershipSaved] = useState(false);

  const rawTeamMembers = useTeamMembers(project);
  
  // Deduplicate team members by userId
  const teamMembers = useMemo(() => {
    const seen = new Set<string>();
    return rawTeamMembers.filter(member => {
      if (seen.has(member.userId)) return false;
      seen.add(member.userId);
      return true;
    });
  }, [rawTeamMembers]);

  const resolvedProjectColor = useMemo(() => {
    const color = (project?.color as string | undefined) || "";
    return color && color.trim() ? color : DEFAULT_ACCENT;
  }, [project?.color]);

  // Initialize modal state when opening
  useEffect(() => {
    if (!modal.isOpen) return;

    const currentName = project?.title || "";
    if (editNameModal.updatedName !== currentName) {
      editNameModal.setUpdatedName(currentName);
    }

    // Initialize description - extract plain text from Lexical JSON if needed
    const rawDescription = (project?.description as string | undefined) || "";
    const plainDescription = extractPlainTextFromDescription(rawDescription);
    setDescription(plainDescription);

    // Initialize address and location
    const projectAddress = (project?.address as string | undefined) || "";
    setAddress(projectAddress);
    setAddressSearchQuery(projectAddress);
    
    const projectLocation = project?.location as { lat: number; lng: number } | undefined;
    if (projectLocation?.lat && projectLocation?.lng) {
      setLocation(projectLocation);
    } else {
      setLocation({ lat: 34.0522, lng: -118.2437 }); // Default to LA
    }

    const invoiceDefaults: InvoiceInfoModalState["fields"] = {
      invoiceBrandName: String(project?.invoiceBrandName ?? ""),
      invoiceBrandAddress: String(project?.invoiceBrandAddress ?? ""),
      invoiceBrandPhone: String(project?.invoiceBrandPhone ?? ""),
      clientName: String(project?.clientName ?? ""),
      clientAddress: String(project?.clientAddress ?? ""),
      clientPhone: String(project?.clientPhone ?? ""),
      clientEmail: String(project?.clientEmail ?? ""),
    };

    (Object.keys(invoiceDefaults) as Array<keyof InvoiceInfoModalState["fields"]>).forEach((key) => {
      const desired = invoiceDefaults[key];
      if (invoiceInfoModal.fields[key] !== desired) {
        invoiceInfoModal.setField(key, desired);
      }
    });

    // Only reset color when modal opens, not continuously
    colorModal.setSelectedColor(resolvedProjectColor);

    // Initialize owner selection
    setSelectedOwnerId(String(project?.ownerId || ""));

    setIsConfirmingDelete(false);
    
    // Reset saved states
    setBasicInfoSaved(false);
    setAddressSaved(false);
    setColorSaved(false);
    setOwnershipSaved(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modal.isOpen]); // Only run when modal opens/closes

  const accentStyles = useMemo(() => {
    const source = colorModal.selectedColor || resolvedProjectColor;
    const palette = generateSequentialPalette(source, 3);
    const start = palette[0] ?? source;
    const end = palette[palette.length - 1] ?? source;

    const rgbFromHex = (hex: string) => {
      const normalized = hex.replace("#", "");
      const value = parseInt(normalized, 16);
      const r = (value >> 16) & 255;
      const g = (value >> 8) & 255;
      const b = value & 255;
      return `${r}, ${g}, ${b}`;
    };

    const accentRgb = palette[1] ? rgbFromHex(palette[1] as string) : DEFAULT_ACCENT_RGB;

    return {
      "--settings-accent": source,
      "--settings-accent-rgb": accentRgb,
      "--settings-accent-gradient-start": start,
      "--settings-accent-gradient-end": end,
      "--settings-shadow-rgb": rgbFromHex(end),
    } as CSSProperties;
  }, [colorModal.selectedColor, resolvedProjectColor]);

  const baseProjectName = project?.title || "";
  const isNameDirty = editNameModal.updatedName.trim() !== baseProjectName.trim();

  const baseColor = resolvedProjectColor.toLowerCase();
  const selectedColor = (colorModal.selectedColor || resolvedProjectColor).toLowerCase();
  const isColorDirty = baseColor !== selectedColor;

  // Description dirty check
  const baseDescription = extractPlainTextFromDescription((project?.description as string | undefined) || "");
  const isDescriptionDirty = description.trim() !== baseDescription.trim();
  
  // Combined basic info dirty check
  const isBasicInfoDirty = isNameDirty || isDescriptionDirty;

  // Address dirty check
  const baseAddress = (project?.address as string | undefined) || "";
  const baseLocation = project?.location as { lat: number; lng: number } | undefined;
  const isAddressDirty = address.trim() !== baseAddress.trim() || 
    (baseLocation?.lat !== location.lat || baseLocation?.lng !== location.lng);

  const handleResetColor = useCallback(() => {
    colorModal.setSelectedColor(resolvedProjectColor);
  }, [colorModal, resolvedProjectColor]);

  const handleResetName = useCallback(() => {
    editNameModal.setUpdatedName(baseProjectName);
  }, [editNameModal, baseProjectName]);

  const handleResetDescription = useCallback(() => {
    setDescription(baseDescription);
  }, [baseDescription]);

  // Combined reset for basic info section
  const handleResetBasicInfo = useCallback(() => {
    handleResetName();
    handleResetDescription();
  }, [handleResetName, handleResetDescription]);

  // Combined save for basic info section (name + description)
  const handleSaveBasicInfo = useCallback(async () => {
    if (!project?.projectId || !isBasicInfoDirty || isSavingBasicInfo) return;
    
    try {
      setIsSavingBasicInfo(true);
      setBasicInfoSaved(false);
      const updates: Record<string, unknown> = {};
      
      if (isNameDirty) {
        updates.title = editNameModal.updatedName.trim();
      }
      if (isDescriptionDirty) {
        updates.description = description.trim();
      }
      
      await updateProjectFields(project.projectId, updates);
      
      // Update local state so UI reflects changes immediately
      onProjectUpdate?.(updates as Partial<Project>);
      
      setBasicInfoSaved(true);
      setTimeout(() => setBasicInfoSaved(false), 2500);
    } catch (error) {
      console.error("Failed to update project basic info", error);
    } finally {
      setIsSavingBasicInfo(false);
    }
  }, [project?.projectId, isBasicInfoDirty, isSavingBasicInfo, isNameDirty, isDescriptionDirty, editNameModal.updatedName, description, onProjectUpdate]);

  const handleResetAddress = useCallback(() => {
    setAddress(baseAddress);
    setAddressSearchQuery(baseAddress);
    if (baseLocation?.lat && baseLocation?.lng) {
      setLocation(baseLocation);
    }
  }, [baseAddress, baseLocation]);

  const handleSearchAddress = useCallback(async () => {
    if (!addressSearchQuery.trim() || isSearchingAddress) return;
    
    try {
      setIsSearchingAddress(true);
      const url = `${NOMINATIM_SEARCH_URL}${encodeURIComponent(addressSearchQuery)}`;
      const data = await apiFetch<NominatimResult[]>(url);
      if (data.length > 0) {
        const newLocation = { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
        setLocation(newLocation);
        setAddress(addressSearchQuery);
      }
    } catch (error) {
      console.error("Error searching address:", error);
    } finally {
      setIsSearchingAddress(false);
    }
  }, [addressSearchQuery, isSearchingAddress]);

  const handleSaveAddress = useCallback(async () => {
    if (!project?.projectId || !isAddressDirty || isSavingAddress) return;
    
    try {
      setIsSavingAddress(true);
      setAddressSaved(false);
      const updates = { 
        address: address.trim(),
        location: location
      };
      await updateProjectFields(project.projectId, updates);
      
      // Update local state so UI reflects changes immediately
      onProjectUpdate?.(updates);
      
      setAddressSaved(true);
      setTimeout(() => setAddressSaved(false), 2500);
    } catch (error) {
      console.error("Failed to update project address", error);
    } finally {
      setIsSavingAddress(false);
    }
  }, [project?.projectId, address, location, isAddressDirty, isSavingAddress, onProjectUpdate]);

  const handleConfirmDelete = useCallback(async () => {
    if (!isAdmin || isDeleting) return;
    try {
      setIsDeleting(true);
      await deleteModal.confirm();
      modal.close();
    } catch (error) {
      console.error("Failed to delete project", error);
    } finally {
      setIsDeleting(false);
    }
  }, [deleteModal, modal, isAdmin, isDeleting]);

  const handleClose = useCallback(() => {
    modal.close();
  }, [modal]);

  const handleUpdateOwnership = useCallback(async () => {
    if (!project?.projectId || !selectedOwnerId || isUpdatingOwner) return;
    
    try {
      setIsUpdatingOwner(true);
      setOwnershipSaved(false);
      await updateProjectFields(project.projectId, { ownerId: selectedOwnerId });
      
      // Update local state so UI reflects changes immediately
      onProjectUpdate?.({ ownerId: selectedOwnerId });
      
      setOwnershipSaved(true);
      setTimeout(() => setOwnershipSaved(false), 2500);
    } catch (error) {
      console.error("Failed to update project ownership", error);
    } finally {
      setIsUpdatingOwner(false);
    }
  }, [project?.projectId, selectedOwnerId, isUpdatingOwner, onProjectUpdate]);

  const currentOwnerId = project?.ownerId || "";
  const isOwnershipDirty = selectedOwnerId && selectedOwnerId !== currentOwnerId;

  const getOwnerDisplayName = (userId: string) => {
    const member = teamMembers.find(m => m.userId === userId);
    if (!member) return userId;
    const name = `${member.firstName || ""} ${member.lastName || ""}`.trim();
    return name || userId;
  };

  return (
    <Modal
      isOpen={modal.isOpen}
      onRequestClose={handleClose}
      contentLabel="Project Identity"
      closeTimeoutMS={300}
      className={{ base: "", afterOpen: "", beforeClose: "" }}
      overlayClassName={{
        base: styles.overlay,
        afterOpen: styles.overlay,
        beforeClose: styles.overlay,
      }}
    >
      <div className={styles.modal} style={accentStyles}>
        <header className={styles.header}>
          <div className={styles.headerText}>
            <h2 className={styles.title}>Project Identity</h2>
            <p className={styles.subtitle}>
              Customize how your project appears across the dashboard by updating its properties.<br />Update the project name and color accent that appear across dashboards and shared views.
            </p>
          </div>
          <button type="button" className={styles.closeButton} onClick={handleClose} aria-label="Close settings">
            <FontAwesomeIcon icon={faXmark} />
          </button>
        </header>

        <div className={styles.body}>
          {/* Basic Info Section */}
          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <h3 className={styles.sectionTitle}>Basic Information</h3>
              <p className={styles.sectionDescription}>
                Core project details visible across all dashboards and shared views.
              </p>
            </div>

            <div className={styles.formGrid}>
              {/* Project Name */}
              <div className={styles.formGroup}>
                <label className={styles.fieldLabel}>
                  <span className={styles.labelText}>Project Name</span>
                  <input
                    className={styles.textInput}
                    type="text"
                    value={editNameModal.updatedName}
                    onChange={(event) => editNameModal.setUpdatedName(event.target.value)}
                    placeholder="Enter project name"
                  />
                </label>
              </div>

              {/* Project Description */}
              <div className={styles.formGroup}>
                <label className={styles.fieldLabel}>
                  <span className={styles.labelText}>Description</span>
                  <textarea
                    className={styles.textArea}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Describe your project in a few words..."
                    rows={3}
                  />
                </label>
              </div>
            </div>
            
            <div className={styles.actionsRow}>
              <button
                type="button"
                className={basicInfoSaved ? styles.successButton : styles.primaryButton}
                onClick={handleSaveBasicInfo}
                disabled={!isBasicInfoDirty || isSavingBasicInfo}
              >
                {basicInfoSaved ? (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                    <Check size={16} /> Saved
                  </span>
                ) : isSavingBasicInfo ? "Saving..." : "Save changes"}
              </button>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={handleResetBasicInfo}
                disabled={!isBasicInfoDirty}
              >
                Reset
              </button>
            </div>
          </section>

          {/* Color Section */}
          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <h3 className={styles.sectionTitle}>Brand Color</h3>
              <p className={styles.sectionDescription}>
                Choose a color that represents your project across the dashboard.
              </p>
            </div>
            <div className={styles.colorPanel}>
              <div className={styles.colorPickerRow}>
                <HexColorPicker
                  color={colorModal.selectedColor || resolvedProjectColor}
                  onChange={colorModal.setSelectedColor}
                />
                <div className={styles.colorInputs}>
                  <HexColorInput
                    prefixed
                    color={colorModal.selectedColor || resolvedProjectColor}
                    onChange={colorModal.setSelectedColor}
                    className={styles.textInput}
                  />
                  <div className={styles.rgbText}>
                    RGB: {colorModal.hexToRgb(colorModal.selectedColor || resolvedProjectColor)}
                  </div>
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={colorModal.pickColorFromScreen}
                  >
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
                      <Pipette size={16} /> Pick from screen
                    </span>
                  </button>
                </div>
              </div>
              <div className={styles.actionsRow}>
                <button
                  type="button"
                  className={colorSaved ? styles.successButton : styles.primaryButton}
                  onClick={() => { colorModal.save(); setColorSaved(true); setTimeout(() => setColorSaved(false), 2500); }}
                  disabled={!isColorDirty}
                >
                  {colorSaved ? (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                      <Check size={16} /> Saved
                    </span>
                  ) : "Save color"}
                </button>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={handleResetColor}
                  disabled={!isColorDirty}
                >
                  Reset
                </button>
              </div>
            </div>
          </section>

          {/* Location Section */}
          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <h3 className={styles.sectionTitle}>
                <MapPin size={18} style={{ marginRight: 8, verticalAlign: "middle" }} />
                Project Location
              </h3>
              <p className={styles.sectionDescription}>
                Set the physical location or address for this project.
              </p>
            </div>
            <div className={styles.locationPanel}>
              <div className={styles.mapContainer}>
                <Map
                  location={location}
                  address={address}
                  scrollWheelZoom={true}
                  dragging={true}
                  touchZoom={true}
                  showUserLocation={false}
                />
              </div>
              <div className={styles.addressForm}>
                <div className={styles.addressInputRow}>
                  <input
                    type="text"
                    className={styles.textInput}
                    value={addressSearchQuery}
                    onChange={(e) => setAddressSearchQuery(e.target.value)}
                    placeholder="Search for an address..."
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleSearchAddress();
                      }
                    }}
                  />
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={handleSearchAddress}
                    disabled={isSearchingAddress}
                  >
                    {isSearchingAddress ? "Searching..." : "Search"}
                  </button>
                </div>
                {address && (
                  <p className={styles.currentAddress}>
                    <strong>Current:</strong> {address}
                  </p>
                )}
                <div className={styles.actionsRow}>
                  <button
                    type="button"
                    className={addressSaved ? styles.successButton : styles.primaryButton}
                    onClick={handleSaveAddress}
                    disabled={!isAddressDirty || isSavingAddress}
                  >
                    {addressSaved ? (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                        <Check size={16} /> Saved
                      </span>
                    ) : isSavingAddress ? "Saving..." : "Save location"}
                  </button>
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={handleResetAddress}
                    disabled={!isAddressDirty}
                  >
                    Reset
                  </button>
                </div>
              </div>
            </div>
          </section>

          {isAdmin && teamMembers.length > 0 && (
            <section className={styles.section}>
              <div className={styles.sectionHeader}>
                <h3 className={styles.sectionTitle}>Project Ownership</h3>
                <p className={styles.sectionDescription}>
                  Transfer project ownership to another team member. The owner has full control over the project.
                </p>
              </div>
              <div className={styles.inlineForm}>
                <label>
                  <span className={styles.sectionDescription}>Project owner</span>
                  <select
                    className={styles.textInput}
                    value={selectedOwnerId}
                    onChange={(e) => setSelectedOwnerId(e.target.value)}
                  >
                    {!currentOwnerId && <option value="">Select owner...</option>}
                    {teamMembers.map((member) => (
                      <option key={member.userId} value={member.userId}>
                        {getOwnerDisplayName(member.userId)}
                        {member.userId === currentOwnerId ? " (current)" : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <div className={styles.actionsRow}>
                  <button
                    type="button"
                    className={ownershipSaved ? styles.successButton : styles.primaryButton}
                    onClick={handleUpdateOwnership}
                    disabled={!isOwnershipDirty || isUpdatingOwner}
                  >
                    {ownershipSaved ? (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                        <Check size={16} /> Saved
                      </span>
                    ) : (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
                        <Crown size={18} />
                        {isUpdatingOwner ? "Updating..." : "Transfer ownership"}
                      </span>
                    )}
                  </button>
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={() => setSelectedOwnerId(String(currentOwnerId))}
                    disabled={!isOwnershipDirty || isUpdatingOwner}
                  >
                    Reset
                  </button>
                </div>
              </div>
            </section>
          )}

          {isAdmin && (
            <section className={styles.section}>
              <div className={styles.sectionHeader}>
                <h3 className={styles.sectionTitle}>Danger Zone</h3>
                <p className={styles.sectionDescription}>
                  Permanently delete this project and all associated data. This action cannot be undone.
                </p>
              </div>
              {!isConfirmingDelete ? (
                <button
                  type="button"
                  className={styles.destructiveButton}
                  onClick={() => setIsConfirmingDelete(true)}
                >
                  <span style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
                    <Trash size={18} /> Delete project
                  </span>
                </button>
              ) : (
                <div className={styles.deleteConfirm}>
                  <button
                    type="button"
                    className={styles.destructiveButton}
                    onClick={handleConfirmDelete}
                    disabled={isDeleting}
                  >
                    {isDeleting ? "Deleting…" : "Yes, delete project"}
                  </button>
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={() => {
                      if (!isDeleting) setIsConfirmingDelete(false);
                    }}
                    disabled={isDeleting}
                  >
                    Cancel
                  </button>
                </div>
              )}
            </section>
          )}
        </div>
        <div className={styles.footerShadow} aria-hidden="true" />
      </div>
    </Modal>
  );
};

export default ProjectIdentityModal;
