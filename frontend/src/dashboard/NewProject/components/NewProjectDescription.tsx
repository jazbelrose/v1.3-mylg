import React, { useCallback } from "react";
import styles from "./new-project-description.module.css";

interface NewProjectDescriptionProps {
  description: string;
  setDescription: (value: string, plainText: string) => void;
}

const PLACEHOLDER = "Describe your project in a few words";

const NewProjectDescription: React.FC<NewProjectDescriptionProps> = ({
  description,
  setDescription,
}) => {
  const handleChange = useCallback(
    (event: React.ChangeEvent<HTMLTextAreaElement>) => {
      const value = event.target.value;
      setDescription(value, value);
    },
    [setDescription]
  );

  return (
    <div className={styles.descriptionContainer}>
      <textarea
        id="new-project-description"
        className={styles.descriptionTextarea}
        value={description}
        onChange={handleChange}
        placeholder={PLACEHOLDER}
        aria-label="Project description"
        spellCheck
      />
    </div>
  );
};

export default NewProjectDescription;
