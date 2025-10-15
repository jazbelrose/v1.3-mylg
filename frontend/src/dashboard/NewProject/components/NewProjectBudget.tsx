import React, { ChangeEvent } from 'react';
import styles from './new-project-budget.module.css';

interface NewProjectBudgetProps {
  budget: string;
  setBudget: (value: string) => void;
  style?: React.CSSProperties;
}

const NewProjectBudget: React.FC<NewProjectBudgetProps> = ({ budget, setBudget, style }) => {
  const handleBudgetChange = (event: ChangeEvent<HTMLInputElement>) => {
    setBudget(event.target.value);
  };

  return (
    <div className={styles.budgetContainer} style={style}>
      <div className={styles.currencyInputWrapper}>
        <span className={styles.currencyPrefix}>$</span>
        <input
          type="text"
          value={budget}
          onChange={handleBudgetChange}
          placeholder="Enter budget"
          className={styles.budgetInput}
        />
      </div>
    </div>
  );
};

export default NewProjectBudget;









