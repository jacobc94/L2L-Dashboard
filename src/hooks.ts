import React from 'react';
import { useStore } from './store';
import { Client, Engagement, Staff } from './types';

export interface Viewer {
  role: 'admin' | 'coach' | 'client';
  id: string;
  name: string;
  isStaff: boolean;
  isAdmin: boolean;
  person: Staff | Client;
}

export function useViewer(): Viewer {
  const { auth, me } = useStore();
  if (!auth || !me) throw new Error('useViewer needs a signed-in user');
  return { role: auth.role, id: auth.id, name: me.name, isStaff: auth.role !== 'client', isAdmin: auth.role === 'admin', person: me };
}

/** Engagements this viewer may see: admin = all, coach = assigned, client = ones they take part in. */
export function useMyEngagements(): Engagement[] {
  const { state } = useStore();
  const v = useViewer();
  return React.useMemo(() => {
    if (v.isAdmin) return state.engagements;
    if (v.role === 'coach') return state.engagements.filter((e) => e.coachId === v.id);
    return state.engagements.filter((e) => e.clientIds.includes(v.id));
  }, [state.engagements, v.id, v.role, v.isAdmin]);
}

/** The engagement a client is currently working in (their active one, else most recent). */
export function useClientEngagement(): Engagement | undefined {
  const list = useMyEngagements();
  const order = { Active: 0, 'Pre-program': 1, Paused: 2, Completed: 3 } as const;
  return [...list].sort((a, b) => order[a.status] - order[b.status])[0];
}

export function useDirectory() {
  const { state } = useStore();
  return React.useMemo(() => {
    const clients = new Map(state.clients.map((c) => [c.id, c]));
    const staff = new Map(state.staff.map((s) => [s.id, s]));
    const orgs = new Map(state.orgs.map((o) => [o.id, o]));
    return {
      client: (id: string) => clients.get(id),
      staff: (id: string) => staff.get(id),
      org: (id: string) => orgs.get(id),
      clientsOf: (e: Engagement) => e.clientIds.map((id) => clients.get(id)).filter(Boolean) as Client[],
      label: (e: Engagement) => (e.type === 'Executive Coaching' ? clients.get(e.clientIds[0])?.name ?? e.title : e.title),
    };
  }, [state.clients, state.staff, state.orgs]);
}

export const STATUS_TONE = { 'Pre-program': 'amber', Active: 'green', Paused: 'neutral', Completed: 'blue' } as const;
