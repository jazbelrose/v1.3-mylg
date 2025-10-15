import React, { useEffect } from 'react';
import gsap from 'gsap';

import './single-ticker.css';
import tickerData from './sentences';

const SingleTicker: React.FC = () => {
  useEffect(() => {
    gsap.set('.single-ticker-text', { x: '0%' });
    const ticker = gsap.to('.single-ticker-text', {
      x: '-100%',
      duration: 5000,
      repeat: -1,
      ease: 'linear',
      paused: true,
    });

    ticker.play();
    return () => {
      ticker.kill();
    };
  }, []);

  return (
    <div className="single-ticker-container">
      <div className="single-ticker">
        <span className="single-ticker-text">
          {tickerData.sentences.join(' ')}
        </span>
      </div>
    </div>
  );
};

export default SingleTicker;









