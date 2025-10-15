import React, { useState } from 'react';
import './infosection.css';
import { Introtext } from './IntroText';
import { ScrambleButton } from './ScrambleButton';
import Snap from '../../assets/svg/snap.svg?react';
import { NEWSLETTER_SUBSCRIBE_URL, apiFetch } from '../utils/api';

interface InfoSectionProps {
  style?: React.CSSProperties;
}

export const InfoSection: React.FC<InfoSectionProps> = ({ style }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);

  const handleNewsletterSignup = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const emailInput = form.elements.namedItem('email') as HTMLInputElement | null;
    const email = emailInput?.value ?? '';
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) {
      alert('Hmm, that doesn’t look right—try email@site.com');
      return;
    }

    const userData = { email };
    setIsLoading(true);
    setIsSubscribed(false);
    try {
      await apiFetch(NEWSLETTER_SUBSCRIBE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(userData),
      });
      console.log('Subscription successful');
      setIsSubscribed(true);
      form.reset();
      setTimeout(() => setIsSubscribed(false), 3000);
    } catch (error) {
      console.error('Newsletter signup error:', error);
      alert('There was an error with your subscription. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="info-section" style={style}>
      <div className="info-column first-column">
        <div className="content-container">
          <div className="info-club">
            <h3 className="club-title">JOIN THE CLUB</h3>
          </div>
          <p className="club-description">
            READY TO PITCH A GAME-CHANGER OR TAKE OVER THE WORLD? WE'RE THE JAM TO YOUR TOAST!
          </p>
          <form className="newsletter" onSubmit={handleNewsletterSignup}>
            <input
              className="email-input"
              type="email"
              name="email"
              placeholder="Your Email Address"
              aria-label="Email Address"
            />
            <ScrambleButton
              className="touch-btn-subscribe"
              submitMode
              disabled={isLoading || isSubscribed}
              text={
                isSubscribed ? (
                  <span className="checkmark">✔</span>
                ) : isLoading ? (
                  <div className="dot-spinner">
                    <div />
                    <div />
                    <div />
                  </div>
                ) : (
                  'Subscribe'
                )
              }
            />
          </form>
        </div>
      </div>
      <div className="info-column second-column">
        <div className="info-introtext">
          <Introtext />
        </div>
        <ScrambleButton text="Get in Touch →" to="mailto:info@mylg.studio.com" className="touch-btn" />
      </div>
      <div className="info-column third-column">
        <div className="content-container">
          <div className="info-address">
            <p className="address-text">
              400 S Broadway
              <br />
              LOS ANGELES
              <br />
              17 rue Barrault
              <br />
              PARIS
              <br />
              <span className="phone-number">+1 310.002.4217</span>
            </p>
            <Snap className="address-svg" />
          </div>
        </div>
      </div>
    </div>
  );
};

export default InfoSection;









