import { AppState, ContractSection, Resource } from '../types';

export const STANDARD_TERMS: ContractSection[] = [
  {
    heading: '1. Scope of Services',
    text:
      'L2L Consulting Team ("L2L") will provide {{hours}} hours of professional coaching to {{participants}} ("Client") between {{startDate}} and {{endDate}}, delivered by {{coach}}. Coaching follows the L2L Link 2 Leadership framework — Identify, Assess & Plan, Connect and Evolve — and may include validated assessments, one-on-one sessions, between-session accountability and progress reviews.',
  },
  {
    heading: '2. Hours & Term',
    text:
      'Contracted hours are consumed by delivered sessions, as recorded in the portal after each session. Booked but undelivered time is shown separately. Unused hours expire at the end of the term unless L2L agrees in writing to extend it. Additional hours may be added by written amendment.',
  },
  {
    heading: '3. Scheduling & Cancellation',
    text:
      'Sessions are booked through the portal. Either party may reschedule or cancel with at least {{cancellationHours}} hours\' notice at no charge. Sessions cancelled with less notice, or missed without notice, may be counted against the Client\'s contracted hours.',
  },
  {
    heading: '4. Confidentiality',
    text:
      'Coaching conversations, assessment results and session notes are confidential. L2L will not share them with the Client\'s organization or any third party without the Client\'s written consent, except where required by law or where there is a risk of serious harm. Where an organization sponsors the engagement, only agreed-upon aggregate progress (such as hours used and goal progress) will be reported.',
  },
  {
    heading: '5. Nature of Coaching',
    text:
      'Coaching is a thought-partnership designed to build awareness and accountability. It is not therapy, counseling, or legal, medical or financial advice. The Client remains responsible for their own decisions and results. L2L coaches work in accordance with International Coaching Federation (ICF) ethical standards.',
  },
  {
    heading: '6. Client Commitments',
    text:
      'The Client agrees to complete the pre-program steps (including any assessments), attend sessions on time, submit a brief weekly check-in through the portal, and follow through on agreed action steps.',
  },
  {
    heading: '7. Fees & Payment',
    text: '{{fees}}',
  },
  {
    heading: '8. Termination',
    text:
      'Either party may end the engagement with written notice. Hours delivered through the notice date remain payable. L2L will offer a closing session where practical.',
  },
];

export const DEFAULT_SETTINGS: AppState['settings'] = {
  orgName: 'L2L Consulting Team',
  supportEmail: 'contact@l2lconsultingteam.com',
  phone: '(949) 438-0656',
  address: '806 E Avenida Pico, Suite I 2014, San Clemente, CA 92673',
  bookingWindowDays: 28,
  minNoticeHours: 24,
  cancellationHours: 24,
  requireApproval: true,
  sessionReminderHours: 24,
  lowHoursThreshold: 0.8,
  defaultSessionMinutes: 60,
  timezone: 'America/Los_Angeles',
  autoSendReminders: false,
  weeklyDigestDay: 1,
  standardTerms: STANDARD_TERMS,
};


export const DEFAULT_RESOURCES: Resource[] = [
      { id: 'r_disc', title: 'Everything DiSC Assessment', category: 'Assessment', description: 'Learn your behavioral style and how to adapt it to work better with others.', url: 'https://l2lconsultingteam.com/services/assessments/disc-assessment/' },
      { id: 'r_5b', title: 'The Five Behaviors of a Cohesive Team', category: 'Assessment', description: 'Team assessment based on Patrick Lencioni\'s model: trust, conflict, commitment, accountability, results.', url: 'https://l2lconsultingteam.com/services/assessments/5-behaviors-cohesive-team/' },
      { id: 'r_lpi', title: 'Leadership Practices Inventory (LPI)', category: 'Assessment', description: '360-degree feedback on the five practices of exemplary leadership.', url: 'https://l2lconsultingteam.com/services/assessments/leadership-practices-inventory/' },
      { id: 'r_approach', title: 'Our Approach: Link 2 Leadership Framework', category: 'Framework', description: 'Identify → Assess & Plan → Connect → Evolve. How every L2L engagement is structured.', url: 'https://l2lconsultingteam.com/about/our-approach/' },
      { id: 'r_podcast', title: 'DiSC Personality Podcasts', category: 'Listen & Learn', description: 'Short listens on style, communication and conflict.', url: 'https://l2lconsultingteam.com/disc-personality-podcasts/' },
      {
        id: 'r_ws1', title: 'Weekly Reflection Prompts', category: 'Worksheet',
        description: 'Five questions to answer before each weekly check-in.',
        body: '1. What is one thing I did this week that I am proud of?\n2. Where did I fall back on an old habit?\n3. What conversation am I avoiding?\n4. What did I learn about how others experience me?\n5. What is the one thing I will do differently next week?',
      },
      {
        id: 'r_ws2', title: 'Session Prep Worksheet', category: 'Worksheet',
        description: 'A two-minute prep to get the most from every session.',
        body: 'Before your session, jot down:\n• The one topic you most want to leave with progress on\n• What you tried since last time and what happened\n• What is getting in the way (people, time, belief)\n• How you will know the session was worth it',
      },
    ];
