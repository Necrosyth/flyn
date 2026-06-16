import { useEffect } from "react";
import Lenis from "lenis";

/**
 * Initialises Lenis smooth-scroll on the root <html> scroller.
 * Call once at the top level (e.g. App.tsx or Layout).
 *
 * - `lerp`   → lower = smoother / more "floaty" (0.06–0.12 is sweet spot)
 * - `duration` → seconds for scroll-to animations (anchor clicks, scrollTo)
 * - `smoothWheel` → interpolate wheel events for silky momentum
 * - `touchMultiplier` → keep touch/trackpad responsive
 */
export function useSmoothScroll() {
  useEffect(() => {
    const lenis = new Lenis({
      lerp: 0.08,            // interpolation factor — lower = silkier
      duration: 1.2,         // programmatic scroll duration (seconds)
      smoothWheel: true,     // smooth mouse-wheel scrolling
      touchMultiplier: 1.5,  // keep touch fast enough
      infinite: false,
      prevent: (node) => {
        if (!(node instanceof HTMLElement)) return false;
        return !!node.closest('[data-lenis-prevent]');
      },
    });

    // Drive Lenis on every animation frame
    function raf(time: number) {
      lenis.raf(time);
      requestAnimationFrame(raf);
    }
    requestAnimationFrame(raf);

    return () => {
      lenis.destroy();
    };
  }, []);
}
