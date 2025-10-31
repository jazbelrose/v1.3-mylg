import React from "react";
import { createPortal } from "react-dom";
import { Calendar, ChevronDown, MapPin, Plus, User, X } from "lucide-react";
import { motion } from "framer-motion";

import Map from "@/shared/ui/Map";

import styles from "../TasksComponentMobile.module.css";
import TaskList from "./TaskList";
import TaskSummary from "./TaskSummary";
import type { QuickTask, TaskMapMarker, TaskStats } from "./taskTypes";
import { buildDirectionsLinks } from "../utils";

type TaskDrawerProps = {
  open: boolean;
  isDesktop: boolean;
  viewportHeight: number;
  targetY: number;
  projectName?: string;
  mapLocation: { lat: number; lng: number };
  mapAddress: string;
  mapMarkers: TaskMapMarker[];
  mapFocus: { lat: number; lng: number } | null;
  mapStatusMessage: string;
  hasQuickCreateProject: boolean;
  loading: boolean;
  error: string | null;
  stats: TaskStats;
  formatValue: (value: number) => string | number;
  statusMessage: string;
  tasks: QuickTask[];
  activeTaskId: string | null;
  onTaskSelect: (taskId: string) => void;
  onTaskEdit: (taskId: string) => void;
  onTaskMarkDone: (taskId: string) => void;
  isTaskMarking: (taskId: string) => boolean;
  formatDueLabel: (task: QuickTask) => string;
  selectedTask: QuickTask | null;
  selectedAssigneeName: string | undefined;
  onMarkerClick: (markerId: string) => void;
  onClose: () => void;
  onOpenQuickCreate: () => void;
  onHandleClick: () => void;
  onTouchStart: (event: React.TouchEvent<HTMLDivElement>) => void;
  onTouchMove: (event: React.TouchEvent<HTMLDivElement>) => void;
  onTouchEnd: () => void;
  sheetRef: React.RefObject<HTMLDivElement>;
  taskListRef: React.RefObject<HTMLUListElement>;
};

