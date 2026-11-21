import type { CheckInTextField, PortalPage, PortalSection } from '../types';

export const CHECK_IN_LABELS: Record<CheckInTextField, string> = {
  wins: 'Wins — what went well?',
  challenges: 'Challenges — what got in the way?',
  focusNext: 'My focus for the coming week',
  supportNeeded: "Support I'd like from my coach (optional)",
};

export const BUILT_IN_PAGES = [
  { id: 'home', title: 'Home' }, { id: 'program', title: 'My Program' },
  { id: 'sessions', title: 'Sessions & Hours' }, { id: 'contract', title: 'Agreement' },
  { id: 'checkin', title: 'Weekly Check-in' }, { id: 'actions', title: 'Action Items' },
  { id: 'messages', title: 'Messages' }, { id: 'resources', title: 'Resources' },
] as const;

export const SECTION_TYPES: Array<{ type: PortalSection['type']; label: string }> = [
  { type: 'text', label: 'Text' }, { type: 'checkin', label: 'Check-in' },
  { type: 'sessions', label: 'Sessions & hours' }, { type: 'contract', label: 'Agreement' },
  { type: 'actions', label: 'Action items' }, { type: 'messages', label: 'Messages' },
  { type: 'program', label: 'Program' }, { type: 'resources', label: 'Resources' },
];

export function defaultPortalPage(id: string): PortalPage | undefined {
  const page = BUILT_IN_PAGES.find((p) => p.id === id);
  return page ? { ...page, sections: [{ id: 'original', type: 'original' }] } : undefined;
}
