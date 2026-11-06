import { AppState, Session } from '../types';
import { sessionHours } from './hours';

const mdy = (d: Date) => `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`;
const round2 = (n: number) => Math.round(n * 100) / 100;

export const QB_HEADER = ['InvoiceNo', 'Customer', 'InvoiceDate', 'DueDate', 'Terms', 'Memo', 'Item(Product/Service)', 'ItemDescription', 'ItemQuantity', 'ItemRate', 'ItemAmount'];

/**
 * Rows in the shape of QuickBooks Online's invoice import: one invoice per engagement, one line of
 * delivered hours. The rate is the signed contract fee ÷ contracted hours (blank if there is no signed fee,
 * so it can be filled in inside QuickBooks). Customer is the client's organization.
 */
export function quickbooksInvoiceRows(state: AppState, delivered: Session[], period: string, today = new Date()): (string | number)[][] {
  const byEng = new Map<string, Session[]>();
  for (const s of delivered) { if (sessionHours(s) > 0) byEng.set(s.engagementId, [...(byEng.get(s.engagementId) ?? []), s]); }
  const due = new Date(today); due.setDate(due.getDate() + 30);
  const label = new Date(period + '-01T00:00').toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const rows: (string | number)[][] = [];
  let n = 0;
  for (const [engId, list] of byEng) {
    const e = state.engagements.find((x) => x.id === engId);
    if (!e) continue;
    const org = state.orgs.find((o) => o.id === e.orgId)?.name ?? e.title;
    const c = state.contracts.find((x) => x.engagementId === e.id && x.status === 'signed');
    const rate = c?.fee && c.totalHours > 0 ? round2(c.fee / c.totalHours) : undefined;
    const hours = round2(list.reduce((t, s) => t + sessionHours(s), 0));
    n += 1;
    rows.push([
      `L2L-${period.replace('-', '')}-${String(n).padStart(2, '0')}`, org, mdy(today), mdy(due), 'Net 30',
      `${e.title} — ${label}`, 'Coaching', `${e.title}: ${list.length} session${list.length === 1 ? '' : 's'} in ${label}`,
      hours, rate ?? '', rate !== undefined ? round2(hours * rate) : '',
    ]);
  }
  return rows;
}
