import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import client from '../api/client';

export interface Ticket {
  id: string;
  title: string;
  description: string;
  status: string;
  severity: 'minor' | 'needs_fix_today' | 'immediate_interrupt';
  isInspection: boolean;
  area: string;
  category: string;
  isRepeatIssue: boolean;
  assignedUserId?: string;
  assignedUser?: { id: string; name: string; specialty?: string };
  photos: Array<{ id: string; url: string; photoType: string }>;
  createdAt: string;
  dueAt?: string;
}

export function useTickets(filters?: { status?: string; assignedUserId?: string; area?: string }) {
  return useQuery({
    queryKey: ['tickets', filters],
    queryFn: async () => {
      const res = await client.get('/tickets', { params: filters });
      return res.data.data.tickets as Ticket[];
    },
  });
}

export function useTicket(id: string) {
  return useQuery({
    queryKey: ['ticket', id],
    queryFn: async () => {
      const res = await client.get(`/tickets/${id}`);
      return res.data.data.ticket as Ticket;
    },
    enabled: !!id,
  });
}

export function useTransitionTicket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status, note }: { id: string; status: string; note?: string }) => {
      const res = await client.patch(`/tickets/${id}/status`, { status, note });
      return res.data.data.ticket;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tickets'] });
    },
  });
}

export function useDeleteTicket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await client.delete(`/tickets/${id}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tickets'] });
    },
  });
}

export function useCreateTicket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      title: string;
      description: string;
      area: string;
      category: string;
      severity: string;
      isInspection?: boolean;
      assignedUserId?: string;
    }) => {
      const res = await client.post('/tickets', data);
      return res.data.data.ticket;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tickets'] });
    },
  });
}
