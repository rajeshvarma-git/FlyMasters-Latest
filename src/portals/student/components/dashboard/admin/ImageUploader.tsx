import { useState } from 'react';
import { supabase } from '@student/integrations/supabase/client';
import { Button } from '@student/components/ui/button';
import { Input } from '@student/components/ui/input';
import { Label } from '@student/components/ui/label';
import { Progress } from '@student/components/ui/progress';
import { toast } from 'sonner';
import { Upload, X, Image as ImageIcon, Loader2 } from 'lucide-react';
import { processImage, generateUniqueFileName } from '@student/lib/imageCompression';

interface ImageUploaderProps {
  images: string[];
  onImagesChange: (images: string[]) => void;
  bucketName: string;
  folderPath?: string;
}

export default function ImageUploader({ images, onImagesChange, bucketName, folderPath = '' }: ImageUploaderProps) {
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [processingCount, setProcessingCount] = useState({ current: 0, total: 0 });

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    setUploadProgress(0);
    const uploadedUrls: string[] = [];
    const fileArray = Array.from(files);
    setProcessingCount({ current: 0, total: fileArray.length });

    try {
      for (let i = 0; i < fileArray.length; i++) {
        const file = fileArray[i];
        setProcessingCount({ current: i + 1, total: fileArray.length });

        // Validate file type
        if (!file.type.startsWith('image/')) {
          toast.error(`${file.name} is not an image file`);
          continue;
        }

        // Validate file size (max 10MB for original)
        if (file.size > 10 * 1024 * 1024) {
          toast.error(`${file.name} is too large (max 10MB)`);
          continue;
        }

        try {
          // Process image: compress and generate thumbnail
          const { compressed, thumbnail, originalSize, compressedSize, thumbnailSize } = 
            await processImage(file);

          const compressionRatio = Math.round((1 - compressedSize / originalSize) * 100);
          console.log(`Compressed ${file.name}:`, {
            original: `${(originalSize / 1024).toFixed(1)}KB`,
            compressed: `${(compressedSize / 1024).toFixed(1)}KB`,
            thumbnail: `${(thumbnailSize / 1024).toFixed(1)}KB`,
            saved: `${compressionRatio}%`,
          });

          // Generate unique filenames
          const fullFileName = generateUniqueFileName(file.name, '-full');
          const thumbFileName = generateUniqueFileName(file.name, '-thumb');
          
          const fullPath = folderPath ? `${folderPath}/${fullFileName}` : fullFileName;
          const thumbPath = folderPath ? `${folderPath}/${thumbFileName}` : thumbFileName;

          // Upload compressed full-size image
          const { data: fullData, error: fullError } = await supabase.storage
            .from(bucketName)
            .upload(fullPath, compressed, {
              cacheControl: '31536000', // 1 year
              upsert: false,
              contentType: 'image/jpeg',
            });

          if (fullError) throw fullError;

          // Upload thumbnail
          const { data: thumbData, error: thumbError } = await supabase.storage
            .from(bucketName)
            .upload(thumbPath, thumbnail, {
              cacheControl: '31536000', // 1 year
              upsert: false,
              contentType: 'image/jpeg',
            });

          if (thumbError) throw thumbError;

          // Get public URLs
          const { data: { publicUrl: fullUrl } } = supabase.storage
            .from(bucketName)
            .getPublicUrl(fullData.path);

          const { data: { publicUrl: thumbUrl } } = supabase.storage
            .from(bucketName)
            .getPublicUrl(thumbData.path);

          // Store full URL (thumbnail will be derived by replacing -full with -thumb)
          uploadedUrls.push(fullUrl);

          // Update progress
          setUploadProgress(Math.round(((i + 1) / fileArray.length) * 100));
        } catch (error: any) {
          console.error(`Error processing ${file.name}:`, error);
          toast.error(`Failed to process ${file.name}`, { description: error.message });
        }
      }

      if (uploadedUrls.length > 0) {
        onImagesChange([...images, ...uploadedUrls]);
        toast.success(
          `${uploadedUrls.length} image(s) uploaded successfully!`,
          { description: 'Images compressed and optimized' }
        );
      }
    } catch (error: any) {
      toast.error('Upload failed', { description: error.message });
    } finally {
      setUploading(false);
      setUploadProgress(0);
      setProcessingCount({ current: 0, total: 0 });
      event.target.value = '';
    }
  };

  const handleRemoveImage = async (imageUrl: string, index: number) => {
    try {
      // Extract file path from URL
      const url = new URL(imageUrl);
      const pathParts = url.pathname.split('/');
      const filePath = pathParts.slice(pathParts.indexOf(bucketName) + 1).join('/');

      // Delete both full and thumbnail from storage
      const thumbPath = filePath.replace('-full', '-thumb');
      const filesToDelete = [filePath];
      
      // Only add thumbnail if the filename contains -full
      if (filePath.includes('-full')) {
        filesToDelete.push(thumbPath);
      }

      const { error } = await supabase.storage
        .from(bucketName)
        .remove(filesToDelete);

      if (error) throw error;

      // Update images array
      const newImages = images.filter((_, i) => i !== index);
      onImagesChange(newImages);
      toast.success('Image removed');
    } catch (error: any) {
      toast.error('Failed to remove image', { description: error.message });
    }
  };

  const getThumbnailUrl = (fullUrl: string): string => {
    return fullUrl.replace('-full', '-thumb');
  };

  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor="image-upload" className="flex items-center gap-2 mb-2">
          <ImageIcon className="h-4 w-4" />
          Package Images
        </Label>
        <div className="flex gap-2">
          <Input
            id="image-upload"
            type="file"
            accept="image/*"
            multiple
            onChange={handleFileUpload}
            disabled={uploading}
            className="flex-1"
          />
          <Button
            type="button"
            variant="outline"
            disabled={uploading}
            onClick={() => document.getElementById('image-upload')?.click()}
          >
            {uploading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <Upload className="h-4 w-4 mr-2" />
                Upload
              </>
            )}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Upload up to 10MB per image. Images will be automatically compressed and optimized.
        </p>
        
        {uploading && (
          <div className="space-y-2 mt-3">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Processing image {processingCount.current} of {processingCount.total}</span>
              <span>{uploadProgress}%</span>
            </div>
            <Progress value={uploadProgress} className="h-2" />
          </div>
        )}
      </div>

      {images.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {images.map((imageUrl, index) => {
            const thumbnailUrl = getThumbnailUrl(imageUrl);
            return (
              <div key={index} className="relative group aspect-square rounded-lg overflow-hidden border">
                <img
                  src={thumbnailUrl}
                  alt={`Package image ${index + 1}`}
                  className="w-full h-full object-cover"
                  loading="lazy"
                  onError={(e) => {
                    // Fallback to full image if thumbnail doesn't exist
                    e.currentTarget.src = imageUrl;
                  }}
                />
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    onClick={() => handleRemoveImage(imageUrl, index)}
                    disabled={uploading}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
