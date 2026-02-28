import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { useTickets, useTransitionTicket } from '../hooks/useTickets';
import { SeverityBadge } from '../components/SeverityBadge';
import { StatusChip } from '../components/StatusChip';
import { useAllScores } from '../hooks/useScore';

export function AuthorityDashboard() {
  const { t, i18n } = useTranslation();
  const { user, logout } = useAuth();
  const { data: tickets = [], isLoading } = useTickets();
  const { data: scoreSummaries = [] } = useAllScores();
  const transition = useTransitionTicket();
  const [statusFilter, setStatusFilter] = useState('');
  const [tab, setTab] = useState<'tickets' | 'scores'>('tickets');

  const filtered = statusFilter ? tickets.filter((t) => t.status === statusFilter) : tickets;

  function handleTransition(id: string, status: string, note?: string) {
    transition.mutate({ id, status, note });
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
          <button onClick={logout} className="text-sm text-gray-500">{t('auth.logout')}</button>
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
            <div className="flex gap-3 mb-4 flex-wrap">
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

            {isLoading ? (
              <p className="text-gray-400 text-center py-8">{t('app.loading')}</p>
            ) : (
              <div className="bg-white rounded-xl shadow-sm overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Task</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Severity</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Assigned To</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {filtered.map((ticket) => (
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
                        <td className="px-4 py-3">
                          {ticket.status === 'needs_review' && (
                            <div className="flex gap-2">
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
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {filtered.length === 0 && (
                  <p className="text-center text-gray-400 py-8">{t('ticket.noTasks')}</p>
                )}
              </div>
            )}
          </>
        )}

        {tab === 'scores' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {(scoreSummaries as Array<{ id: string; name: string; specialty?: string; latestScore?: { totalScore: number; qualityScore: number; consistencyScore: number; speedScore: number; volumeScore: number } }>).map((emp) => (
              <div key={emp.id} className="bg-white rounded-xl shadow-sm p-4">
                <h3 className="font-semibold text-gray-900">{emp.name}</h3>
                {emp.specialty && <p className="text-xs text-gray-400 mb-3 capitalize">{emp.specialty}</p>}
                {emp.latestScore ? (
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-500">{t('score.total')}</span>
                      <span className="font-bold">{emp.latestScore.totalScore.toFixed(1)}</span>
                    </div>
                    <div className="flex justify-between text-xs text-gray-400">
                      <span>Q: {emp.latestScore.qualityScore.toFixed(0)}</span>
                      <span>C: {emp.latestScore.consistencyScore.toFixed(0)}</span>
                      <span>S: {emp.latestScore.speedScore.toFixed(0)}</span>
                      <span>V: {emp.latestScore.volumeScore.toFixed(0)}</span>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-gray-400">No score yet</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
