/**
 * Compress and resize an image file
 */
export async function compressImage(
  file: File,
  maxWidth: number,
  maxHeight: number,
  quality: number = 0.85
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();

    reader.onload = (e) => {
      img.src = e.target?.result as string;
    };

    reader.onerror = reject;

    img.onload = () => {
      // Calculate new dimensions while maintaining aspect ratio
      let width = img.width;
      let height = img.height;

      if (width > maxWidth || height > maxHeight) {
        const aspectRatio = width / height;
        
        if (width > height) {
          width = maxWidth;
          height = Math.round(maxWidth / aspectRatio);
        } else {
          height = maxHeight;
          width = Math.round(maxHeight * aspectRatio);
        }
      }

      // Create canvas and draw resized image
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        reject(new Error('Could not get canvas context'));
        return;
      }

      // Use better image smoothing
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, width, height);

      // Convert to blob
      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error('Failed to create blob'));
          }
        },
        'image/jpeg',
        quality
      );
    };

    img.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Generate a thumbnail from an image file
 */
export async function generateThumbnail(
  file: File,
  size: number = 400,
  quality: number = 0.8
): Promise<Blob> {
  return compressImage(file, size, size, quality);
}

/**
 * Process an image: compress full size and generate thumbnail
 */
export async function processImage(file: File): Promise<{
  compressed: Blob;
  thumbnail: Blob;
  originalSize: number;
  compressedSize: number;
  thumbnailSize: number;
}> {
  const originalSize = file.size;

  // Compress full-size image (max 1920x1920, 85% quality)
  const compressed = await compressImage(file, 1920, 1920, 0.85);
  
  // Generate thumbnail (400x400, 80% quality)
  const thumbnail = await generateThumbnail(file, 400, 0.8);

  return {
    compressed,
    thumbnail,
    originalSize,
    compressedSize: compressed.size,
    thumbnailSize: thumbnail.size,
  };
}

/**
 * Convert blob to file with specific name
 */
export function blobToFile(blob: Blob, fileName: string): File {
  return new File([blob], fileName, { type: blob.type });
}

/**
 * Get file extension from filename
 */
export function getFileExtension(fileName: string): string {
  return fileName.split('.').pop()?.toLowerCase() || 'jpg';
}

/**
 * Generate unique filename
 */
export function generateUniqueFileName(originalName: string, suffix: string = ''): string {
  const ext = getFileExtension(originalName);
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  const base = originalName.split('.')[0].replace(/[^a-z0-9]/gi, '-').toLowerCase();
  return `${base}${suffix}-${timestamp}-${random}.${ext}`;
}
