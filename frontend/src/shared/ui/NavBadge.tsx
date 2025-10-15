import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';

import { MICRO_WOBBLE_SCALE, SPRING_FAST } from './motionTokens';

interface NavBadgeProps {
  count: number;
  label: string;
  className?: string;
}

const NavBadge: React.FC<NavBadgeProps> = ({ count, label, className = 'nav-badge' }) => {
  const reduceMotion = useReducedMotion();
  if (count === 0) return null;

  const display = count > 99 ? '99+' : count;
  const ariaLabel = `${count} unread ${label}${count === 1 ? '' : 's'}`;

  return (
    <motion.span
      className={className}
      aria-label={ariaLabel}
      data-count={display}
      initial={reduceMotion ? false : { opacity: 0, scale: 0.9 }}
      animate={reduceMotion ? undefined : { opacity: 1, scale: 1 }}
      whileHover={reduceMotion ? undefined : { scale: MICRO_WOBBLE_SCALE }}
      whileFocus={reduceMotion ? undefined : { scale: MICRO_WOBBLE_SCALE }}
      transition={reduceMotion ? undefined : SPRING_FAST}
    >
      {display}
    </motion.span>
  );
};

export default NavBadge;








