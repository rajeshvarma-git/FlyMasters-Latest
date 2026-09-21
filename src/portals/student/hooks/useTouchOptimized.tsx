import { useState, useEffect, useCallback } from 'react';

interface TouchOptimizedSettings {
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  supportsTouch: boolean;
  orientation: 'portrait' | 'landscape';
}

export function useTouchOptimized(): TouchOptimizedSettings {
  const [settings, setSettings] = useState<TouchOptimizedSettings>({
    isMobile: false,
    isTablet: false,
    isDesktop: true,
    supportsTouch: false,
    orientation: 'landscape'
  });

  const updateSettings = useCallback(() => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const supportsTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

    setSettings({
      isMobile: width < 768,
      isTablet: width >= 768 && width < 1024,
      isDesktop: width >= 1024,
      supportsTouch,
      orientation: height > width ? 'portrait' : 'landscape'
    });
  }, []);

  useEffect(() => {
    updateSettings();
    
    window.addEventListener('resize', updateSettings);
    window.addEventListener('orientationchange', updateSettings);

    return () => {
      window.removeEventListener('resize', updateSettings);
      window.removeEventListener('orientationchange', updateSettings);
    };
  }, [updateSettings]);

  return settings;
}

// Hook for haptic feedback on mobile
export function useHaptic() {
  const vibrate = useCallback((pattern: number | number[] = 10) => {
    if ('vibrate' in navigator) {
      navigator.vibrate(pattern);
    }
  }, []);

  return { vibrate };
}

// Hook for safe area insets (for notched devices)
export function useSafeArea() {
  const [insets, setInsets] = useState({
    top: 0,
    right: 0,
    bottom: 0,
    left: 0
  });

  useEffect(() => {
    const updateInsets = () => {
      const computedStyle = getComputedStyle(document.documentElement);
      setInsets({
        top: parseInt(computedStyle.getPropertyValue('--sat') || '0'),
        right: parseInt(computedStyle.getPropertyValue('--sar') || '0'),
        bottom: parseInt(computedStyle.getPropertyValue('--sab') || '0'),
        left: parseInt(computedStyle.getPropertyValue('--sal') || '0')
      });
    };

    updateInsets();
    window.addEventListener('resize', updateInsets);
    return () => window.removeEventListener('resize', updateInsets);
  }, []);

  return insets;
}
