import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { useTickets, useTransitionTicket, useCreateTicket, useDeleteTicket, type Ticket } from '../hooks/useTickets';
import { formatTimeRemaining, formatDate } from '../lib/time';
import { SeverityBadge } from '../components/SeverityBadge';
import { StatusChip } from '../components/StatusChip';
import { useAllScores } from '../hooks/useScore';

type SortKey = 'title' | 'status' | 'severity' | 'assignedUser' | 'createdAt' | 'dueAt';
type SortDir = 'asc' | 'desc';

const SEVERITY_ORDER = { minor: 0, needs_fix_today: 1, immediate_interrupt: 2 };
const STATUS_ORDER = { open: 0, in_progress: 1, needs_review: 2, closed: 3, skipped: 4 };

// Area options with specialty mapping for assignment suggestions
const AREA_OPTIONS = [
  { value: 'kitchen',  label: '🍳 Kitchen',      specialty: 'cook' },
  { value: 'bathroom', label: '🚿 Bathroom',      specialty: 'housekeeper' },
  { value: 'bedroom',  label: '🛏️ Bedroom',       specialty: 'housekeeper' },
  { value: 'living',   label: '🛋️ Living Room',   specialty: 'housekeeper' },
  { value: 'laundry',  label: '👕 Laundry Room',  specialty: 'housekeeper' },
  { value: 'pool',     label: '🏊 Pool',          specialty: 'pool maintenance' },
  { value: 'yard',     label: '🌿 Yard',          specialty: 'handyman' },
  { value: 'garage',   label: '🔧 Garage',        specialty: 'handyman' },
  { value: 'exterior', label: '🏡 Exterior',      specialty: 'handyman' },
];

// Category options with specialty mapping
const CATEGORY_OPTIONS = [
  { value: 'cleaning',    label: '🧹 Cleaning',       specialty: 'housekeeper' },
  { value: 'cooking',     label: '🍽️ Cooking',        specialty: 'cook' },
  { value: 'pool_care',   label: '💧 Pool Care',      specialty: 'pool maintenance' },
  { value: 'repair',      label: '🔨 Repair',         specialty: 'handyman' },
  { value: 'maintenance', label: '⚙️ Maintenance',    specialty: 'handyman' },
  { value: 'gardening',   label: '🌱 Gardening',      specialty: 'handyman' },
  { value: 'laundry',     label: '👕 Laundry',        specialty: 'housekeeper' },
  { value: 'inspection',  label: '🔍 Inspection',     specialty: null },
  { value: 'errand',      label: '📦 Errand / Other', specialty: null },
];

function sortTickets(tickets: Ticket[], key: SortKey, dir: SortDir): Ticket[] {
  return [...tickets].sort((a, b) => {
    let cmp = 0;
    if (key === 'title') cmp = a.title.localeCompare(b.title);
    else if (key === 'status') cmp = (STATUS_ORDER[a.status as keyof typeof STATUS_ORDER] ?? 0) - (STATUS_ORDER[b.status as keyof typeof STATUS_ORDER] ?? 0);
    else if (key === 'severity') cmp = (SEVERITY_ORDER[a.severity] ?? 0) - (SEVERITY_ORDER[b.severity] ?? 0);
    else if (key === 'assignedUser') cmp = (a.assignedUser?.name ?? '').localeCompare(b.assignedUser?.name ?? '');
    else if (key === 'createdAt') cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    else if (key === 'dueAt') {
      if (!a.dueAt && !b.dueAt) return 0;
      if (!a.dueAt) return 1;
      if (!b.dueAt) return -1;
      cmp = new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime();
    }
    return dir === 'asc' ? cmp : -cmp;
  });
}

const EMPTY_FORM = { title: '', description: '', area: '', category: '', severity: 'minor', assignedUserId: '', isInspection: false, dueAt: '' };

type Employee = { id: string; name: string; specialty?: string; role: string; latestScore?: { totalScore: number; qualityScore: number; consistencyScore: number; speedScore: number; volumeScore: number } };

