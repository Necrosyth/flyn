// frontend/src/utils/device-detection.ts
export const BREAKPOINTS = {
  mobile: 0,
  tablet: 768,
  desktop: 1024,
  wide: 1280,
};

export function getResponsiveValue<T>(values: { mobile?: T; tablet?: T; desktop?: T; wide?: T }): T | undefined {
  const width = window.innerWidth;

  if (width >= BREAKPOINTS.wide) return values.wide;
  if (width >= BREAKPOINTS.desktop) return values.desktop;
  if (width >= BREAKPOINTS.tablet) return values.tablet;
  return values.mobile;
}

export function isResponsive(breakpoint: 'mobile' | 'tablet' | 'desktop' | 'wide'): boolean {
  const width = window.innerWidth;
  switch (breakpoint) {
    case 'mobile':
      return width < BREAKPOINTS.tablet;
    case 'tablet':
      return width >= BREAKPOINTS.tablet && width < BREAKPOINTS.desktop;
    case 'desktop':
      return width >= BREAKPOINTS.desktop && width < BREAKPOINTS.wide;
    case 'wide':
      return width >= BREAKPOINTS.wide;
  }
}
