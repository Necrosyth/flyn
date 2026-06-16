// frontend/src/utils/device.ts
export function getDeviceType(): 'mobile' | 'tablet' | 'desktop' {
  const width = window.innerWidth;
  if (width < 768) return 'mobile';
  if (width < 1024) return 'tablet';
  return 'desktop';
}

export function getDeviceSize(device: 'mobile' | 'tablet' | 'desktop'): { width: number; height: number } {
  switch (device) {
    case 'mobile':
      return { width: 375, height: 812 };
    case 'tablet':
      return { width: 768, height: 1024 };
    case 'desktop':
      return { width: 1920, height: 1080 };
  }
}

export function isTouchDevice(): boolean {
  return (
    (typeof window !== 'undefined' &&
      ('ontouchstart' in window ||
        navigator.maxTouchPoints > 0)) ||
    false
  );
}
