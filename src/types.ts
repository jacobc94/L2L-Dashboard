export type Role = 'admin' | 'coach' | 'client';

/** L2L staff. `admin` can see everything; `coach` only sees engagements assigned to them. */
export interface Staff {
  id: string;
  name: string;
  title: string;
  email: string;
  role: 'admin' | 'coach';
  credentials?: string;
  bio?: string;
  /** Demo mode only; real accounts never store or send a passcode to the browser */
  accessCode?: string;
  /** Admin view only: has this person set a passcode yet? */
  joined?: boolean;
  /** Weekly availability used to generate bookable slots */
  availability: AvailabilityBlock[];
  /** Pre-formatted label shown to clients, e.g. "Pacific Time" */
  timezone: string;
}

export interface AvailabilityBlock {
  /** 0 = Sunday … 6 = Saturday */
  day: number;
  start: string; // HH:mm
  end: string; // HH:mm
}

export interface Organization {
  id: string;
  name: string;
  industry?: string;
}

export interface Client {
  id: string;
  name: string;
  title: string;
  orgId: string;
  email: string;
  phone?: string;
  accessCode?: string;
  /** Admin view only: has this person set a passcode yet? */
  joined?: boolean;
}

export type EngagementType = 'Executive Coaching' | 'Team Coaching' | 'Leadership Cohort';
export type EngagementStatus = 'Pre-program' | 'Active' | 'Paused' | 'Completed';
/** The four steps of the L2L "Link 2 Leadership" framework */
export type Phase = 'Identify' | 'Assess & Plan' | 'Connect' | 'Evolve';

export interface Goal {
  id: string;
  text: string;
  /** 0–100, set by coach after sessions */
  progress: number;
}

export interface Engagement {
  id: string;
  title: string;
  type: EngagementType;
  orgId: string;
  /** First entry is the primary contact / contract signer */
  clientIds: string[];
  coachId: string;
  status: EngagementStatus;
  phase: Phase;
  startDate: string; // YYYY-MM-DD
  endDate: string;
  contractedHours: number;
  goals: Goal[];
  /** 0 = Sunday … 6 = Saturday; day the weekly check-in opens */
  checkInDay: number;
  /** Set once the post-program survey has been submitted */
  closeout?: Closeout;
}

export interface Closeout {
  submittedAt: string;
  clientId: string;
  overall: number; // 1–5
  goalsMet: number; // 1–5
  wouldRecommend: number; // 0–10 NPS style
  highlight: string;
  improve: string;
  testimonialOk: boolean;
}

export type PreTaskKind = 'contract' | 'intake' | 'assessment' | 'interview' | 'schedule' | 'custom';

/** Pre-program onboarding checklist item */
export interface PreTask {
  id: string;
  engagementId: string;
  title: string;
  description: string;
  kind: PreTaskKind;
  assignee: 'client' | 'coach' | 'admin';
  /** For per-person tasks on team engagements (e.g. each member's DiSC assessment) */
  clientId?: string;
  dueDate?: string;
  done: boolean;
  completedAt?: string;
  link?: string;
}

export interface ContractSection {
  heading: string;
  text: string;
}

export type ContractStatus = 'draft' | 'sent' | 'signed' | 'void';

export interface Contract {
  id: string;
  engagementId: string;
  status: ContractStatus;
  title: string;
  totalHours: number;
  /** Optional commercial terms — left blank if billed outside the portal */
  fee?: number;
  billingNote?: string;
  startDate: string;
  endDate: string;
  cancellationHours: number;
  /** Extra, engagement-specific terms appended after the standard sections */
  additionalTerms: string;
  sentAt?: string;
  signedAt?: string;
  signedByName?: string;
  signedByClientId?: string;
  coachSignedName?: string;
  coachSignedAt?: string;
}

export type SessionType =
  | 'Kickoff'
  | 'Coaching Session'
  | 'Check-in Call'
  | 'Team Session'
  | 'Debrief'
  | 'Wrap-up'
  | 'Consultation';
export type SessionMode = 'Zoom' | 'Phone' | 'On-site';
export type SessionStatus = 'requested' | 'scheduled' | 'completed' | 'cancelled' | 'no-show';

