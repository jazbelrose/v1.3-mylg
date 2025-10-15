import React, { ChangeEvent } from 'react';
import styles from './new-project-finish-line.module.css';

interface NewProjectFinishLineProps {
  finishline: string;
  setFinishLine: (value: string) => void;
}

const NewProjectFinishline: React.FC<NewProjectFinishLineProps> = ({ finishline, setFinishLine }) => {
  const handleFinishLineChange = (e: ChangeEvent<HTMLInputElement>) => {
    setFinishLine(e.target.value);
  };

  const formatDisplayDate = (dateString: string) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric' 
    });
  };

  return (
    <div className={styles.finishLineContainer}>
      <div className={styles.dateInputWrapper}>
        <input
          type="date"
          value={finishline}
          onChange={handleFinishLineChange}
          className={styles.dateInput}
        />
        {finishline && (
          <div className={styles.dateDisplay}>
            Target: {formatDisplayDate(finishline)}
          </div>
        )}
        {!finishline && (
          <div className={styles.placeholder}>
            Set project deadline
          </div>
        )}
      </div>
    </div>
  );
};

export default NewProjectFinishline;