export function AuthorityDashboard() {
  const { t, i18n } = useTranslation();
  const { user, logout } = useAuth();
  const { data: tickets = [], isLoading } = useTickets();
  const { data: scoreSummaries = [] } = useAllScores();
  const transition = useTransitionTicket();
  const createTicket = useCreateTicket();
  const deleteTicket = useDeleteTicket();

  const [statusFilter, setStatusFilter] = useState('');
  const [tab, setTab] = useState<'tickets' | 'scores' | 'team'>('tickets');
  const [sortKey, setSortKey] = useState<SortKey>('title');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  const employees = scoreSummaries as Employee[];

  // Derive specialty suggestion from selected area/category
  const areaMeta = AREA_OPTIONS.find((a) => a.value === form.area);
  const catMeta = CATEGORY_OPTIONS.find((c) => c.value === form.category);
  const suggestedSpecialty = areaMeta?.specialty ?? catMeta?.specialty ?? null;
  const suggestedEmployees = suggestedSpecialty
    ? employees.filter((e) => e.specialty?.toLowerCase() === suggestedSpecialty.toLowerCase())
    : [];

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
    const { dueAt, ...rest } = form;
    createTicket.mutate(
      {
        ...rest,
        assignedUserId: rest.assignedUserId || undefined,
        dueAt: dueAt ? new Date(dueAt).toISOString() : undefined,
      },
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
        {(['tickets', 'team', 'scores'] as const).map((t2) => (
          <button
            key={t2}
            onClick={() => setTab(t2)}
            className={`py-3 text-sm font-medium border-b-2 ${tab === t2 ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500'}`}
          >
            {t2 === 'tickets' ? t('nav.tickets') : t2 === 'scores' ? t('score.title') : t('nav.team')}
          </button>
        ))}
      </div>

      <div className="p-6 max-w-6xl mx-auto">
        {/* ── TICKETS TAB ── */}
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
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer select-none hover:text-gray-700" onClick={() => handleSort('createdAt')}>
                        Created <SortIcon col="createdAt" />
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer select-none hover:text-gray-700" onClick={() => handleSort('dueAt')}>
                        Deadline <SortIcon col="dueAt" />
                      </th>
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

        {/* ── TEAM TAB ── */}
        {tab === 'team' && (
          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Specialty</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Open</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">In Progress</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Needs Review</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Score</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {employees.map((emp) => {
                  const open       = tickets.filter((t) => t.assignedUserId === emp.id && t.status === 'open').length;
                  const inProgress = tickets.filter((t) => t.assignedUserId === emp.id && t.status === 'in_progress').length;
                  const review     = tickets.filter((t) => t.assignedUserId === emp.id && t.status === 'needs_review').length;
                  const score = emp.latestScore?.totalScore;
                  const scoreColor = score == null ? 'text-gray-400' : score >= 80 ? 'text-green-600' : score >= 50 ? 'text-yellow-600' : 'text-red-600';
                  return (
                    <tr key={emp.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900">{emp.name}</td>
                      <td className="px-4 py-3">
                        {emp.specialty ? (
                          <span className="capitalize text-gray-600">{emp.specialty}</span>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`font-semibold ${open > 0 ? 'text-blue-600' : 'text-gray-300'}`}>{open}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`font-semibold ${inProgress > 0 ? 'text-yellow-600' : 'text-gray-300'}`}>{inProgress}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`font-semibold ${review > 0 ? 'text-purple-600' : 'text-gray-300'}`}>{review}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`font-bold ${scoreColor}`}>
                          {score != null ? score.toFixed(0) : '—'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {employees.length === 0 && (
              <p className="text-center text-gray-400 py-8">No employees found</p>
            )}
          </div>
        )}

        {/* ── SCORES TAB ── */}
        {tab === 'scores' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {employees.map((emp) => {
              const s = emp.latestScore;
              return (
                <div key={emp.id} className="bg-white rounded-xl shadow-sm p-4">
                  <h3 className="font-semibold text-gray-900">{emp.name}</h3>
                  {emp.specialty && <p className="text-xs text-gray-400 mb-3 capitalize">{emp.specialty}</p>}
                  {s ? (
                    <div className="text-sm">
                      <div className="flex justify-between items-center">
                        <span className="text-gray-500">{t('score.total')}</span>
                        <span className={`text-2xl font-bold ${s.totalScore >= 100 ? 'text-green-600' : s.totalScore >= 80 ? 'text-blue-600' : s.totalScore >= 60 ? 'text-yellow-600' : 'text-red-600'}`}>
                          {s.totalScore.toFixed(0)}
                        </span>
                      </div>
                      <div className="mt-1 text-xs text-gray-400 space-y-0.5">
                        {s.qualityScore < 0 && <p>Rejections: <span className="text-red-500">{s.qualityScore.toFixed(0)} pts</span></p>}
                        {s.consistencyScore < 0 && <p>Skips: <span className="text-red-500">{s.consistencyScore.toFixed(0)} pts</span></p>}
                        {s.speedScore < 0 && <p>Late: <span className="text-red-500">{s.speedScore.toFixed(0)} pts</span></p>}
                        {s.volumeScore > 0 && <p>Perfect bonus: <span className="text-green-500">+{s.volumeScore.toFixed(0)} pts</span></p>}
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

      {/* ── CREATE TICKET MODAL ── */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
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
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Area</label>
                  <select
                    required
                    value={form.area}
                    onChange={(e) => setForm({ ...form, area: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select area…</option>
                    {AREA_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}{o.specialty ? ` — ${o.specialty}` : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Category</label>
                  <select
                    required
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select category…</option>
                    {CATEGORY_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}{o.specialty ? ` — ${o.specialty}` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Specialty suggestion banner */}
              {suggestedSpecialty && (
                <div className="rounded-lg bg-blue-50 border border-blue-200 px-3 py-2">
                  <p className="text-xs text-blue-700 font-medium mb-1.5">
                    💡 Recommended for: <span className="capitalize">{suggestedSpecialty}</span>
                  </p>
                  <div className="flex gap-2 flex-wrap">
                    {suggestedEmployees.length > 0 ? suggestedEmployees.map((e) => (
                      <button
                        key={e.id}
                        type="button"
                        onClick={() => setForm((f) => ({ ...f, assignedUserId: e.id }))}
                        className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                          form.assignedUserId === e.id
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-white text-blue-700 border-blue-300 hover:border-blue-500'
                        }`}
                      >
                        {e.name}
                      </button>
                    )) : (
                      <span className="text-xs text-blue-500 italic">No {suggestedSpecialty} employee found</span>
                    )}
                  </div>
                </div>
              )}

              <select
                value={form.severity}
                onChange={(e) => setForm({ ...form, severity: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="minor">Minor</option>
                <option value="needs_fix_today">Needs Fix Today</option>
                <option value="immediate_interrupt">Immediate Interrupt</option>
              </select>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Assign to</label>
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
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.isInspection}
                  onChange={(e) => setForm({ ...form, isInspection: e.target.checked })}
                  className="rounded"
                />
                Inspection ticket (requires before + after photos)
              </label>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Deadline (optional)</label>
                <input
                  type="datetime-local"
                  value={form.dueAt}
                  onChange={(e) => setForm({ ...form, dueAt: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
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