const TaskDrawer: React.FC<TaskDrawerProps> = ({
  open,
  isDesktop,
  viewportHeight,
  targetY,
  projectName,
  mapLocation,
  mapAddress,
  mapMarkers,
  mapFocus,
  mapStatusMessage,
  hasQuickCreateProject,
  loading,
  error,
  stats,
  formatValue,
  statusMessage,
  tasks,
  activeTaskId,
  onTaskSelect,
  onTaskEdit,
  onTaskMarkDone,
  isTaskMarking,
  formatDueLabel,
  selectedTask,
  selectedAssigneeName,
  onMarkerClick,
  onClose,
  onOpenQuickCreate,
  onHandleClick,
  onTouchStart,
  onTouchMove,
  onTouchEnd,
  sheetRef,
  taskListRef,
}) => {
  if (!open || typeof document === "undefined") {
    return null;
  }

  const hasMapMarkers = mapMarkers.length > 0;
  const overlayClassName = isDesktop
    ? `${styles.sheetOverlay} ${styles.desktopOverlay}`
    : styles.sheetOverlay;
  const sheetClassName = isDesktop ? `${styles.sheet} ${styles.desktopSheet}` : styles.sheet;
  const drawerInitial = isDesktop ? { x: "-100%" } : { y: viewportHeight };
  const drawerAnimate = isDesktop ? { x: 0 } : { y: targetY };
  const drawerTransition = isDesktop
    ? { type: "spring", stiffness: 380, damping: 38, mass: 0.9 }
    : { type: "spring", stiffness: 360, damping: 42, mass: 0.9 };
  const selectedTaskDirections = selectedTask?.address ? buildDirectionsLinks(selectedTask.address) : null;

  return createPortal(
    <div className={overlayClassName} role="presentation">
      <div className={styles.mapLayer}>
        <div className={styles.mapCanvas}>
          <Map
            location={mapLocation}
            address={mapAddress}
            scrollWheelZoom={true}
            dragging={true}
            touchZoom={true}
            showUserLocation={false}
            markers={mapMarkers}
            onMarkerClick={onMarkerClick}
            focusLocation={mapFocus}
            focusZoom={15}
          />
        </div>
        <div className={styles.mapGradient} aria-hidden="true" />
        {!hasMapMarkers ? <div className={styles.mapEmptyBanner}>{mapStatusMessage}</div> : null}
        {selectedTask ? (
          <div className={styles.mapActiveCard}>
            <span className={styles.mapActiveTitle}>{selectedTask.title}</span>
            <div className={styles.mapActiveMeta}>
              <span className={styles.metaLine}>
                <Calendar size={14} aria-hidden="true" /> {formatDueLabel(selectedTask)}
              </span>
              {selectedTask.address ? (
                <span className={`${styles.metaLine} ${styles.metaLineAddress}`}>
                  <MapPin size={14} aria-hidden="true" />
                  <span className={styles.addressDetails}>
                    <span className={styles.addressText}>{selectedTask.address}</span>
                    {selectedTaskDirections ? (
                      <span className={styles.addressActions}>
                        <a
                          href={selectedTaskDirections.appleMaps}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={styles.addressLink}
                        >
                          Open in Maps
                        </a>
                        <span className={styles.addressLinkSeparator} aria-hidden="true">
                          •
                        </span>
                        <a
                          href={selectedTaskDirections.googleMaps}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={styles.addressLink}
                        >
                          Open in Google Maps
                        </a>
                      </span>
                    ) : null}
                  </span>
                </span>
              ) : null}
              {selectedAssigneeName ? (
                <span className={styles.metaLine}>
                  <User size={14} aria-hidden="true" /> Assigned to : {selectedAssigneeName}
                </span>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
      {!isDesktop ? (
        <>
          <button
            type="button"
            className={styles.sheetDismiss}
            onClick={onClose}
            aria-label="Close tasks drawer"
          >
            <ChevronDown size={20} strokeWidth={2.5} />
          </button>
          <button
            type="button"
            className={styles.sheetCreate}
            onClick={onOpenQuickCreate}
            aria-label="Quick create a task"
            disabled={loading || !hasQuickCreateProject}
          >
            <Plus size={20} strokeWidth={2.5} />
          </button>
        </>
      ) : null}
      <motion.div
        ref={sheetRef}
        className={sheetClassName}
        role="dialog"
        aria-modal="true"
        aria-label="Project tasks quick view"
        drag={false}
        initial={drawerInitial}
        animate={drawerAnimate}
        transition={drawerTransition}
      >
        {isDesktop ? (
          <>
            <header className={styles.desktopDrawerHeader}>
              <div className={styles.sheetTitleGroup}>
                <span className={styles.sheetTitle}>Project tasks</span>
                <span className={styles.sheetSubtitle}>
                  {projectName ? `Everything happening in ${projectName}` : "Keep work on track"}
                </span>
              </div>
              <div className={styles.desktopDrawerActions}>
                <button
                  type="button"
                  className={`${styles.desktopDrawerButton} ${styles.desktopDrawerGhostButton}`}
                  onClick={onClose}
                >
                  <X size={16} strokeWidth={2.25} aria-hidden="true" /> Close map
                </button>
                <button
                  type="button"
                  className={`${styles.desktopDrawerButton} ${styles.desktopDrawerPrimaryButton}`}
                  onClick={onOpenQuickCreate}
                  disabled={loading || !hasQuickCreateProject}
                >
                  <Plus size={16} strokeWidth={2.25} aria-hidden="true" /> New task
                </button>
              </div>
            </header>
            <div className={`${styles.sheetSummary} ${styles.desktopDrawerSummary}`}>
              <TaskSummary stats={stats} formatValue={formatValue} statusMessage={statusMessage} />
              <p className={styles.desktopDrawerMapStatus}>{mapStatusMessage}</p>
            </div>
          </>
        ) : (
          <>
            <div
              className={styles.sheetDragArea}
              role="button"
              tabIndex={0}
              aria-label="Toggle tasks drawer size"
              onClick={onHandleClick}
              onTouchStart={onTouchStart}
              onTouchMove={onTouchMove}
              onTouchEnd={onTouchEnd}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onHandleClick();
                }
              }}
            >
              <div className={styles.sheetHandle}>
                <span className={styles.sheetHandleBar} aria-hidden="true" />
              </div>
              <header className={styles.sheetHeader}>
                <div className={styles.sheetTitleGroup}>
                  <span className={styles.sheetTitle}>Project tasks</span>
                  <span className={styles.sheetSubtitle}>
                    {projectName ? `Everything happening in ${projectName}` : "Keep work on track"}
                  </span>
                </div>
              </header>
            </div>
            <div className={styles.sheetSummary}>
              <TaskSummary stats={stats} formatValue={formatValue} statusMessage={statusMessage} />
            </div>
          </>
        )}
        <div className={`${styles.sheetScrollArea} ${isDesktop ? styles.desktopDrawerScrollArea : ""}`}>
          <section className={styles.sheetSection} aria-label="All project tasks">
            <h3 className={styles.sectionHeading}>Task list</h3>
            {error ? (
              <div className={styles.error}>{error}</div>
            ) : loading ? (
              <div className={styles.loading}>Loading tasks…</div>
            ) : tasks.length ? (
              <TaskList
                tasks={tasks}
                activeTaskId={activeTaskId}
                onTaskSelect={onTaskSelect}
                onTaskEdit={onTaskEdit}
                onTaskMarkDone={onTaskMarkDone}
                isTaskMarking={isTaskMarking}
                formatDueLabel={formatDueLabel}
                taskListRef={taskListRef}
              />
            ) : (
              <div className={styles.empty}>No tasks yet. Create one to get started.</div>
            )}
          </section>
        </div>
      </motion.div>
    </div>,
    document.body,
  );
};

export default TaskDrawer;
