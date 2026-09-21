import { useState, useEffect } from 'react';

interface UseOptimizedImageProps {
  src: string;
  useThumbnail?: boolean;
}

/**
 * Hook to handle optimized image loading
 * Automatically switches between thumbnail and full image based on usage
 */
export function useOptimizedImage({ src, useThumbnail = false }: UseOptimizedImageProps) {
  const [imageSrc, setImageSrc] = useState<string>(src);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    setIsLoading(true);
    setError(null);

    // Determine which image to use
    const targetSrc = useThumbnail ? getThumbnailUrl(src) : src;
    
    // Preload image
    const img = new Image();
    
    img.onload = () => {
      setImageSrc(targetSrc);
      setIsLoading(false);
    };

    img.onerror = () => {
      // Fallback to original if thumbnail fails
      if (useThumbnail) {
        const fallbackImg = new Image();
        fallbackImg.onload = () => {
          setImageSrc(src);
          setIsLoading(false);
        };
        fallbackImg.onerror = () => {
          setError(new Error('Failed to load image'));
          setIsLoading(false);
        };
        fallbackImg.src = src;
      } else {
        setError(new Error('Failed to load image'));
        setIsLoading(false);
      }
    };

    img.src = targetSrc;
  }, [src, useThumbnail]);

  return { src: imageSrc, isLoading, error };
}

/**
 * Get thumbnail URL from full image URL
 */
function getThumbnailUrl(fullUrl: string): string {
  return fullUrl.replace('-full', '-thumb');
}

/**
 * Get full URL from thumbnail URL
 */
export function getFullImageUrl(thumbUrl: string): string {
  return thumbUrl.replace('-thumb', '-full');
}
