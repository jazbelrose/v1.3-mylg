import type { Spring } from 'framer-motion';

export const SPRING_FAST: Spring = Object.freeze({
  type: 'spring',
  stiffness: 340,
  damping: 28,
  mass: 0.9,
});

export const SPRING_SOFT: Spring = Object.freeze({
  type: 'spring',
  stiffness: 220,
  damping: 24,
  mass: 1.1,
});

export const MICRO_WOBBLE_SCALE = 1.03;

export const getMicroHoverScale = (
  prefersReducedMotion: boolean,
  scale: number = MICRO_WOBBLE_SCALE,
) => (prefersReducedMotion ? undefined : { scale });

export const getMicroTransition = (
  prefersReducedMotion: boolean,
  spring: Spring = SPRING_FAST,
) => (prefersReducedMotion ? undefined : spring);









