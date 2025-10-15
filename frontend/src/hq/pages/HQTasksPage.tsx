import React, { useState } from "react";
import HQLayout from "../components/HQLayout";
import TasksOverviewCard from "@/dashboard/home/components/TasksOverviewCard";
import styles from "./HQTasksPage.module.css";

const HQTasksPage: React.FC = () => {
  const [showMap, setShowMap] = useState(false);

  return (
    <HQLayout
      title="HQ tasks"
      description="Action items tied to company operations. Syncs with the core Tasks module but scoped to internal work."
    >
      <div className={styles.page}>
        <label className={styles.mapToggle}>
          <input
            type="checkbox"
            checked={showMap}
            onChange={(event) => setShowMap(event.target.checked)}
          />
          Show geo map for vendor tasks
        </label>

        <TasksOverviewCard className={styles.tasksWidget} />

        {showMap ? (
          <div className={styles.mapPlaceholder} role="img" aria-label="Map preview placeholder">
            Map is optional and can be integrated with geo tasks.
          </div>
        ) : null}
      </div>
    </HQLayout>
  );
};

export default HQTasksPage;
