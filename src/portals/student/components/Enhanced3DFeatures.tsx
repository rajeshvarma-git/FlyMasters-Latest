import { motion } from 'framer-motion';
import { Card, CardContent } from '@student/components/ui/card';
import { 
  Brain, Target, FileCheck, GraduationCap, 
  Globe2, Users, Award, TrendingUp 
} from 'lucide-react';
import { useTouchOptimized } from '@student/hooks/useTouchOptimized';

const features = [
  {
    icon: Brain,
    title: 'AI-Powered Matching',
    description: 'Our advanced AI analyzes your profile and recommends the best-fit universities for your goals.',
    color: 'text-blue-500'
  },
  {
    icon: Target,
    title: 'Personalized Guidance',
    description: 'Get one-on-one counseling from experienced advisors who understand your unique journey.',
    color: 'text-purple-500'
  },
  {
    icon: FileCheck,
    title: 'Document Support',
    description: 'Complete assistance with applications, SOPs, LORs, and visa documentation.',
    color: 'text-green-500'
  },
  {
    icon: GraduationCap,
    title: 'University Selection',
    description: 'Access to 1,000+ universities across 30+ countries with detailed insights.',
    color: 'text-orange-500'
  },
  {
    icon: Globe2,
    title: 'Visa Assistance',
    description: 'Expert guidance through the entire visa application and interview process.',
    color: 'text-red-500'
  },
  {
    icon: Users,
    title: 'Student Community',
    description: 'Join thousands of students and connect with peers studying in your dream country.',
    color: 'text-pink-500'
  },
  {
    icon: Award,
    title: 'Scholarship Search',
    description: 'Discover and apply for scholarships that match your academic profile.',
    color: 'text-yellow-500'
  },
  {
    icon: TrendingUp,
    title: 'Career Services',
    description: 'Post-study work guidance and career counseling for international opportunities.',
    color: 'text-cyan-500'
  }
];

export default function Enhanced3DFeatures() {
  const { isMobile } = useTouchOptimized();

  return (
    <section className="py-20 bg-gradient-to-b from-background to-primary/5 relative overflow-hidden">
      {/* Animated background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <motion.div
          className="absolute top-0 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl"
          animate={{
            scale: [1, 1.2, 1],
            opacity: [0.3, 0.5, 0.3],
          }}
          transition={{
            duration: 8,
            repeat: Infinity,
            ease: "easeInOut"
          }}
        />
      </div>

      <div className="container mx-auto px-6 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <h2 className="text-4xl md:text-5xl font-bold mb-4">
            Why Choose <span className="gradient-text">Fly Masters</span>
          </h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Comprehensive support at every step of your study abroad journey
          </p>
        </motion.div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {features.map((feature, idx) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0, y: 50 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{ duration: 0.5, delay: idx * 0.1 }}
            >
              <motion.div
                whileHover={!isMobile ? { 
                  y: -10, 
                  scale: 1.05,
                  rotateY: 5,
                  transition: { type: "spring", stiffness: 300 }
                } : {}}
                whileTap={{ scale: 0.95 }}
                className="h-full"
              >
                <Card className="h-full glass-card border-primary/20 hover:border-primary/40 transition-all duration-300 group relative overflow-hidden">
                  {/* Hover gradient effect */}
                  <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-accent/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                  
                  <CardContent className="p-6 relative z-10">
                    <motion.div
                      whileHover={{ rotate: [0, -10, 10, -10, 0], scale: 1.1 }}
                      transition={{ duration: 0.5 }}
                      className="mb-4"
                    >
                      <div className={`w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center group-hover:scale-110 transition-transform`}>
                        <feature.icon className={`w-7 h-7 ${feature.color}`} />
                      </div>
                    </motion.div>
                    
                    <h3 className="text-xl font-bold mb-2 group-hover:text-primary transition-colors">
                      {feature.title}
                    </h3>
                    
                    <p className="text-muted-foreground leading-relaxed">
                      {feature.description}
                    </p>

                    {/* Animated bottom border */}
                    <motion.div
                      className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-primary to-accent"
                      initial={{ scaleX: 0 }}
                      whileInView={{ scaleX: 1 }}
                      viewport={{ once: true }}
                      transition={{ duration: 0.6, delay: idx * 0.1 }}
                    />
                  </CardContent>
                </Card>
              </motion.div>
            </motion.div>
          ))}
        </div>

        {/* Stats banner with parallax effect */}
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8, delay: 0.4 }}
          className="mt-20"
        >
          <motion.div
            whileHover={!isMobile ? { scale: 1.02 } : {}}
            className="glass-card p-8 md:p-12 bg-gradient-to-r from-primary/10 via-accent/10 to-primary/10"
          >
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
              {[
                { value: '98%', label: 'Success Rate' },
                { value: '50K+', label: 'Students Guided' },
                { value: '1K+', label: 'Universities' },
                { value: '30+', label: 'Countries' }
              ].map((stat, idx) => (
                <motion.div
                  key={idx}
                  initial={{ scale: 0 }}
                  whileInView={{ scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ 
                    type: "spring", 
                    stiffness: 200, 
                    delay: 0.6 + idx * 0.1 
                  }}
                  whileHover={{ scale: 1.1 }}
                >
                  <div className="text-4xl md:text-5xl font-bold text-primary mb-2">
                    {stat.value}
                  </div>
                  <div className="text-sm md:text-base text-muted-foreground font-medium">
                    {stat.label}
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
