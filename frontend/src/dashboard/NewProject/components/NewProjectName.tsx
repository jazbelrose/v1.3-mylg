import React, { ChangeEvent } from 'react';
import styles from './new-project-name.module.css';

interface NewProjectNameProps {
  projectName: string;
  setProjectName: (name: string) => void;
}

const NewProjectName: React.FC<NewProjectNameProps> = ({ projectName, setProjectName }) => {
  const handleProjectNameChange = (event: ChangeEvent<HTMLInputElement>) => {
    setProjectName(event.target.value);
  };

  return (
    <div className={styles.projectNameContainer}>
      <input
        type="text"
        value={projectName}
        onChange={handleProjectNameChange}
        placeholder="Name your project"
        className={styles.projectNameInput}
      />
    </div>
  );
};

export default NewProjectName;









