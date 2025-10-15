import React, { useEffect } from 'react';
import gsap from 'gsap';

const CounterComponent: React.FC = () => {
  useEffect(() => {
    function startLoader() {
      const counterElement = document.querySelector<HTMLHeadingElement>('.counter');
      if (!counterElement) return;

      let currentValue = 0;

      function updateCounter() {
        if (currentValue === 100) {
          return;
        }
        currentValue += Math.floor(Math.random() * 10) + 1;
        if (currentValue > 100) {
          currentValue = 100;
        }
        counterElement.textContent = currentValue.toString();
        const delay = Math.floor(Math.random() * 200) + 50;
        setTimeout(updateCounter, delay);
      }

      updateCounter();
    }

    startLoader();

    gsap.to('.counter', { duration: 0.25, delay: 3.5, opacity: 0 });
  }, []);

  return (
    <div>
      <h1 className="counter">0</h1>
    </div>
  );
};

export default CounterComponent;










