import React from "react";
import { BottomSheet } from "@/shared/components/BottomSheet";
import OrgMessagesThread from "@/hq/components/OrgMessagesThread";
import styles from "./OrgChatSheet.module.css";

type OrgChatSheetProps = {
  isOpen: boolean;
  onClose: () => void;
  orgId: string | null;
  orgName?: string;
};

/**
 * Mobile chat bottom sheet for HQ org messages.
 * Wraps OrgMessagesThread in a BottomSheet for mobile experience.
 */
const OrgChatSheet: React.FC<OrgChatSheetProps> = ({
  isOpen,
  onClose,
  orgId,
  orgName,
}) => {
  if (!orgId) return null;

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      snapPoints={[92]}
      title={orgName ? `${orgName} Chat` : "HQ Chat"}
      contentClassName={styles.content}
      disableSwipeToDismiss
    >
      <div className={styles.threadWrap}>
        <OrgMessagesThread
          orgId={orgId}
          open
          setOpen={() => {/* managed by sheet */}}
          floating={false}
          setFloating={() => {/* not used in sheet mode */}}
          startDrag={() => {/* not draggable in sheet mode */}}
          onCloseChat={onClose}
        />
      </div>
    </BottomSheet>
  );
};

export default OrgChatSheet;
