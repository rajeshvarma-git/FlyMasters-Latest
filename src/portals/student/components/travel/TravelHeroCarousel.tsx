import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@student/components/ui/button';

interface CarouselSlide {
  id: number;
  title: string;
  subtitle: string;
  image: string;
  category: string;
}

const slides: CarouselSlide[] = [
  {
    id: 1,
    title: 'Tropical Paradise Awaits',
    subtitle: 'Explore pristine beaches and crystal-clear waters',
    image: 'https://images.unsplash.com/photo-1559827260-dc66d52bef19?w=1200&auto=format&fit=crop',
    category: 'Beaches'
  },
  {
    id: 2,
    title: 'Sacred Temple Tours',
    subtitle: 'Discover spiritual destinations and ancient heritage',
    image: 'https://images.unsplash.com/photo-1580274455191-1c62238fa333?w=1200&auto=format&fit=crop',
    category: 'Temples'
  },
  {
    id: 3,
    title: 'Adventure Awaits',
    subtitle: 'Trek through mountains and experience thrilling adventures',
    image: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1200&auto=format&fit=crop',
    category: 'Adventure'
  },
  {
    id: 4,
    title: 'Corporate Excellence',
    subtitle: 'Professional travel solutions for your business needs',
    image: 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=1200&auto=format&fit=crop',
    category: 'Corporate'
  },
  {
    id: 5,
    title: 'Holiday Escapes',
    subtitle: 'Create unforgettable memories with your loved ones',
    image: 'https://images.unsplash.com/photo-1530789253388-582c481c54b0?w=1200&auto=format&fit=crop',
    category: 'Holidays'
  }
];

export default function TravelHeroCarousel() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [direction, setDirection] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setDirection(1);
      setCurrentIndex((prev) => (prev + 1) % slides.length);
    }, 5000);

    return () => clearInterval(timer);
  }, []);

  const slideVariants = {
    enter: (direction: number) => ({
      x: direction > 0 ? 1000 : -1000,
      opacity: 0,
    }),
    center: {
      x: 0,
      opacity: 1,
    },
    exit: (direction: number) => ({
      x: direction < 0 ? 1000 : -1000,
      opacity: 0,
    }),
  };

  const handlePrev = () => {
    setDirection(-1);
    setCurrentIndex((prev) => (prev - 1 + slides.length) % slides.length);
  };

  const handleNext = () => {
    setDirection(1);
    setCurrentIndex((prev) => (prev + 1) % slides.length);
  };

  return (
    <div className="relative w-full h-[60vh] md:h-[70vh] overflow-hidden rounded-3xl bg-muted/20">
      <AnimatePresence initial={false} custom={direction}>
        <motion.div
          key={currentIndex}
          custom={direction}
          variants={slideVariants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{
            x: { type: 'spring', stiffness: 300, damping: 30 },
            opacity: { duration: 0.5 },
          }}
          className="absolute inset-0"
        >
          {/* Image */}
          <div 
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: `url(${slides[currentIndex].image})` }}
          >
            <div className="absolute inset-0 bg-gradient-to-t from-background/95 via-background/50 to-transparent" />
          </div>

          {/* Content */}
          <div className="absolute inset-0 flex flex-col justify-end p-8 md:p-16">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
            >
              <div className="inline-block px-4 py-2 rounded-full bg-primary/20 backdrop-blur-sm border border-primary/30 mb-4">
                <span className="text-primary font-semibold text-sm">{slides[currentIndex].category}</span>
              </div>
              <h2 className="text-4xl md:text-6xl font-bold text-foreground mb-4">
                {slides[currentIndex].title}
              </h2>
              <p className="text-lg md:text-xl text-muted-foreground max-w-2xl">
                {slides[currentIndex].subtitle}
              </p>
            </motion.div>
          </div>
        </motion.div>
      </AnimatePresence>

      {/* Navigation Buttons */}
      <div className="absolute inset-y-0 left-4 right-4 flex items-center justify-between pointer-events-none">
        <Button
          variant="secondary"
          size="icon"
          onClick={handlePrev}
          className="pointer-events-auto rounded-full bg-card/80 backdrop-blur-sm hover:bg-card shadow-lg"
        >
          <ChevronLeft className="h-6 w-6" />
        </Button>
        <Button
          variant="secondary"
          size="icon"
          onClick={handleNext}
          className="pointer-events-auto rounded-full bg-card/80 backdrop-blur-sm hover:bg-card shadow-lg"
        >
          <ChevronRight className="h-6 w-6" />
        </Button>
      </div>

      {/* Dots Indicator */}
      <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 flex gap-2">
        {slides.map((_, index) => (
          <button
            key={index}
            onClick={() => {
              setDirection(index > currentIndex ? 1 : -1);
              setCurrentIndex(index);
            }}
            className={`h-2 rounded-full transition-all ${
              index === currentIndex 
                ? 'w-8 bg-primary' 
                : 'w-2 bg-muted-foreground/30 hover:bg-muted-foreground/50'
            }`}
          />
        ))}
      </div>
    </div>
  );
}
