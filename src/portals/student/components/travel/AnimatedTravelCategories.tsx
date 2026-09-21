import { motion } from 'framer-motion';
import { Palmtree, Church, Mountain, Briefcase, PartyPopper } from 'lucide-react';
import { Card } from '@student/components/ui/card';

const categories = [
  {
    icon: PartyPopper,
    title: 'Holidays',
    description: 'Create unforgettable memories',
    color: 'from-orange-500 to-red-500',
    delay: 0
  },
  {
    icon: Palmtree,
    title: 'Beaches',
    description: 'Tropical paradise destinations',
    color: 'from-cyan-500 to-blue-500',
    delay: 0.1
  },
  {
    icon: Church,
    title: 'Temples',
    description: 'Sacred spiritual journeys',
    color: 'from-amber-500 to-orange-500',
    delay: 0.2
  },
  {
    icon: Mountain,
    title: 'Adventure',
    description: 'Thrilling experiences await',
    color: 'from-green-500 to-emerald-500',
    delay: 0.3
  },
  {
    icon: Briefcase,
    title: 'Corporate',
    description: 'Professional travel solutions',
    color: 'from-purple-500 to-indigo-500',
    delay: 0.4
  }
];

export default function AnimatedTravelCategories() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
      {categories.map((category, index) => (
        <motion.div
          key={category.title}
          initial={{ opacity: 0, y: 50 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ delay: category.delay, duration: 0.5 }}
        >
          <Card className="group relative overflow-hidden hover:shadow-hover transition-all duration-300 border-border/50 backdrop-blur-sm bg-card/80">
            <div className="p-6 text-center">
              {/* Animated Icon Container */}
              <motion.div
                className="relative mx-auto mb-4 w-20 h-20 rounded-full bg-gradient-to-br flex items-center justify-center"
                style={{ backgroundImage: `linear-gradient(135deg, var(--primary), var(--accent-cyan))` }}
                whileHover={{ 
                  scale: 1.1,
                  rotate: [0, -10, 10, -10, 0]
                }}
                transition={{ duration: 0.5 }}
              >
                <category.icon className="w-10 h-10 text-white" />
                
                {/* Pulse Effect */}
                <motion.div
                  className="absolute inset-0 rounded-full bg-primary/30"
                  initial={{ scale: 1, opacity: 1 }}
                  animate={{ scale: 1.5, opacity: 0 }}
                  transition={{
                    duration: 2,
                    repeat: Infinity,
                    ease: "easeOut"
                  }}
                />
              </motion.div>

              {/* Title */}
              <h3 className="text-xl font-bold text-foreground mb-2 group-hover:text-primary transition-colors">
                {category.title}
              </h3>

              {/* Description */}
              <p className="text-sm text-muted-foreground">
                {category.description}
              </p>

              {/* Animated Line */}
              <motion.div
                className="h-1 bg-gradient-to-r from-primary to-accent-cyan rounded-full mt-4"
                initial={{ width: 0 }}
                whileInView={{ width: '100%' }}
                viewport={{ once: true }}
                transition={{ delay: category.delay + 0.3, duration: 0.6 }}
              />
            </div>

            {/* Hover Glow Effect */}
            <motion.div
              className="absolute inset-0 bg-gradient-to-br from-primary/10 to-accent-cyan/10 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
              initial={false}
            />
          </Card>
        </motion.div>
      ))}
    </div>
  );
}
