/**
 * OrgFilesOverlay - Organization-scoped file manager overlay
 *
 * Uses FileManagerV2 with orgId prop for full feature parity with project file manager.
 * Includes: PDF preview, sidebars, Quick Look, inspector panel, drag & drop, etc.
 */

import React from "react";
import FileManagerV2 from "@/dashboard/project/components/FileManager/FileManagerV2";

interface OrgFilesOverlayProps {
  orgId: string;
  onClose: () => void;
}

const OrgFilesOverlay: React.FC<OrgFilesOverlayProps> = ({ orgId, onClose }) => {
  return (
    <FileManagerV2
      orgId={orgId}
      isOpen={true}
      onRequestClose={onClose}
      showTrigger={false}
      folder="uploads"
      displayName="Organization Files"
    />
  );
};

export default OrgFilesOverlay;
