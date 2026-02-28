import { useQuery } from '@tanstack/react-query';
import client from '../api/client';

export function useScore(userId: string) {
  return useQuery({
    queryKey: ['score', userId],
    queryFn: async () => {
      const res = await client.get(`/scores/${userId}`);
      return res.data.data;
    },
    enabled: !!userId,
  });
}

export function useAllScores() {
  return useQuery({
    queryKey: ['scores'],
    queryFn: async () => {
      const res = await client.get('/scores');
      return res.data.data.summaries;
    },
  });
}
