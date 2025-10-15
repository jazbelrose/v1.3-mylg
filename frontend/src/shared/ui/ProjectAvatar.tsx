import React from 'react';
import SVGThumbnail from '../../dashboard/home/components/SvgThumbnail';
import { getFileUrl } from '../utils/api';
import Squircle from './Squircle';
import './project-avatar.css';

interface ProjectAvatarProps {
  thumb?: string;
  name?: string;
  initial?: string;
  className?: string;
  radius?: number;
  shape?: 'squircle' | 'circle';
}

const DEFAULT_RADIUS = 10;

const ProjectAvatar: React.FC<ProjectAvatarProps> = ({
  thumb,
  name = '',
  initial = '',
  className = '',
  radius = DEFAULT_RADIUS,
  shape = 'squircle',
}) => {
  const wrapperClassName =
    ['project-avatar', className, shape === 'circle' ? 'project-avatar--circle' : null]
      .filter(Boolean)
      .join(' ')
      .trim() || undefined;
  const displayInitial = (initial || name.charAt(0)).toUpperCase() || '#';
  const content = thumb ? (
    <img
      src={getFileUrl(thumb)}
      alt={name}
      className="project-avatar__media"
    />
  ) : (
    <SVGThumbnail
      initial={displayInitial}
      className="project-avatar__media"
    />
  );

  if (shape === 'circle') {
    return (
      <span className={wrapperClassName} aria-hidden={!name && !initial}>
        {content}
      </span>
    );
  }

  return (
    <Squircle as="span" className={wrapperClassName} radius={radius} aria-hidden={!name && !initial}>
      {content}
    </Squircle>
  );
};

export default ProjectAvatar;















