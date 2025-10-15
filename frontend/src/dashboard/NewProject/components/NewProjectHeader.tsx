import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowLeft } from '@fortawesome/free-solid-svg-icons';
import { useNavigate } from 'react-router-dom';

interface ProjectHeaderProps {
  activeProject?: unknown;
}

const ProjectHeader: React.FC<ProjectHeaderProps> = () => {
  const navigate = useNavigate();

  const handleDashboardHomeClick = () => {
    navigate('/dashboard');
  };

  return (
    <div>
      <div className="project-header new-project-header">
        <div className="header-content">
          <div className="left-side">
            <FontAwesomeIcon
              icon={faArrowLeft}
              className="back-icon interactive"
              onClick={handleDashboardHomeClick}
              title="Back to Dashboard"
              aria-label="Back to Dashboard"
              role="button"
              tabIndex={0}
            />
            <h2>Start something</h2>
          </div>
          <div className="right-side">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24.41 24.41"
              className="custom-icon"
              style={{ width: '20', height: '20', marginRight: '15px' }}
              onClick={handleDashboardHomeClick}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProjectHeader;









