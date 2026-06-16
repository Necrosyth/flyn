/**
 * FLYN Animation System
 * ----------------------
 * Centralized animation constants and utilities.
 * 
 * RULES:
 *  • GSAP → Scroll-driven animations (Landing), page enter/exit, coordinated sequences
 *  • Framer Motion → Layout shifts, AnimatePresence, gesture interactions (drag, hover)
 *  • Never mix both on the same DOM element
 */

// ============================================================================
// DURATION PRESETS
// ============================================================================

export const DURATION = {
  instant: 0.1,
  fast: 0.2,
  normal: 0.3,
  slow: 0.5,
  page: 0.4,
} as const;

// ============================================================================
// EASING PRESETS
// ============================================================================

export const EASE = {
  /** Default ease — smooth deceleration */
  default: [0.4, 0, 0.2, 1] as [number, number, number, number],
  /** Enter — starts fast, settles gently */
  enter: [0, 0, 0.2, 1] as [number, number, number, number],
  /** Exit — gentle start, fast end */
  exit: [0.4, 0, 1, 1] as [number, number, number, number],
  /** Bounce — subtle spring overshoot */
  spring: [0.34, 1.56, 0.64, 1] as [number, number, number, number],
} as const;

/** GSAP easing strings */
export const GSAP_EASE = {
  default: 'power2.out',
  enter: 'power3.out',
  exit: 'power2.in',
  smooth: 'power2.inOut',
  bounce: 'back.out(1.4)',
} as const;

// ============================================================================
// FRAMER MOTION VARIANTS
// ============================================================================

/** Standard page-level fade in */
export const pageVariants = {
  initial: { opacity: 0, y: 8 },
  animate: { 
    opacity: 1, 
    y: 0,
    transition: { duration: DURATION.page, ease: EASE.enter },
  },
  exit: { 
    opacity: 0, 
    y: -4,
    transition: { duration: DURATION.fast, ease: EASE.exit },
  },
};

/** Container with staggered children */
export const staggerContainer = (staggerDelay = 0.06) => ({
  initial: {},
  animate: {
    transition: {
      staggerChildren: staggerDelay,
      delayChildren: 0.1,
    },
  },
});

/** Individual stagger child — fade + slide up */
export const staggerItem = {
  initial: { opacity: 0, y: 12 },
  animate: { 
    opacity: 1, 
    y: 0,
    transition: { duration: DURATION.normal, ease: EASE.enter },
  },
};

/** Sidebar animation constants */
export const SIDEBAR = {
  expandedWidth: 264,
  collapsedWidth: 72,
  duration: 0.18,
  ease: EASE.default,
} as const;

/** Slide in from right (panels, drawers) */
export const slideInRight = {
  initial: { x: 300, opacity: 0 },
  animate: { 
    x: 0, 
    opacity: 1,
    transition: { duration: DURATION.normal, ease: EASE.enter },
  },
  exit: { 
    x: 300, 
    opacity: 0,
    transition: { duration: DURATION.fast, ease: EASE.exit },
  },
};

/** Scale in (modals, cards) */
export const scaleIn = {
  initial: { scale: 0.95, opacity: 0 },
  animate: { 
    scale: 1, 
    opacity: 1,
    transition: { duration: DURATION.normal, ease: EASE.enter },
  },
  exit: { 
    scale: 0.95, 
    opacity: 0,
    transition: { duration: DURATION.fast, ease: EASE.exit },
  },
};

// ============================================================================
// GSAP UTILITIES
// ============================================================================

/**
 * Creates GSAP ScrollTrigger defaults for section reveals.
 * Use with useGSAP hook.
 */
export const scrollRevealDefaults = {
  start: 'top 85%',
  end: 'bottom 15%',
  toggleActions: 'play none none reverse',
} as const;

/**
 * Standard GSAP "from" values for scroll-triggered section reveals.
 */
export const gsapRevealFrom = {
  opacity: 0,
  y: 40,
  duration: 0.6,
  ease: GSAP_EASE.enter,
} as const;

/**
 * Standard GSAP stagger config for grid/list children.
 */
export const gsapStagger = (amount = 0.08) => ({
  each: amount,
  ease: 'power1.inOut',
});
