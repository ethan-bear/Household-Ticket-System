import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { useTickets } from '../hooks/useTickets';
import { useScore } from '../hooks/useScore';
import { SeverityBadge } from '../components/SeverityBadge';
import { StatusChip } from '../components/StatusChip';
import { InterruptAlert } from '../components/InterruptAlert';
import { PhotoUpload } from '../components/PhotoUpload';
import { useTransitionTicket } from '../hooks/useTickets';
import type { Ticket } from '../hooks/useTickets';
import { formatTimeRemaining, formatDate } from '../lib/time';

const AREA_ICONS: Record<string, string> = {
  kitchen: '🍳',
  bathroom: '🚿',
  pool: '🏊',
  yard: '🌿',
  bedroom: '🛏️',
  living: '🛋️',
  default: '🏠',
};

function ScoreGauge({ score }: { score: number }) {
  const { t } = useTranslation();
  const color = score >= 80 ? 'text-green-600' : score >= 50 ? 'text-yellow-600' : 'text-red-600';
  const bgColor = score >= 80 ? 'bg-green-100' : score >= 50 ? 'bg-yellow-100' : 'bg-red-100';

  return (
    <div className={`${bgColor} rounded-xl p-4 text-center`}>
      <p className="text-xs text-gray-500 mb-1">{t('score.total')}</p>
      <p className={`text-4xl font-bold ${color}`}>{score.toFixed(0)}</p>
    </div>
  );
}

function TicketCard({ ticket, onTransition }: { ticket: Ticket; onTransition: (id: string, status: string) => void }) {
  const { t } = useTranslation();
  const icon = AREA_ICONS[ticket.area?.toLowerCase()] ?? AREA_ICONS.default;

  const severityStrip: Record<string, string> = {
    minor: 'border-l-4 border-green-400',
    needs_fix_today: 'border-l-4 border-yellow-400',
    immediate_interrupt: 'border-l-4 border-red-500',
  };

  return (
    <div className={`bg-white rounded-xl shadow-sm p-4 ${severityStrip[ticket.severity] ?? ''}`}>
      <div className="flex items-start gap-3">
        <span className="text-3xl">{icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <h3 className="font-semibold text-gray-900 truncate">{ticket.title}</h3>
            <SeverityBadge severity={ticket.severity} />
            {ticket.isRepeatIssue && (
              <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full">⚠️ Repeat</span>
            )}
          </div>
          <StatusChip status={ticket.status} />
          <p className="text-sm text-gray-500 mt-1 truncate">{ticket.area} › {ticket.category}</p>
          <div className="flex gap-3 mt-1 text-xs flex-wrap">
            <span className="text-gray-400">Created {formatDate(ticket.createdAt)}</span>
            {ticket.dueAt && (
              <span className={formatTimeRemaining(ticket.dueAt).color}>
                {formatDate(ticket.dueAt)} · {formatTimeRemaining(ticket.dueAt).text}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {ticket.status === 'open' && (
          <button
            onClick={() => onTransition(ticket.id, 'in_progress')}
            className="flex-1 bg-blue-600 text-white py-2 px-3 rounded-lg text-sm font-medium"
          >
            {t('ticket.startTask')}
          </button>
        )}
        {ticket.status === 'in_progress' && (
          <>
            <PhotoUpload ticketId={ticket.id} photoType="completion" />
            <button
              onClick={() => onTransition(ticket.id, 'needs_review')}
              className="flex-1 bg-green-600 text-white py-2 px-3 rounded-lg text-sm font-medium"
            >
              {t('ticket.submitForReview')}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export function EmployeeDashboard() {
  const { t, i18n } = useTranslation();
  const { user, logout } = useAuth();
  const { data: tickets = [], isLoading } = useTickets({ assignedUserId: user?.id });
  const { data: scoreData } = useScore(user?.id ?? '');
  const transition = useTransitionTicket();
  const [acknowledgedInterrupts, setAcknowledgedInterrupts] = useState<Set<string>>(new Set());

  // Find unacknowledged immediate_interrupt tickets
  const urgentTicket = tickets.find(
    (t) =>
      t.severity === 'immediate_interrupt' &&
      t.status !== 'closed' &&
      t.status !== 'skipped' &&
      !acknowledgedInterrupts.has(t.id)
  );

  function handleTransition(id: string, status: string) {
    transition.mutate({ id, status });
  }

  function acknowledgeInterrupt(id: string) {
    setAcknowledgedInterrupts((prev) => new Set([...prev, id]));
  }

  const pinnedTickets = tickets.filter((t) => t.severity === 'needs_fix_today' && t.status !== 'closed');
  const otherTickets = tickets.filter((t) => t.severity !== 'needs_fix_today' && t.status !== 'closed' && t.status !== 'skipped');

  return (
    <>
      {urgentTicket && (
        <InterruptAlert ticket={urgentTicket} onAcknowledge={() => acknowledgeInterrupt(urgentTicket.id)} />
      )}

      <div className="min-h-screen bg-gray-50">
        {/* Header */}
        <header className="bg-white shadow-sm px-4 py-3 flex items-center justify-between">
          <div>
            <h1 className="font-bold text-gray-900">{user?.name}</h1>
            {user?.specialty && <p className="text-xs text-gray-500 capitalize">{user.specialty}</p>}
          </div>
          <div className="flex items-center gap-3">
            {/* Language toggle */}
            <button
              onClick={() => i18n.changeLanguage(i18n.language === 'en' ? 'es' : 'en')}
              className="text-sm font-medium text-blue-600 border border-blue-200 rounded-full px-3 py-1"
            >
              {i18n.language === 'en' ? 'ES' : 'EN'}
            </button>
            <button onClick={logout} className="text-sm text-gray-500 w-16 text-center">{t('auth.logout')}</button>
          </div>
        </header>

        <div className="p-4 space-y-4 max-w-2xl mx-auto">
          {/* Score gauge */}
          {scoreData?.latest && <ScoreGauge score={scoreData.latest.totalScore} />}

          {/* Pinned (needs_fix_today) */}
          {pinnedTickets.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-yellow-700 mb-2">📌 Fix Today</h2>
              <div className="space-y-3">
                {pinnedTickets.map((ticket) => (
                  <TicketCard key={ticket.id} ticket={ticket} onTransition={handleTransition} />
                ))}
              </div>
            </div>
          )}

          {/* All other tasks */}
          {isLoading ? (
            <p className="text-center text-gray-400 py-8">{t('app.loading')}</p>
          ) : otherTickets.length === 0 && pinnedTickets.length === 0 ? (
            <p className="text-center text-gray-400 py-12 text-lg">{t('ticket.noTasks')}</p>
          ) : (
            <div className="space-y-3">
              {otherTickets.map((ticket) => (
                <TicketCard key={ticket.id} ticket={ticket} onTransition={handleTransition} />
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
