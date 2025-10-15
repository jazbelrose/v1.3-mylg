import React from 'react';
import { Link } from 'react-router-dom';
import { getFileUrl } from '../utils/api';

import './portfolio-card.css';
import CustomIcon from '../../assets/svg/angled-arrow.svg?react';

interface PortfolioCardProps {
  linkUrl: string;
  imageSrc: string;
  imageAlt: string;
  title: string;
  subtitle: string;
  description: string;
  className?: string;
}

const PortfolioCard: React.FC<PortfolioCardProps> = ({
  linkUrl,
  imageSrc,
  imageAlt,
  title,
  subtitle,
  description,
  className = '',
}) => {
  const resolvedSrc = imageSrc.startsWith('http') ? imageSrc : getFileUrl(imageSrc);

  return (
    <Link to={linkUrl} className={`portfolio-card ${className}`}>
      <img src={resolvedSrc} alt={imageAlt} className="card-image" />
      <div className="top-left title">
        <h3 className="title">{title}</h3>
        <h3 className="subtitle">{subtitle}</h3>
      </div>
      <div className="bottom-left description">
        <span className="portfolio-description">{description}</span>
      </div>
      <div className="custom-icon-container">
        <CustomIcon />
      </div>
    </Link>
  );
};

export default PortfolioCard;









