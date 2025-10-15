import React, { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { ScrambleButton } from './ScrambleButton';
import HomeHeader from '../../assets/svg/homeheader.svg?react';
import './hero-section.css';

export const HeroSection: React.FC = () => {
  const headerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const masterTimeline = gsap.timeline();

    const svgRef = headerRef.current?.querySelector<SVGSVGElement>('svg');
    if (svgRef) {
      masterTimeline.fromTo(
        svgRef.querySelectorAll<SVGElement>('.arrow'),
        { scale: 0.8, opacity: 0 },
        { scale: 1, opacity: 1, delay: 0.1, duration: 0.6, stagger: 0.05, ease: 'Power2.easeOut' }
      );

      const svgText = svgRef.querySelector<SVGElement>('.hero-text');
      if (svgText) {
        masterTimeline.fromTo(
          svgText,
          { scale: 0.95, opacity: 0 },
          { scale: 1, opacity: 1, duration: 0.8, ease: 'Power1.easeOut' },
          '-=0.4'
        );
      }

      masterTimeline.fromTo(
        '.sub-heading',
        { opacity: 0, y: 30 },
        { opacity: 1, y: 0, duration: 0.7, ease: 'power2.out' },
        '-=0.3'
      );

      masterTimeline.fromTo(
        '.hero-button-container',
        { opacity: 0, y: 30 },
        { opacity: 1, y: 0, duration: 0.7, ease: 'power2.out' },
        '-=0.3'
      );
    }
  }, []);

  return (
    <div className="herosection-container">
      <div
        className="header-section"
        style={{ backgroundColor: '#0c0c0c', maxWidth: '1920px', margin: '0 auto' }}
        ref={headerRef}
      >
        <HomeHeader />
      </div>
      <div className="video-wrapper" style={{ maxWidth: '1920px', margin: '0 auto' }}>
        <div className="info-text">
          <h4 className="sub-heading">
            We help you present your ideas digitally and execute them flawlessly in real life.
          </h4>
          <div className="hero-button-container">
            <ScrambleButton text="Register →" to="/register" />
          </div>
        </div>
      </div>
    </div>
  );
};

export default HeroSection;








