import type { AppState } from '../types';

/** Collections that are arrays of `{ id }` records, in the order changes must be applied (parents before children). */
export const COLLECTIONS = [
  'staff', 'orgs', 'clients', 'engagements', 'contracts', 'preTasks', 'sessions', 'checkIns', 'actions', 'messages', 'outbox', 'resources',
] as const;
export type CollectionName = (typeof COLLECTIONS)[number] | 'settings';

export interface StateChange {
  c: CollectionName;
  op: 'upsert' | 'delete';
  record?: Record<string, unknown>;
  id?: string;
  engagementId?: string;
}

/** Record-level difference between two states: what a user's edit actually changed. */
export function diffState(before: AppState, after: AppState): StateChange[] {
  const out: StateChange[] = [];
  const deletes: StateChange[] = [];
  for (const c of COLLECTIONS) {
    const a = before[c] as unknown as Array<{ id: string; engagementId?: string }>;
    const b = after[c] as unknown as Array<{ id: string; engagementId?: string }>;
    const old = new Map(a.map((r) => [r.id, JSON.stringify(r)]));
    const seen = new Set<string>();
    for (const r of b) {
      seen.add(r.id);
      if (old.get(r.id) !== JSON.stringify(r)) out.push({ c, op: 'upsert', record: r as unknown as Record<string, unknown> });
    }
    for (const r of a) if (!seen.has(r.id)) deletes.push({ c, op: 'delete', id: r.id, engagementId: r.engagementId });
  }
  if (JSON.stringify(before.settings) !== JSON.stringify(after.settings)) out.push({ c: 'settings', op: 'upsert', record: after.settings as unknown as Record<string, unknown> });
  return [...out, ...deletes];
}
