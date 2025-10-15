import React from 'react';
import styles from './new-project-description.module.css';

interface NewProjectDescriptionProps {
  description: string;
  setDescription: (value: string) => void;
}

const NewProjectDescription: React.FC<NewProjectDescriptionProps> = ({ description, setDescription }) => {

  const handleDescriptionChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setDescription(e.target.value);
  };

  return (
    <div className={styles.descriptionContainer}>
      <textarea
        value={description}
        onChange={handleDescriptionChange}
        placeholder="Describe your project in a few words"
        className={styles.descriptionTextarea}
        rows={4}
      />
    </div>
  );
};

export default NewProjectDescription;









