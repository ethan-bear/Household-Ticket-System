import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import client from '../api/client';

interface EmployeeStat {
  user: { id: string; name: string; specialty?: string };
  open: number;
  closed: number;
  skipped: number;
  rejected: number;
  daysLate: number;
  qualityPenalty: number;
  consistencyPenalty: number;
  latePenalty: number;
  totalPenalty: number;
  bonus: number;
  scoreImpact: number;
}

interface RepeatIssue {
  id: string;
  title: string;
  area: string;
  category: string;
  severity: string;
  assignedUser?: { name: string };
}

interface HotSpot {
  area: string;
  total: number;
  skipped: number;
  rejected: number;
  issueScore: number;
}

interface ReportData {
  period: { start: string; end: string };
  summary: { open: number; inProgress: number; closed: number; skipped: number; reopened: number };
  employeeStats: EmployeeStat[];
  repeatIssues: RepeatIssue[];
  trends: {
    hotSpots: HotSpot[];
    overdueCount: number;
    noCompletions: string[];
    mostPenalized: EmployeeStat | null;
  };
}


export function WeeklyReport() {
  const { t } = useTranslation();
  const [weekOffset, setWeekOffset] = useState(0);
  const [showLegend, setShowLegend] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['report', weekOffset],
    queryFn: async () => {
      const res = await client.get('/reports/weekly', { params: { weekOffset } });
      return res.data.data as ReportData;
    },
  });

  const fmt = (d: string) => new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm px-6 py-3 flex items-center gap-3">
        <Link to="/" className="text-blue-600 text-sm">← Back</Link>
        <h1 className="font-bold text-gray-900">{t('report.title')}</h1>
      </header>

      <div className="p-6 max-w-4xl mx-auto space-y-6">

        {/* Scoring Legend */}
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <button
            onClick={() => setShowLegend((v) => !v)}
            className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-gray-50"
          >
            <span className="font-semibold text-gray-900">📊 Scoring Legend</span>
            <span className="text-gray-400 text-sm">{showLegend ? '▲ Hide' : '▼ Show'}</span>
          </button>
          {showLegend && (
            <div className="px-4 pb-4 border-t pt-4">
              <p className="text-xs text-gray-500 mb-3">Everyone starts at <span className="font-semibold text-gray-700">100 pts</span> each period. Points are added or removed based on these events:</p>
              <div className="space-y-2">
                {[
                  { icon: '❌', label: 'Work rejected (sent back by manager)', pts: '−10 pts', color: 'text-red-600' },
                  { icon: '⏭️', label: 'Recurring task skipped',              pts: '−5 pts',  color: 'text-red-500' },
                  { icon: '⏰', label: 'Task submitted late (per day late)',   pts: '−3 pts',  color: 'text-orange-500' },
                  { icon: '⭐', label: 'Perfect period — no violations at all', pts: '+5 pts', color: 'text-green-600' },
                ].map((row) => (
                  <div key={row.label} className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2 text-gray-600">
                      <span>{row.icon}</span>
                      <span>{row.label}</span>
                    </span>
                    <span className={`font-semibold font-mono ${row.color}`}>{row.pts}</span>
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-400 mt-3">Deadlines: Urgent = 2 hrs · Fix Today = 8 hrs · Minor = 48 hrs</p>
            </div>
          )}
        </div>

        {/* Week navigation */}
        <div className="flex items-center gap-4">
          <button onClick={() => setWeekOffset((w) => w + 1)} className="px-3 py-1 border rounded text-sm hover:bg-gray-50">← Prev</button>
          <span className="text-sm font-medium text-gray-700">
            {data ? `${fmt(data.period.start)} – ${fmt(data.period.end)}` : weekOffset === 0 ? 'This Week' : `${weekOffset} week(s) ago`}
          </span>
          <button onClick={() => setWeekOffset((w) => Math.max(0, w - 1))} disabled={weekOffset === 0} className="px-3 py-1 border rounded text-sm disabled:opacity-40 hover:bg-gray-50">Next →</button>
        </div>

        {isLoading ? (
          <p className="text-center text-gray-400 py-12">{t('app.loading')}</p>
        ) : data ? (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {[
                { label: 'Open', value: data.summary.open, color: 'bg-gray-100 text-gray-800' },
                { label: 'In Progress', value: data.summary.inProgress, color: 'bg-blue-50 text-blue-800' },
                { label: 'Closed', value: data.summary.closed, color: 'bg-green-50 text-green-800' },
                { label: 'Skipped', value: data.summary.skipped, color: 'bg-yellow-50 text-yellow-800' },
                { label: 'Reopened', value: data.summary.reopened, color: 'bg-red-50 text-red-800' },
              ].map((item) => (
                <div key={item.label} className={`${item.color} rounded-xl p-4 text-center`}>
                  <p className="text-2xl font-bold">{item.value}</p>
                  <p className="text-xs mt-1 opacity-70">{item.label}</p>
                </div>
              ))}
            </div>

            {/* Per-employee table */}
            <div className="bg-white rounded-xl shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b">
                <h2 className="font-semibold text-gray-900">Employee Breakdown</h2>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Employee</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Closed</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase" title="−10 pts each">Rejected</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase" title="−5 pts each">Skipped</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase" title="−3 pts per day">Late Days</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Bonus</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Score Impact</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {data.employeeStats.map((stat) => (
                    <tr key={stat.user.id} className={stat.totalPenalty > 0 ? 'bg-red-50/30' : stat.bonus > 0 ? 'bg-green-50/20' : ''}>
                      <td className="px-4 py-3">
                        <span className="font-medium text-gray-900">{stat.user.name}</span>
                        {stat.user.specialty && <span className="ml-2 text-xs text-gray-400 capitalize">{stat.user.specialty}</span>}
                      </td>
                      <td className="px-4 py-3 text-center text-green-700 font-semibold">{stat.closed}</td>
                      <td className="px-4 py-3 text-center">
                        {stat.rejected > 0
                          ? <span className="text-red-600 font-semibold">{stat.rejected} <span className="text-xs font-normal">(−{stat.qualityPenalty})</span></span>
                          : <span className="text-gray-400">—</span>}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {stat.skipped > 0
                          ? <span className="text-yellow-600 font-semibold">{stat.skipped} <span className="text-xs font-normal">(−{stat.consistencyPenalty})</span></span>
                          : <span className="text-gray-400">—</span>}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {stat.daysLate > 0
                          ? <span className="text-orange-600 font-semibold">{stat.daysLate} <span className="text-xs font-normal">(−{stat.latePenalty})</span></span>
                          : <span className="text-gray-400">—</span>}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {stat.bonus > 0
                          ? <span className="text-green-600 font-semibold">+{stat.bonus}</span>
                          : <span className="text-gray-400">—</span>}
                      </td>
                      <td className="px-4 py-3 text-center font-bold">
                        {stat.scoreImpact > 0
                          ? <span className="text-green-600">+{stat.scoreImpact}</span>
                          : stat.scoreImpact < 0
                            ? <span className="text-red-600">−{Math.abs(stat.scoreImpact)}</span>
                            : <span className="text-gray-400">0</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Repeat issues */}
            {data.repeatIssues.length > 0 && (
              <div className="bg-orange-50 border border-orange-200 rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-orange-200">
                  <h2 className="font-semibold text-orange-800">⚠️ Repeat Issues ({data.repeatIssues.length})</h2>
                  <p className="text-xs text-orange-600 mt-0.5">Same area + category as a ticket closed within the last 7 days</p>
                </div>
                <div className="divide-y divide-orange-100">
                  {data.repeatIssues.map((issue) => (
                    <div key={issue.id} className="px-4 py-3 flex items-center justify-between">
                      <div>
                        <span className="text-sm font-medium text-orange-900">{issue.title}</span>
                        <span className="ml-2 text-xs text-orange-500">{issue.area} › {issue.category}</span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-orange-600">
                        {issue.assignedUser && <span>{issue.assignedUser.name}</span>}
                        <span className="capitalize">{issue.severity.replace(/_/g, ' ')}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Trends & patterns */}
            <div className="bg-white rounded-xl shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b">
                <h2 className="font-semibold text-gray-900">Trends & Patterns</h2>
              </div>
              <div className="p-4 space-y-4">

                {/* Overdue */}
                <div className="flex items-start gap-3">
                  <span className="text-lg">⏰</span>
                  <div>
                    <p className="text-sm font-medium text-gray-800">Overdue Tickets</p>
                    <p className="text-sm text-gray-500">
                      {data.trends.overdueCount === 0
                        ? 'No overdue tickets — all tasks are on track.'
                        : <span className="text-red-600 font-semibold">{data.trends.overdueCount} ticket{data.trends.overdueCount > 1 ? 's' : ''} past due</span>}
                    </p>
                  </div>
                </div>

                {/* No completions */}
                {data.trends.noCompletions.length > 0 && (
                  <div className="flex items-start gap-3">
                    <span className="text-lg">🚨</span>
                    <div>
                      <p className="text-sm font-medium text-gray-800">No Completions This Week</p>
                      <p className="text-sm text-red-600">{data.trends.noCompletions.join(', ')} closed zero tickets despite having assigned tasks.</p>
                    </div>
                  </div>
                )}

                {/* Most penalized */}
                {data.trends.mostPenalized && (
                  <div className="flex items-start gap-3">
                    <span className="text-lg">📉</span>
                    <div>
                      <p className="text-sm font-medium text-gray-800">Most Penalized</p>
                      <p className="text-sm text-gray-600">
                        <span className="font-semibold text-red-600">{data.trends.mostPenalized.user.name}</span>
                        {' '}incurred <span className="font-semibold">−{data.trends.mostPenalized.totalPenalty} pts</span> this week
                        ({data.trends.mostPenalized.rejected} rejection{data.trends.mostPenalized.rejected !== 1 ? 's' : ''},
                        {' '}{data.trends.mostPenalized.skipped} skip{data.trends.mostPenalized.skipped !== 1 ? 's' : ''}).
                      </p>
                    </div>
                  </div>
                )}

                {/* Hot spots */}
                {data.trends.hotSpots.length > 0 && (
                  <div className="flex items-start gap-3">
                    <span className="text-lg">🔥</span>
                    <div>
                      <p className="text-sm font-medium text-gray-800">Problem Areas</p>
                      <ul className="mt-1 space-y-1">
                        {data.trends.hotSpots.map((spot) => (
                          <li key={spot.area} className="text-sm text-gray-600">
                            <span className="font-medium">{spot.area}</span>
                            {' — '}
                            {spot.skipped > 0 && <span className="text-yellow-600">{spot.skipped} skipped</span>}
                            {spot.skipped > 0 && spot.rejected > 0 && ', '}
                            {spot.rejected > 0 && <span className="text-red-600">{spot.rejected} rejected</span>}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}

                {data.trends.hotSpots.length === 0 && data.trends.overdueCount === 0 && data.trends.noCompletions.length === 0 && !data.trends.mostPenalized && (
                  <p className="text-sm text-green-700 font-medium">✅ No notable issues this week.</p>
                )}
              </div>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
