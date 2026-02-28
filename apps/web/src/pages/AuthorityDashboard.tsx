import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { useTickets, useTransitionTicket, useCreateTicket, useDeleteTicket, type Ticket } from '../hooks/useTickets';
import { formatTimeRemaining, formatDate } from '../lib/time';
import { SeverityBadge } from '../components/SeverityBadge';
import { StatusChip } from '../components/StatusChip';
import { useAllScores } from '../hooks/useScore';

type SortKey = 'title' | 'status' | 'severity' | 'assignedUser';
type SortDir = 'asc' | 'desc';

const SEVERITY_ORDER = { minor: 0, needs_fix_today: 1, immediate_interrupt: 2 };
const STATUS_ORDER = { open: 0, in_progress: 1, needs_review: 2, closed: 3, skipped: 4 };

function sortTickets(tickets: Ticket[], key: SortKey, dir: SortDir): Ticket[] {
  return [...tickets].sort((a, b) => {
    let cmp = 0;
    if (key === 'title') cmp = a.title.localeCompare(b.title);
    else if (key === 'status') cmp = (STATUS_ORDER[a.status as keyof typeof STATUS_ORDER] ?? 0) - (STATUS_ORDER[b.status as keyof typeof STATUS_ORDER] ?? 0);
    else if (key === 'severity') cmp = (SEVERITY_ORDER[a.severity] ?? 0) - (SEVERITY_ORDER[b.severity] ?? 0);
    else if (key === 'assignedUser') cmp = (a.assignedUser?.name ?? '').localeCompare(b.assignedUser?.name ?? '');
    return dir === 'asc' ? cmp : -cmp;
  });
}

const EMPTY_FORM = { title: '', description: '', area: '', category: '', severity: 'minor', assignedUserId: '', isInspection: false };

