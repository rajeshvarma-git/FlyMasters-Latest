import React from 'react';
import { Card, CardContent } from '@student/components/ui/card';
import { UniversityRecommendation } from '@student/hooks/useChat';
import { ExternalLink, MapPin, Clock, Calendar, Globe, Award } from 'lucide-react';

interface UniversityResultsProps {
  universities: UniversityRecommendation[];
}

const UniversityResults: React.FC<UniversityResultsProps> = ({ universities }) => {
  return (
    <div className="space-y-4" role="region" aria-label="University recommendations">
      <div className="bg-gradient-to-r from-primary to-primary-foreground p-4 rounded-lg text-white">
        <h3 className="font-semibold text-lg mb-2 flex items-center">
          <Award className="w-5 h-5 mr-2" />
          🎓 Your University Recommendations
        </h3>
        <p className="text-sm opacity-90">Based on your profile, here are universities in your chosen country:</p>
      </div>
      
      {universities.map((uni) => (
        <Card key={uni.id} className="border-l-4 border-l-primary hover:shadow-lg transition-shadow duration-200">
          <CardContent className="p-4">
            <div className="flex justify-between items-start mb-3">
              <div className="flex-1">
                <h4 className="font-semibold text-lg text-primary mb-1">{uni.name}</h4>
                <div className="flex items-center text-sm text-muted-foreground mb-1">
                  <MapPin className="w-4 h-4 mr-1" />
                  {uni.location}
                </div>
                <div className="flex items-center text-xs text-green-600 font-medium">
                  <Award className="w-3 h-3 mr-1" />
                  {uni.ranking}
                </div>
              </div>
              {uni.website && uni.website !== '#' && (
                <a
                  href={uni.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:text-primary-foreground transition-colors p-1"
                  aria-label={`Visit ${uni.name} website`}
                >
                  <ExternalLink className="w-4 h-4" />
                </a>
              )}
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div>
                <strong className="text-foreground">Programs:</strong>
                <ul className="list-disc list-inside text-muted-foreground ml-2 mt-1">
                  {uni.programs.slice(0, 2).map((program, idx) => (
                    <li key={idx}>{program}</li>
                  ))}
                  {uni.programs.length > 2 && (
                    <li className="text-primary">+{uni.programs.length - 2} more programs</li>
                  )}
                </ul>
              </div>
              
              <div className="space-y-1">
                <div className="flex items-center">
                  <strong className="text-foreground mr-2">Tuition Fee:</strong>
                  <span className="text-green-600 font-medium">{uni.tuitionFee}</span>
                </div>
                <div className="flex items-center">
                  <Clock className="w-3 h-3 mr-1 text-muted-foreground" />
                  <strong className="text-foreground mr-2">Duration:</strong>
                  <span className="text-muted-foreground">{uni.duration}</span>
                </div>
                <div className="flex items-center">
                  <Calendar className="w-3 h-3 mr-1 text-muted-foreground" />
                  <strong className="text-foreground mr-2">Deadline:</strong>
                  <span className="text-muted-foreground">{uni.deadline}</span>
                </div>
              </div>
              
              <div className="md:col-span-2 pt-2 border-t border-border">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  <div>
                    <strong className="text-foreground">Language Requirements:</strong>
                    <div className="text-muted-foreground">{uni.languageReq}</div>
                  </div>
                  <div>
                    <Globe className="w-3 h-3 inline mr-1 text-muted-foreground" />
                    <strong className="text-foreground">Post-study Visa:</strong>
                    <div className="text-blue-600">{uni.postStudyVisa}</div>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

export default UniversityResults;