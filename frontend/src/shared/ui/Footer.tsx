import React from 'react';
import './footer.css';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faEnvelope, faPhone } from '@fortawesome/free-solid-svg-icons';

const Footer: React.FC = () => {
  return (
    <footer className="footer">
      <section className="footer__section">
        <h6 className="footer__heading">Services</h6>
        <ul className="footer__list">
          <li className="footer__list-item">
            <a href="#!" className="footer__link">
              Immersive Event Design
            </a>
          </li>
          <li className="footer__list-item">
            <a href="#!" className="footer__link">
              Expressive Digital Artistry
            </a>
          </li>
          <li className="footer__list-item">
            <a href="#!" className="footer__link">
              Strategic Branding
            </a>
          </li>
        </ul>
      </section>

      <section className="footer__section">
        <div className="footer__logo" />
        <p className="footer__description">
          Where innovative design meets advanced technology and creative vision. Explore our world of strategic
          branding, immersive event design, and expressive digital artistry.
        </p>
      </section>

      <section className="footer__section">
        <h6 className="footer__heading">Contact</h6>
        <ul className="footer__list">
          <li className="footer__list-item">
            <span className="footer__icon">🏠</span>
            Los Angeles, CA 90013, USA
          </li>
          <li className="footer__list-item">
            <span className="footer__icon">
              <FontAwesomeIcon icon={faEnvelope} />
            </span>
            info@mylg.com
          </li>
          <li className="footer__list-item">
            <span className="footer__icon">
              <FontAwesomeIcon icon={faPhone} />
            </span>
            +1 949-701-8836
          </li>
        </ul>
      </section>

      <div className="footer__bottom">© {new Date().getFullYear()} *MYLG!*.</div>
    </footer>
  );
};

export default Footer;









