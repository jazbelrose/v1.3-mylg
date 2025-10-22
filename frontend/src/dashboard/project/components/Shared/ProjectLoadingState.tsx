import React from "react";
import Spinner from "@/shared/ui/Spinner";

const containerStyle: React.CSSProperties = {
  alignItems: "center",
  display: "flex",
  justifyContent: "center",
  minHeight: "40vh",
  padding: "2rem 0",
  width: "100%",
};

const ProjectLoadingState: React.FC = () => (
  <div style={containerStyle}>
    <Spinner />
  </div>
);

export default ProjectLoadingState;
