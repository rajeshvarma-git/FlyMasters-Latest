import { motion, useMotionValue, useTransform, PanInfo } from 'framer-motion';
import { useState, useRef, useEffect } from 'react';
import { Card, CardContent } from '@student/components/ui/card';
import { Button } from '@student/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface MobileOptimizedSectionProps {
  title: string;
  items: Array<{
    id: string;
    content: React.ReactNode;
  }>;
}

export function MobileOptimizedSection({ title, items }: MobileOptimizedSectionProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isMobile, setIsMobile] = useState(false);
  const constraintsRef = useRef(null);
  const x = useMotionValue(0);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const handleDragEnd = (event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    const threshold = 50;
    
    if (info.offset.x > threshold && currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    } else if (info.offset.x < -threshold && currentIndex < items.length - 1) {
      setCurrentIndex(currentIndex + 1);
    }
  };

  const nextSlide = () => {
    setCurrentIndex((prev) => Math.min(prev + 1, items.length - 1));
  };

  const prevSlide = () => {
    setCurrentIndex((prev) => Math.max(prev - 1, 0));
  };

  if (!isMobile) {
    // Desktop: Show grid layout
    return (
      <section className="py-12">
        <div className="container mx-auto px-6">
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-3xl font-bold mb-8 text-center"
          >
            {title}
          </motion.h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {items.map((item, idx) => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: idx * 0.1 }}
                whileHover={{ scale: 1.05, y: -10 }}
              >
                {item.content}
              </motion.div>
            ))}
          </div>
        </div>
      </section>
    );
  }

  // Mobile: Show swipeable carousel
  return (
    <section className="py-12 overflow-hidden">
      <div className="container mx-auto px-6">
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-2xl font-bold mb-6 text-center"
        >
          {title}
        </motion.h2>

        <div className="relative" ref={constraintsRef}>
          <motion.div
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.2}
            onDragEnd={handleDragEnd}
            animate={{ x: -currentIndex * (window.innerWidth - 48) }}
            transition={{
              type: "spring",
              stiffness: 300,
              damping: 30
            }}
            className="flex gap-4"
            style={{ x }}
          >
            {items.map((item) => (
              <motion.div
                key={item.id}
                className="min-w-[calc(100vw-48px)] touch-pan-y"
                whileTap={{ scale: 0.98 }}
              >
                {item.content}
              </motion.div>
            ))}
          </motion.div>

          {/* Navigation buttons */}
          <div className="flex justify-between items-center mt-6">
            <Button
              variant="outline"
              size="icon"
              onClick={prevSlide}
              disabled={currentIndex === 0}
              className="touch-bounce"
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>

            {/* Dots indicator */}
            <div className="flex gap-2">
              {items.map((_, idx) => (
                <motion.button
                  key={idx}
                  onClick={() => setCurrentIndex(idx)}
                  className={`w-2 h-2 rounded-full transition-all touch-bounce ${
                    idx === currentIndex 
                      ? 'bg-primary w-8' 
                      : 'bg-muted-foreground/30'
                  }`}
                  whileTap={{ scale: 0.8 }}
                />
              ))}
            </div>

            <Button
              variant="outline"
              size="icon"
              onClick={nextSlide}
              disabled={currentIndex === items.length - 1}
              className="touch-bounce"
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>

          {/* Swipe hint */}
          {currentIndex === 0 && (
            <motion.p
              initial={{ opacity: 1 }}
              animate={{ opacity: 0 }}
              transition={{ delay: 3, duration: 1 }}
              className="text-center text-xs text-muted-foreground mt-4"
            >
              Swipe to explore more →
            </motion.p>
          )}
        </div>
      </div>
    </section>
  );
}
