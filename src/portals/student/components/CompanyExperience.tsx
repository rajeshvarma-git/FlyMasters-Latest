import React, { useState, useEffect } from 'react';
import { Clock } from 'lucide-react';

const CompanyExperience = () => {
  const [time, setTime] = useState({
    years: 0,
    months: 0,
    hours: 0,
    seconds: 0
  });

  useEffect(() => {
    const calculateExperience = () => {
      const startDate = new Date('2016-10-11T00:00:00');
      const now = new Date();
      
      const totalSeconds = Math.floor((now.getTime() - startDate.getTime()) / 1000);
      const totalMinutes = Math.floor(totalSeconds / 60);
      const totalHours = Math.floor(totalMinutes / 60);
      const totalDays = Math.floor(totalHours / 24);
      
      const years = Math.floor(totalDays / 365);
      const remainingDaysAfterYears = totalDays % 365;
      const months = Math.floor(remainingDaysAfterYears / 30);
      const hours = totalHours % 24;
      const seconds = totalSeconds % 60;
      
      setTime({ years, months, hours, seconds });
    };

    calculateExperience();
    const interval = setInterval(calculateExperience, 1000);

    return () => clearInterval(interval);
  }, []);

  return (
    <section className="py-20 px-4 relative overflow-hidden">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-accent-cyan/10 to-background" />
      
      <div className="container mx-auto relative z-10">
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-primary/10 mb-6 animate-pulse">
            <Clock className="w-5 h-5 text-primary" />
            <span className="text-sm font-semibold text-primary">Since October 11, 2016</span>
          </div>
          <h2 className="text-4xl md:text-5xl font-bold mb-4">
            Our <span className="gradient-text">Journey</span>
          </h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            Every second counts in making your study abroad dreams a reality
          </p>
        </div>

        {/* Digital Clock Display */}
        <div className="max-w-6xl mx-auto glass-card p-8 md:p-12">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-8">
            {/* Years */}
            <div className="text-center group">
              <div className="bg-gradient-primary rounded-2xl p-6 md:p-8 shadow-lg transform transition-all duration-300 hover:scale-105 hover:shadow-2xl">
                <div className="text-5xl md:text-7xl font-bold text-white tabular-nums tracking-tight">
                  {String(time.years).padStart(2, '0')}
                </div>
              </div>
              <div className="mt-4 text-xl md:text-2xl font-semibold text-foreground">Years</div>
              <div className="text-sm text-muted-foreground mt-1">of Excellence</div>
            </div>

            {/* Months */}
            <div className="text-center group">
              <div className="bg-gradient-primary rounded-2xl p-6 md:p-8 shadow-lg transform transition-all duration-300 hover:scale-105 hover:shadow-2xl">
                <div className="text-5xl md:text-7xl font-bold text-white tabular-nums tracking-tight">
                  {String(time.months).padStart(2, '0')}
                </div>
              </div>
              <div className="mt-4 text-xl md:text-2xl font-semibold text-foreground">Months</div>
              <div className="text-sm text-muted-foreground mt-1">of Dedication</div>
            </div>

            {/* Hours */}
            <div className="text-center group">
              <div className="bg-gradient-primary rounded-2xl p-6 md:p-8 shadow-lg transform transition-all duration-300 hover:scale-105 hover:shadow-2xl">
                <div className="text-5xl md:text-7xl font-bold text-white tabular-nums tracking-tight">
                  {String(time.hours).padStart(2, '0')}
                </div>
              </div>
              <div className="mt-4 text-xl md:text-2xl font-semibold text-foreground">Hours</div>
              <div className="text-sm text-muted-foreground mt-1">Today</div>
            </div>

            {/* Seconds */}
            <div className="text-center group">
              <div className="bg-gradient-to-br from-accent-cyan to-accent-cyan-dark rounded-2xl p-6 md:p-8 shadow-lg transform transition-all duration-300 hover:scale-105 hover:shadow-2xl animate-pulse">
                <div className="text-4xl md:text-5xl font-bold text-white tabular-nums tracking-tight">
                  {String(time.seconds).padStart(2, '0')}
                </div>
              </div>
              <div className="mt-4 text-lg md:text-xl font-semibold text-foreground">Seconds</div>
              <div className="text-xs text-muted-foreground mt-1">& Counting</div>
            </div>
          </div>

          {/* Experience Stats */}
          <div className="mt-12 pt-8 border-t border-border">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-center">
              <div>
                <div className="text-3xl md:text-4xl font-bold gradient-text mb-2">
                  {Math.floor(time.years * 365 * 24 + time.months * 30 * 24 + time.hours).toLocaleString()}+
                </div>
                <div className="text-sm text-muted-foreground">Hours of Expertise</div>
              </div>
              <div>
                <div className="text-3xl md:text-4xl font-bold gradient-text mb-2">
                  50,000+
                </div>
                <div className="text-sm text-muted-foreground">Students Helped</div>
              </div>
              <div>
                <div className="text-3xl md:text-4xl font-bold gradient-text mb-2">
                  100+
                </div>
                <div className="text-sm text-muted-foreground">Partner Universities</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default CompanyExperience;