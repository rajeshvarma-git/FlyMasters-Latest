import { motion } from 'framer-motion';
import { Plane } from 'lucide-react';

export default function AirplaneAnimation() {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden opacity-20">
      {/* Airport Outline */}
      <svg
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] md:w-[800px] md:h-[500px]"
        viewBox="0 0 800 500"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Runway */}
        <motion.rect
          x="100"
          y="240"
          width="600"
          height="20"
          rx="10"
          stroke="currentColor"
          strokeWidth="2"
          strokeDasharray="20 10"
          className="text-primary"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 2, ease: "easeInOut" }}
        />
        
        {/* Terminal Building */}
        <motion.rect
          x="320"
          y="150"
          width="160"
          height="80"
          rx="8"
          stroke="currentColor"
          strokeWidth="2"
          className="text-primary"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.5, duration: 1 }}
        />
        
        {/* Control Tower */}
        <motion.g
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1, duration: 1 }}
        >
          <rect x="680" y="140" width="60" height="100" rx="4" stroke="currentColor" strokeWidth="2" className="text-primary" />
          <circle cx="710" cy="120" r="25" stroke="currentColor" strokeWidth="2" className="text-primary" />
        </motion.g>

        {/* Airplane Path Circle */}
        <motion.circle
          cx="400"
          cy="250"
          r="150"
          stroke="currentColor"
          strokeWidth="1"
          strokeDasharray="5 5"
          className="text-accent-cyan"
          fill="none"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 0.3 }}
          transition={{ delay: 1.5, duration: 2 }}
        />
      </svg>

      {/* Animated Airplane */}
      <motion.div
        className="absolute left-1/2 top-1/2"
        animate={{
          x: [
            -75, // Start left
            0,   // Top
            75,  // Right
            0,   // Bottom
            -75  // Back to start
          ],
          y: [
            0,    // Start left
            -75,  // Top
            0,    // Right
            75,   // Bottom
            0     // Back to start
          ],
          rotate: [
            -45,  // Start left
            0,    // Top
            45,   // Right
            90,   // Bottom
            135,  // Continuing
          ]
        }}
        transition={{
          duration: 12,
          repeat: Infinity,
          ease: "linear"
        }}
      >
        <Plane className="w-8 h-8 text-primary" />
      </motion.div>
    </div>
  );
}
