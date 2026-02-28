export function formatTimeRemaining(dueAt?: string): { text: string; color: string } {
  if (!dueAt) return { text: '—', color: 'text-gray-400' };

  const diff = new Date(dueAt).getTime() - Date.now();

  if (diff < 0) {
    const totalMins = Math.abs(Math.floor(diff / 60000));
    const hours = Math.floor(totalMins / 60);
    const mins = totalMins % 60;
    const label = hours > 0 ? `${hours}h ${mins}m overdue` : `${mins}m overdue`;
    return { text: label, color: 'text-red-600 font-semibold' };
  }

  const totalMins = Math.floor(diff / 60000);
  const hours = Math.floor(totalMins / 60);
  const mins = totalMins % 60;

  if (hours >= 48) {
    const days = Math.floor(hours / 24);
    return { text: `${days}d left`, color: 'text-gray-500' };
  }
  if (hours >= 8) return { text: `${hours}h ${mins}m left`, color: 'text-gray-600' };
  if (hours >= 2) return { text: `${hours}h ${mins}m left`, color: 'text-yellow-600' };
  return { text: `${hours}h ${mins}m left`, color: 'text-red-600 font-semibold' };
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
