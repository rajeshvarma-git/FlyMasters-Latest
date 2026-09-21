import { useState } from 'react';
import { Dialog, DialogContent } from '@student/components/ui/dialog';
import { Button } from '@student/components/ui/button';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useOptimizedImage } from '@student/hooks/useOptimizedImage';

interface ImageGalleryProps {
  images: string[];
  packageName: string;
}

export default function ImageGallery({ images, packageName }: ImageGalleryProps) {
  const [selectedImage, setSelectedImage] = useState<number | null>(null);

  const handlePrevious = () => {
    if (selectedImage !== null && selectedImage > 0) {
      setSelectedImage(selectedImage - 1);
    }
  };

  const handleNext = () => {
    if (selectedImage !== null && selectedImage < images.length - 1) {
      setSelectedImage(selectedImage + 1);
    }
  };

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {images.map((image, index) => (
          <GalleryImage
            key={index}
            src={image}
            alt={`${packageName} - Image ${index + 1}`}
            onClick={() => setSelectedImage(index)}
          />
        ))}
      </div>

      <Dialog open={selectedImage !== null} onOpenChange={() => setSelectedImage(null)}>
        <DialogContent className="max-w-7xl h-[90vh] p-0">
          <div className="relative w-full h-full flex items-center justify-center bg-black">
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-4 right-4 z-10 text-white hover:bg-white/20"
              onClick={() => setSelectedImage(null)}
            >
              <X className="w-6 h-6" />
            </Button>

            {selectedImage !== null && (
              <>
                {selectedImage > 0 && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute left-4 z-10 text-white hover:bg-white/20"
                    onClick={handlePrevious}
                  >
                    <ChevronLeft className="w-8 h-8" />
                  </Button>
                )}

                <img
                  src={images[selectedImage]}
                  alt={`${packageName} - Image ${selectedImage + 1}`}
                  className="max-w-full max-h-full object-contain"
                />

                {selectedImage < images.length - 1 && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute right-4 z-10 text-white hover:bg-white/20"
                    onClick={handleNext}
                  >
                    <ChevronRight className="w-8 h-8" />
                  </Button>
                )}

                <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 text-white bg-black/50 px-4 py-2 rounded">
                  {selectedImage + 1} / {images.length}
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function GalleryImage({ src, alt, onClick }: { src: string; alt: string; onClick: () => void }) {
  const { src: imageSrc, isLoading } = useOptimizedImage({ src, useThumbnail: true });

  return (
    <div
      className="relative aspect-square cursor-pointer overflow-hidden rounded-lg group"
      onClick={onClick}
    >
      {isLoading ? (
        <div className="w-full h-full bg-muted animate-pulse" />
      ) : (
        <>
          <img
            src={imageSrc}
            alt={alt}
            className="w-full h-full object-cover transition-transform group-hover:scale-110"
          />
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
        </>
      )}
    </div>
  );
}
