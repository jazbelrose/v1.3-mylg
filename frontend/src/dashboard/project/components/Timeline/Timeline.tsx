import React from "react";
import Modal from "@/shared/ui/ModalWithStack";
import { useData } from "@/app/contexts/useData";
import { useSocket } from "@/app/contexts/useSocket";
import styles from "@/dashboard/home/components/finish-line-component.module.css";
import { enqueueProjectUpdate } from "@/shared/utils/requestQueue";
import type { Project } from "@/app/contexts/DataProvider";

type ActiveProject = Project & {
  status: string;
  milestoneTitles?: string[];
};

type TimelineProps = {
  parseStatusToNumber: (status: string) => number;
  activeProject: ActiveProject | null | undefined;
  onActiveProjectChange?: (p: ActiveProject) => void;
};

const defaultTitles = [
  "Project Initiation",
  "Concept Approval",
  "First Draft\nCompletion",
  "Review and\nFeedback",
  "Revisions and\nModifications",
  "Final Review\nand Approval",
  "Project Closure\nand Delivery",
];

type BaseMilestone = {
  threshold: number;
  id: string;
  dataName: string;
};

const baseMilestones: BaseMilestone[] = [
  { threshold: 10, id: "Project_Initiation", dataName: "Project Initiation" },
  { threshold: 20, id: "Concept_Approval", dataName: "Concept Approval" },
  {
    threshold: 40,
    id: "First_Draft_Completion",
    dataName: "First Draft Completion",
  },
  {
    threshold: 60,
    id: "Review_and_Feedback",
    dataName: "Review and Feedback",
  },
  {
    threshold: 80,
    id: "Revisions_and_Modifications",
    dataName: "Revisions and Modifications",
  },
  {
    threshold: 90,
    id: "Final_Review_and_Approval",
    dataName: "Final Review and Approval",
  },
  {
    threshold: 100,
    id: "Project_Closure_and_Delivery",
    dataName: "Project Closure and Delivery",
  },
];

const Timeline: React.FC<TimelineProps> = ({
  parseStatusToNumber,
  activeProject,
  onActiveProjectChange,
}) => {
  const { updateProjectFields, setActiveProject, user } = useData();
  const { ws } = useSocket();

  const [saving, setSaving] = React.useState(false);
  const [editingMilestoneIndex, setEditingMilestoneIndex] = React.useState<number | null>(null);
  const [updatedMilestoneTitles, setUpdatedMilestoneTitles] = React.useState<string[]>(
    activeProject?.milestoneTitles ?? defaultTitles
  );

  React.useEffect(() => {
    setUpdatedMilestoneTitles(activeProject?.milestoneTitles ?? defaultTitles);
  }, [activeProject]);

  const progress = activeProject ? parseStatusToNumber(activeProject.status) : 0;

  const milestoneTitles = defaultTitles.map(
    (t, i) => updatedMilestoneTitles[i] ?? t
  );

  const milestones = baseMilestones.map((m, i) => ({
    ...m,
    label: milestoneTitles[i].split("\n"),
  }));

  const activeIndex = milestones.findIndex((m) => progress < m.threshold);

  const handleUpdateMilestoneTitle = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!activeProject) return;

    const idx = editingMilestoneIndex;
    if (
      idx === null ||
      (activeProject.milestoneTitles ?? defaultTitles)[idx] === updatedMilestoneTitles[idx]
    ) {
      setEditingMilestoneIndex(null);
      return;
    }

    try {
      setSaving(true);

      await enqueueProjectUpdate(
        updateProjectFields,
        activeProject.projectId,
        { milestoneTitles: updatedMilestoneTitles }
      );

      const updatedProject: ActiveProject = {
        ...activeProject,
        milestoneTitles: updatedMilestoneTitles,
      };

      onActiveProjectChange?.(updatedProject);
      setActiveProject(updatedProject);

      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(
          JSON.stringify({
            action: "projectUpdated",
            projectId: activeProject.projectId,
            title: activeProject.title,
            fields: { milestoneTitles: updatedMilestoneTitles },
            conversationId: `project#${activeProject.projectId}`,
            username: user?.firstName || "Someone",
            senderId: user?.userId,
          })
        );
      }
    } catch (err) {
       
      console.error("Error updating milestone titles:", err);
    } finally {
      setEditingMilestoneIndex(null);
      setSaving(false);
    }
  };

  return (
    <>
      {saving && (
        <div style={{ color: "#FA3356", marginBottom: 10 }}>Saving...</div>
      )}

      <div className="timeline-container">
        <div
          className="timeline-track"
          role="list"
          aria-label="Timeline of project milestones"
        >
          {milestones.map((m, i) => {
            const status =
              progress >= m.threshold
                ? "passed"
                : activeIndex === i
                ? "active"
                : "upcoming";

            return (
              <div
                key={m.id}
                id={m.id}
                data-name={m.dataName}
                className={`milestone-pill ${status}`}
                role="listitem"
                tabIndex={0}
                onClick={(ev) => {
                  (ev.currentTarget as HTMLDivElement).blur();
                  setEditingMilestoneIndex(i);
                }}
                onKeyDown={(ev) => {
                  if (ev.key === "Enter" || ev.key === " ") {
                    ev.preventDefault();
                    (ev.currentTarget as HTMLDivElement).blur();
                    setEditingMilestoneIndex(i);
                  }
                }}
              >
                <span className="label">
                  {m.label.map((line: string, lineIdx: number) => (
                    <React.Fragment key={lineIdx}>
                      {line}
                      {lineIdx < m.label.length - 1 && <br />}
                    </React.Fragment>
                  ))}
                </span>
                <span className={`percentage-pill ${status}`}>{`${m.threshold}%`}</span>
              </div>
            );
          })}
        </div>

        <Modal
          isOpen={editingMilestoneIndex !== null}
          onRequestClose={() => setEditingMilestoneIndex(null)}
          contentLabel="Edit Milestone Title"
          closeTimeoutMS={300}
          className={{
            base: styles.modalContent,
            afterOpen: styles.modalContentAfterOpen,
            beforeClose: styles.modalContentBeforeClose,
          }}
          overlayClassName={styles.modalOverlay}
        >
          <h4 className={styles.modalTitle}>Edit Milestone Title</h4>

          {editingMilestoneIndex !== null && (
            <form className={styles.modalForm} onSubmit={handleUpdateMilestoneTitle}>
              <div className={styles.field}>
                <label className={styles.label}>
                  {`Milestone ${editingMilestoneIndex + 1}`}
                </label>
                <input
                  className={styles.input}
                  type="text"
                  value={updatedMilestoneTitles[editingMilestoneIndex]}
                  onChange={(ev) => {
                    const arr = [...updatedMilestoneTitles];
                    arr[editingMilestoneIndex] = ev.target.value;
                    setUpdatedMilestoneTitles(arr);
                  }}
                />
              </div>

              <div className={styles.buttonRow}>
                <button className={styles.button} type="submit">
                  Save
                </button>
                <button
                  className={styles.button}
                  type="button"
                  onClick={() => setEditingMilestoneIndex(null)}
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </Modal>
      </div>
    </>
  );
};

export default Timeline;












