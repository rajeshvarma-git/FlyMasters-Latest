export function slugifyService(name: string) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export interface ServiceDetailCopy {
  headline: string;
  longDescription: string;
  whoItsFor: string[];
  howItWorks: { step: string; title: string; text: string }[];
  outcomes: string[];
  ctaLabel: string;
  ctaPath: string;
}

export const SERVICE_DETAILS: Record<string, ServiceDetailCopy> = {
  'university-selection': {
    headline: 'Find universities that actually match your profile',
    longDescription:
      'Fly Masters matches your academic scores, budget, preferred country, and career goals with 500+ partner universities. You get a shortlist you can act on — not a generic ranking list.',
    whoItsFor: [
      'Students who are unsure which country or course fits them',
      'Applicants comparing multiple destinations',
      'Families who want a realistic shortlist within budget',
    ],
    howItWorks: [
      { step: '1', title: 'Share your profile', text: 'Tell us your country preference, qualification, scores, budget, and course interest — in chat or with a counselor.' },
      { step: '2', title: 'AI + counselor matching', text: 'We match you against partner universities using your academics, intake, and budget.' },
      { step: '3', title: 'Review your shortlist', text: 'You get recommended universities, courses, fees, and next steps to apply.' },
    ],
    outcomes: [
      'Personalized university shortlist',
      'Country and course options you can afford',
      'Clear next steps to start applications',
    ],
    ctaLabel: 'Browse Universities',
    ctaPath: '/universities',
  },
  'visa-guidance': {
    headline: 'Visa paperwork, interview prep, and tracking in one place',
    longDescription:
      'Once you have an offer, we guide the visa file: documents, timelines, interview practice, and status tracking so you are not guessing what the embassy needs.',
    whoItsFor: [
      'Students who received an admission offer',
      'First-time visa applicants',
      'Anyone who needs a document checklist and interview practice',
    ],
    howItWorks: [
      { step: '1', title: 'Document checklist', text: 'We map the visa type to a required document list for your destination.' },
      { step: '2', title: 'File preparation', text: 'Counselors review forms, financials, and supporting letters before you submit.' },
      { step: '3', title: 'Interview and tracking', text: 'Practice common questions and track appointment and decision dates with us.' },
    ],
    outcomes: [
      'Complete visa document support',
      'Interview preparation',
      'Application progress tracking',
    ],
    ctaLabel: 'Talk to AI Advisor',
    ctaPath: '/chat',
  },
  'scholarship-assistance': {
    headline: 'Find scholarships you can actually apply for',
    longDescription:
      'We match merit, need, and university-funded scholarships to your profile, then help with applications and financial planning so funding is part of the plan — not an afterthought.',
    whoItsFor: [
      'Students looking for merit or need-based aid',
      'Applicants who need help with scholarship essays',
      'Families planning total study cost',
    ],
    howItWorks: [
      { step: '1', title: 'Eligibility match', text: 'We filter scholarships by country, course, scores, and deadline.' },
      { step: '2', title: 'Application support', text: 'Get help with forms, essays, and required documents.' },
      { step: '3', title: 'Financial plan', text: 'Combine tuition, living costs, and likely funding so the budget is realistic.' },
    ],
    outcomes: [
      'Matched scholarship options',
      'Application and essay support',
      'A clear funding picture',
    ],
    ctaLabel: 'Get Scholarship Help',
    ctaPath: '/chat',
  },
  'test-preparation': {
    headline: 'IELTS, TOEFL, GRE, and GMAT prep with a score plan',
    longDescription:
      'Test scores decide both admission and scholarships. We set a target score, practice plan, and mock tests so you improve with a schedule — not last-minute cramming.',
    whoItsFor: [
      'Students who still need English or entrance-test scores',
      'Applicants targeting a scholarship cutoff',
      'Anyone who wants mock tests before the real exam',
    ],
    howItWorks: [
      { step: '1', title: 'Diagnostic', text: 'We check your current level and the score your target universities need.' },
      { step: '2', title: 'Study plan', text: 'Instructors and materials focus on the sections holding you back.' },
      { step: '3', title: 'Mocks and review', text: 'Timed practice tests and feedback until you hit the target band or score.' },
    ],
    outcomes: [
      'Expert-led prep for IELTS, TOEFL, GRE, and GMAT',
      'Practice tests and study materials',
      'A score-improvement plan',
    ],
    ctaLabel: 'Plan My Test Prep',
    ctaPath: '/chat',
  },
  'career-counseling': {
    headline: 'Choose a course that leads to a career, not just a degree',
    longDescription:
      'We map your strengths and interests to courses and job markets abroad — so you pick a program with internships, PR pathways, and hiring demand, not only a famous university name.',
    whoItsFor: [
      'Students torn between two or more courses',
      'Applicants who want industry and PR insight',
      'Anyone planning long-term work after study',
    ],
    howItWorks: [
      { step: '1', title: 'Career assessment', text: 'One-on-one session on academics, interests, and target lifestyle.' },
      { step: '2', title: 'Course mapping', text: 'We match programs to job roles, salary ranges, and visa work options.' },
      { step: '3', title: 'Long-term plan', text: 'You leave with a course path, backup options, and next actions.' },
    ],
    outcomes: [
      'One-on-one counseling',
      'Industry and course insights',
      'A long-term study and career plan',
    ],
    ctaLabel: 'Book Career Guidance',
    ctaPath: '/chat',
  },
  'application-support': {
    headline: 'From shortlist to submitted applications',
    longDescription:
      'We manage the application file: university portals, SOP and essays, recommendation letters, and deadlines — so nothing is missed in a busy intake season.',
    whoItsFor: [
      'Students ready to apply to a shortlist',
      'Applicants who need SOP, essay, or LOR help',
      'Anyone juggling multiple university deadlines',
    ],
    howItWorks: [
      { step: '1', title: 'Application plan', text: 'We set target universities, intakes, and a deadline calendar.' },
      { step: '2', title: 'Documents and writing', text: 'Counselors review applications, SOPs, essays, and LOR guidance.' },
      { step: '3', title: 'Submit and follow up', text: 'We track submissions, extra documents, and offer decisions.' },
    ],
    outcomes: [
      'Application review before you submit',
      'SOP, essay, and LOR support',
      'Deadline management across universities',
    ],
    ctaLabel: 'Start My Application',
    ctaPath: '/chat',
  },
};