export interface Session {
  id: string;
  engagementId: string;
  coachId: string;
  type: SessionType;
  mode: SessionMode;
  /** Local wall-clock time, YYYY-MM-DDTHH:mm */
  start: string;
  durationMin: number;
  status: SessionStatus;
  location?: string;
  requestedBy?: 'client' | 'coach';
  /** Hours actually delivered — set when the coach logs the session */
  loggedHours?: number;
  /** Visible to the client */
  summary?: string;
  /** Visible to the client */
  nextFocus?: string;
  /** Coach/admin only */
  privateNotes?: string;
  clientRating?: number;
  clientReflection?: string;
  cancelReason?: string;
}

export interface CheckIn {
  id: string;
  engagementId: string;
  clientId: string;
  /** Monday of the week this covers, YYYY-MM-DD */
  weekOf: string;
  energy: number; // 1–5
  progress: number; // 1–5
  wins: string;
  challenges: string;
  focusNext: string;
  supportNeeded: string;
  submittedAt: string;
  coachResponse?: string;
  respondedAt?: string;
}

export interface ActionItem {
  id: string;
  engagementId: string;
  text: string;
  owner: 'client' | 'coach';
  clientId?: string;
  due?: string;
  done: boolean;
  createdAt: string;
  sessionId?: string;
}

export interface Message {
  id: string;
  engagementId: string;
  fromRole: Role;
  fromId: string;
  fromName: string;
  text: string;
  at: string;
  /** Ids (staff or client) who have read it */
  readBy: string[];
}

export type EmailKind =
  | 'session-reminder'
  | 'checkin-reminder'
  | 'task-reminder'
  | 'contract-reminder'
  | 'action-reminder'
  | 'coach-log'
  | 'coach-request'
  | 'coach-checkin'
  | 'weekly-digest'
  | 'custom';

/** An email the portal wants sent. Delivery is handled outside the browser (see README). */
export interface OutboxEmail {
  id: string;
  kind: EmailKind;
  toName: string;
  toEmail: string;
  subject: string;
  body: string;
  createdAt: string;
  status: 'queued' | 'sent' | 'dismissed';
  sentAt?: string;
  /** Prevents the same reminder being queued twice */
  dedupeKey?: string;
}

export interface Resource {
  id: string;
  title: string;
  description: string;
  category: 'Assessment' | 'Worksheet' | 'Listen & Learn' | 'Framework';
  /** External link. Worksheets without a link show `body` instead. */
  url?: string;
  body?: string;
}

export interface Settings {
  orgName: string;
  supportEmail: string;
  phone: string;
  address: string;
  /** How far ahead clients can book (days) */
  bookingWindowDays: number;
  /** Minimum notice for a booking (hours) */
  minNoticeHours: number;
  /** Late-cancel window used in contracts (hours) */
  cancellationHours: number;
  /** If true, client bookings arrive as requests the coach must confirm */
  requireApproval: boolean;
  /** Send session reminders this many hours ahead */
  sessionReminderHours: number;
  /** Warn when this share of contracted hours is used */
  lowHoursThreshold: number;
  defaultSessionMinutes: number;
  /** IANA zone every wall-clock time in the app refers to */
  timezone: string;
  /** Server only: email due reminders automatically (needs the cron trigger) */
  autoSendReminders: boolean;
  /** Server only: weekday the weekly digest goes out (0 = Sunday … 6), or -1 for never */
  weeklyDigestDay: number;
  /** Standard terms shown in every contract */
  standardTerms: ContractSection[];
}

export interface AppState {
  version: number;
  settings: Settings;
  staff: Staff[];
  orgs: Organization[];
  clients: Client[];
  engagements: Engagement[];
  preTasks: PreTask[];
  contracts: Contract[];
  sessions: Session[];
  checkIns: CheckIn[];
  actions: ActionItem[];
  messages: Message[];
  outbox: OutboxEmail[];
  resources: Resource[];
}

export interface AuthSession {
  role: Role;
  id: string;
}

export type Severity = 'info' | 'warn' | 'urgent';

/** A derived (never stored) to-do/reminder for one person */
export interface Reminder {
  key: string;
  audience: { role: Role; id: string };
  kind: EmailKind;
  severity: Severity;
  title: string;
  detail: string;
  engagementId: string;
  /** Where in the app this reminder should take the person */
  href: string;
  /** ISO date/time the thing is due, if any */
  due?: string;
  /** True when an email should go out now (e.g. a session is inside the reminder window) */
  email?: boolean;
}