export function AuthorityDashboard() {
  const { t, i18n } = useTranslation();
  const { user, logout } = useAuth();
  const { data: tickets = [], isLoading } = useTickets();
  const { data: scoreSummaries = [] } = useAllScores();
  const transition = useTransitionTicket();
  const createTicket = useCreateTicket();
  const deleteTicket = useDeleteTicket();

  const [statusFilter, setStatusFilter] = useState('');
  const [tab, setTab] = useState<'tickets' | 'scores'>('tickets');
  const [sortKey, setSortKey] = useState<SortKey>('title');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  const employees = (scoreSummaries as Array<{ id: string; name: string; specialty?: string }>);

  const filtered = statusFilter ? tickets.filter((t) => t.status === statusFilter) : tickets;
  const sorted = sortTickets(filtered, sortKey, sortDir);

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  }

  function SortIcon({ col }: { col: SortKey }) {
    if (sortKey !== col) return <span className="text-gray-300 ml-1">↕</span>;
    return <span className="text-blue-600 ml-1">{sortDir === 'asc' ? '↑' : '↓'}</span>;
  }

  function handleTransition(id: string, status: string, note?: string) {
    transition.mutate({ id, status, note });
  }

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    createTicket.mutate(
      { ...form, assignedUserId: form.assignedUserId || undefined },
      { onSuccess: () => { setShowCreate(false); setForm(EMPTY_FORM); } }
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm px-6 py-3 flex items-center justify-between">
        <h1 className="font-bold text-lg text-gray-900">{t('app.title')}</h1>
        <div className="flex items-center gap-3">
          <Link to="/report" className="text-sm text-blue-600 font-medium">{t('nav.report')}</Link>
          <Link to="/chat" className="text-sm text-blue-600 font-medium">{t('nav.chat')}</Link>
          <button
            onClick={() => i18n.changeLanguage(i18n.language === 'en' ? 'es' : 'en')}
            className="text-sm font-medium text-gray-600 border rounded-full px-3 py-1"
          >
            {i18n.language === 'en' ? 'ES' : 'EN'}
          </button>
          <button onClick={logout} className="text-sm text-gray-500 w-16 text-center">{t('auth.logout')}</button>
        </div>
      </header>

      <div className="bg-white border-b px-6 flex gap-4">
        <button
          onClick={() => setTab('tickets')}
          className={`py-3 text-sm font-medium border-b-2 ${tab === 'tickets' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500'}`}
        >
          {t('nav.tickets')}
        </button>
        <button
          onClick={() => setTab('scores')}
          className={`py-3 text-sm font-medium border-b-2 ${tab === 'scores' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500'}`}
        >
          {t('score.title')}
        </button>
      </div>

      <div className="p-6 max-w-6xl mx-auto">
        {tab === 'tickets' && (
          <>
            <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
              <div className="flex gap-2 flex-wrap">
                {['', 'open', 'in_progress', 'needs_review', 'closed', 'skipped'].map((s) => (
                  <button
                    key={s}
                    onClick={() => setStatusFilter(s)}
                    className={`px-3 py-1 rounded-full text-sm font-medium border ${statusFilter === s ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300'}`}
                  >
                    {s ? t(`ticket.status.${s}`) : 'All'}
                  </button>
                ))}
              </div>
              <button
                onClick={() => setShowCreate(true)}
                className="bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-blue-700"
              >
                + New Ticket
              </button>
            </div>

            {isLoading ? (
              <p className="text-gray-400 text-center py-8">{t('app.loading')}</p>
            ) : (
              <div className="bg-white rounded-xl shadow-sm overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer select-none hover:text-gray-700" onClick={() => handleSort('title')}>
                        Task <SortIcon col="title" />
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer select-none hover:text-gray-700" onClick={() => handleSort('status')}>
                        Status <SortIcon col="status" />
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer select-none hover:text-gray-700" onClick={() => handleSort('severity')}>
                        Severity <SortIcon col="severity" />
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer select-none hover:text-gray-700" onClick={() => handleSort('assignedUser')}>
                        Assigned To <SortIcon col="assignedUser" />
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer select-none hover:text-gray-700">Created</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Deadline</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {sorted.map((ticket) => (
                      <tr key={ticket.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <div>
                            <span className="font-medium text-gray-900">{ticket.title}</span>
                            {ticket.isRepeatIssue && <span className="ml-2 text-xs text-orange-600">⚠️ Repeat</span>}
                            <p className="text-xs text-gray-400">{ticket.area} › {ticket.category}</p>
                          </div>
                        </td>
                        <td className="px-4 py-3"><StatusChip status={ticket.status} /></td>
                        <td className="px-4 py-3"><SeverityBadge severity={ticket.severity} /></td>
                        <td className="px-4 py-3 text-gray-600">{ticket.assignedUser?.name ?? '—'}</td>
                        <td className="px-4 py-3 text-xs text-gray-500">{formatDate(ticket.createdAt)}</td>
                        <td className="px-4 py-3 text-xs">
                          {ticket.dueAt ? (
                            <>
                              <div className="text-gray-500">{formatDate(ticket.dueAt)}</div>
                              <div className={formatTimeRemaining(ticket.dueAt).color}>
                                {formatTimeRemaining(ticket.dueAt).text}
                              </div>
                            </>
                          ) : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-2 flex-wrap">
                            {ticket.status === 'needs_review' && (
                              <>
                                <button
                                  onClick={() => handleTransition(ticket.id, 'closed')}
                                  className="text-xs bg-green-600 text-white px-2 py-1 rounded"
                                >
                                  {t('ticket.close')}
                                </button>
                                <button
                                  onClick={() => handleTransition(ticket.id, 'in_progress', 'rejected')}
                                  className="text-xs bg-red-500 text-white px-2 py-1 rounded"
                                >
                                  {t('ticket.reject')}
                                </button>
                              </>
                            )}
                            {user?.role === 'mother' && (
                              <button
                                onClick={() => { if (confirm('Delete this ticket permanently?')) deleteTicket.mutate(ticket.id); }}
                                className="text-xs bg-gray-800 text-white px-2 py-1 rounded hover:bg-red-700"
                              >
                                🗑 Delete
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {sorted.length === 0 && (
                  <p className="text-center text-gray-400 py-8">{t('ticket.noTasks')}</p>
                )}
              </div>
            )}
          </>
        )}

        {tab === 'scores' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {employees.map((emp) => {
              const s = (emp as { latestScore?: { totalScore: number; qualityScore: number; consistencyScore: number; speedScore: number; volumeScore: number } }).latestScore;
              return (
                <div key={emp.id} className="bg-white rounded-xl shadow-sm p-4">
                  <h3 className="font-semibold text-gray-900">{emp.name}</h3>
                  {emp.specialty && <p className="text-xs text-gray-400 mb-3 capitalize">{emp.specialty}</p>}
                  {s ? (
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-500">{t('score.total')}</span>
                        <span className="font-bold">{s.totalScore.toFixed(1)}</span>
                      </div>
                      <div className="flex justify-between text-xs text-gray-400">
                        <span>Q: {s.qualityScore.toFixed(0)}</span>
                        <span>C: {s.consistencyScore.toFixed(0)}</span>
                        <span>S: {s.speedScore.toFixed(0)}</span>
                        <span>V: {s.volumeScore.toFixed(0)}</span>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-gray-400">No score yet</p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Create Ticket Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4">New Ticket</h2>
            <form onSubmit={handleCreate} className="space-y-3">
              <input
                required
                placeholder="Title"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <textarea
                placeholder="Description"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                rows={2}
              />
              <div className="grid grid-cols-2 gap-3">
                <input
                  required
                  placeholder="Area (e.g. Kitchen)"
                  value={form.area}
                  onChange={(e) => setForm({ ...form, area: e.target.value })}
                  className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <input
                  required
                  placeholder="Category (e.g. Cleaning)"
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <select
                value={form.severity}
                onChange={(e) => setForm({ ...form, severity: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="minor">Minor</option>
                <option value="needs_fix_today">Needs Fix Today</option>
                <option value="immediate_interrupt">Immediate Interrupt</option>
              </select>
              <select
                value={form.assignedUserId}
                onChange={(e) => setForm({ ...form, assignedUserId: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Unassigned</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>{e.name}{e.specialty ? ` (${e.specialty})` : ''}</option>
                ))}
              </select>
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.isInspection}
                  onChange={(e) => setForm({ ...form, isInspection: e.target.checked })}
                  className="rounded"
                />
                Inspection ticket (requires before + after photos)
              </label>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => { setShowCreate(false); setForm(EMPTY_FORM); }}
                  className="flex-1 border border-gray-300 text-gray-700 py-2 rounded-lg text-sm font-medium hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createTicket.isPending}
                  className="flex-1 bg-blue-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
                >
                  {createTicket.isPending ? 'Creating…' : 'Create Ticket'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
