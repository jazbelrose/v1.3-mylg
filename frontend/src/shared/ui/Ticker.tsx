import React, { useEffect, useRef } from 'react';
import gsap from 'gsap';

import './ticker.css';

interface TickerProps {
  lines: string[];
  fontSizes?: string[];
  padding?: string;
  scrollContainerRef?: React.RefObject<HTMLElement>;
}

const Ticker: React.FC<TickerProps> = ({
  lines,
  fontSizes = ['14vh', '12vh', '10vh'],
  padding,
  scrollContainerRef,
}) => {
  const lastScrollY = useRef(0);
  const lastScrollTime = useRef(Date.now());
  const smoothedVelocity = useRef(0);

  useEffect(() => {
    const tickers = [
      gsap.to('.ticker-text-1', {
        x: '-50%',
        duration: 480,
        repeat: -1,
        ease: 'linear',
        paused: true,
      }),
      gsap.to('.ticker-text-2', {
        x: '-50%',
        duration: 400,
        repeat: -1,
        ease: 'linear',
        paused: true,
      }),
      gsap.to('.ticker-text-3', {
        x: '-50%',
        duration: 440,
        repeat: -1,
        ease: 'linear',
        paused: true,
      }),
    ];

    const handleScroll = () => {
      const currentScrollY = scrollContainerRef?.current
        ? scrollContainerRef.current.scrollTop
        : window.scrollY;
      const currentTime = Date.now();
      const deltaScroll = currentScrollY - lastScrollY.current;
      const deltaTime = currentTime - lastScrollTime.current;
      const velocity = deltaTime > 0 ? deltaScroll / deltaTime : 0;
      smoothedVelocity.current += (velocity - smoothedVelocity.current) * 0.1;
      const newTimeScale = Math.min(1 + Math.abs(smoothedVelocity.current) * 10, 5);
      tickers.forEach((ticker) => {
        gsap.to(ticker, { timeScale: newTimeScale, duration: 0.2, ease: 'power1.out' });
      });
      lastScrollY.current = currentScrollY;
      lastScrollTime.current = currentTime;
    };

    const scrollableDiv = scrollContainerRef?.current;
    const scrollTarget: HTMLElement | Window = scrollableDiv || window;

    scrollTarget.addEventListener('scroll', handleScroll);
    tickers.forEach((ticker) => ticker.play());

    return () => {
      scrollTarget.removeEventListener('scroll', handleScroll);
      tickers.forEach((ticker) => ticker.kill());
    };
  }, [scrollContainerRef]);

  const repeatedContent = (baseText: string, times = 10) => Array(times).fill(baseText).join('');

  return (
    <div className="ticker-container">
      {lines.map((line, index) => (
        <div className="ticker" key={index}>
          <span
            className={`ticker-text ticker-text-${(index % 3) + 1}`}
            style={{ fontSize: fontSizes[index % fontSizes.length], padding }}
          >
            {repeatedContent(line)}
          </span>
        </div>
      ))}
    </div>
  );
};

export default Ticker;









