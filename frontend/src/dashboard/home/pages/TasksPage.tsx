import React, { useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import GlobalTaskDrawer from "../components/GlobalTaskDrawer";

/**
 * TasksPage - Route wrapper for GlobalTaskDrawer
 * 
 * This component serves as a full-page route wrapper for the GlobalTaskDrawer component,
 * enabling it to be accessed via the /dashboard/tasks route while maintaining proper
 * navigation and state management.
 * 
 * Features:
 * - Renders GlobalTaskDrawer in open state
 * - Handles back navigation on close
 * - Supports project-scoped filtering via location.state.projectId
 * - Preserves return-to navigation via location.state.from
 */
const TasksPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  
  // Extract project filter, return path, and context from location state
  const projectId = (location.state as { projectId?: string })?.projectId;
  const returnPath = (location.state as { from?: string })?.from;
  const fromContext = (location.state as { fromContext?: string })?.fromContext;

  /**
   * Handle drawer close - navigate back to previous location or dashboard
   */
  const handleClose = useCallback(() => {
    if (returnPath) {
      // Navigate to the specific return path if provided
      navigate(returnPath, { replace: true });
    } else {
      // Fall back to browser history or dashboard
      if (window.history.length > 2) {
        navigate(-1);
      } else {
        navigate("/dashboard", { replace: true });
      }
    }
  }, [navigate, returnPath]);

  /**
   * Generate back button label based on navigation context
   */
  const backLabel = fromContext === "calendar" ? "Back to Calendar" : undefined;

  return (
    <GlobalTaskDrawer 
      open={true} 
      onClose={handleClose} 
      initialProjectFilter={projectId}
      fullPage={true}
      backLabel={backLabel}
    />
  );
};

export default TasksPage;
