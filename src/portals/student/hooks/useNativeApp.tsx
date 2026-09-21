import { useState, useEffect } from 'react';
import { Capacitor } from '@capacitor/core';

export function useNativeApp() {
  const [isNative, setIsNative] = useState(false);
  const [platform, setPlatform] = useState<'ios' | 'android' | 'web'>('web');

  useEffect(() => {
    const native = Capacitor.isNativePlatform();
    setIsNative(native);
    setPlatform(Capacitor.getPlatform() as 'ios' | 'android' | 'web');
  }, []);

  return { isNative, platform, isIOS: platform === 'ios', isAndroid: platform === 'android' };
}

export function useIsStandalone() {
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    const check = () => {
      const standalone =
        window.matchMedia('(display-mode: standalone)').matches ||
        (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
      setIsStandalone(standalone);
    };
    check();
    window.matchMedia('(display-mode: standalone)').addEventListener('change', check);
    return () => window.matchMedia('(display-mode: standalone)').removeEventListener('change', check);
  }, []);

  return isStandalone;
}
