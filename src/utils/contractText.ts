import { AppState, Contract, ContractSection } from '../types';
import { fmtDate, fmtHours } from './dates';

const longDate = (iso: string) => fmtDate(iso, { month: 'long', day: 'numeric', year: 'numeric' });

/** Fill the {{placeholders}} in the standard terms and append any engagement-specific terms. */
export function renderContract(state: AppState, contract: Contract): ContractSection[] {
  const e = state.engagements.find((x) => x.id === contract.engagementId);
  const coach = state.staff.find((s) => s.id === e?.coachId);
  const org = state.orgs.find((o) => o.id === e?.orgId);
  const people = (e?.clientIds ?? []).map((id) => state.clients.find((c) => c.id === id)?.name).filter(Boolean) as string[];
  const participants =
    e?.type === 'Executive Coaching' || people.length <= 1
      ? `${people[0] ?? 'the client'}${org ? ` of ${org.name}` : ''}`
      : `${org?.name ?? 'the organization'} (participants: ${people.join(', ')})`;
  const fees =
    contract.fee != null
      ? `The fee for this engagement is $${contract.fee.toLocaleString('en-US')}. ${contract.billingNote ?? ''}`.trim()
      : contract.billingNote || 'Fees and invoicing are as agreed separately in writing.';
  const vars: Record<string, string> = {
    hours: fmtHours(contract.totalHours),
    participants,
    startDate: longDate(contract.startDate),
    endDate: longDate(contract.endDate),
    coach: coach ? `${coach.name}${coach.credentials ? ', ' + coach.credentials : ''}` : 'an L2L coach',
    cancellationHours: String(contract.cancellationHours),
    fees,
  };
  const fill = (t: string) => t.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? '');
  const sections = state.settings.standardTerms.map((s) => ({ heading: s.heading, text: fill(s.text) }));
  if (contract.additionalTerms.trim()) {
    sections.push({ heading: `${sections.length + 1}. Additional Terms`, text: contract.additionalTerms.trim() });
  }
  return sections;
}
