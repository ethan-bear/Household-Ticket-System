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
  qualityPenalty: number;
  consistencyPenalty: number;
  totalPenalty: number;
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

function PenaltyBadge({ value }: { value: number }) {
  if (value === 0) return <span className="text-gray-400">—</span>;
  return <span className="text-red-600 font-semibold">−{value}</span>;
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
            <div className="px-4 pb-4 space-y-4 border-t pt-4">

              <div className="text-xs text-gray-500 mb-2">
                Final score = <span className="font-mono">(Quality × 0.40) + (Consistency × 0.30) + (Speed × 0.20) + (Volume × 0.10)</span>. All dimensions start at 100. Scores can go negative.
              </div>

              {/* Severity multipliers */}
              <div>
                <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-1">Severity Multipliers</p>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div className="bg-green-50 rounded-lg p-2 text-center"><span className="font-semibold text-green-700">Minor</span><br/><span className="text-gray-500">1×</span></div>
                  <div className="bg-yellow-50 rounded-lg p-2 text-center"><span className="font-semibold text-yellow-700">Needs Fix Today</span><br/><span className="text-gray-500">2×</span></div>
                  <div className="bg-red-50 rounded-lg p-2 text-center"><span className="font-semibold text-red-700">Immediate Interrupt</span><br/><span className="text-gray-500">4×</span></div>
                </div>
              </div>

              {/* Quality */}
              <div>
                <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-1">Quality — 40% <span className="normal-case font-normal text-gray-400">(base 100, only decreases)</span></p>
                <table className="w-full text-xs">
                  <tbody className="divide-y divide-gray-100">
                    <tr><td className="py-1 text-gray-600">Ticket rejected (sent back from Needs Review)</td><td className="py-1 text-right text-red-600 font-mono">−15 × multiplier</td></tr>
                    <tr><td className="py-1 text-gray-500 pl-4">→ Minor rejection</td><td className="py-1 text-right text-red-500 font-mono">−15 pts</td></tr>
                    <tr><td className="py-1 text-gray-500 pl-4">→ Needs Fix Today rejection</td><td className="py-1 text-right text-red-500 font-mono">−30 pts</td></tr>
                    <tr><td className="py-1 text-gray-500 pl-4">→ Immediate Interrupt rejection</td><td className="py-1 text-right text-red-500 font-mono">−60 pts</td></tr>
                    <tr><td className="py-1 text-gray-600">Failed inspection</td><td className="py-1 text-right text-red-600 font-mono">−10 × multiplier</td></tr>
                  </tbody>
                </table>
              </div>

              {/* Consistency */}
              <div>
                <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-1">Consistency — 30% <span className="normal-case font-normal text-gray-400">(base 100)</span></p>
                <table className="w-full text-xs">
                  <tbody className="divide-y divide-gray-100">
                    <tr><td className="py-1 text-gray-600">Each skipped recurring task</td><td className="py-1 text-right text-red-600 font-mono">−(50 ÷ total recurring)</td></tr>
                    <tr><td className="py-1 text-gray-600">Zero skips all period (perfect streak)</td><td className="py-1 text-right text-green-600 font-mono">+10 pts</td></tr>
                  </tbody>
                </table>
              </div>

              {/* Speed */}
              <div>
                <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-1">Speed — 20% <span className="normal-case font-normal text-gray-400">(based on deadlines)</span></p>
                <table className="w-full text-xs">
                  <tbody className="divide-y divide-gray-100">
                    <tr><td className="py-1 text-gray-600">Completed within deadline</td><td className="py-1 text-right text-green-600 font-mono">100 pts</td></tr>
                    <tr><td className="py-1 text-gray-600">Each hour past deadline</td><td className="py-1 text-right text-red-600 font-mono">−5 pts (min −100)</td></tr>
                    <tr><td className="py-1 text-gray-500 pl-4">Immediate Interrupt deadline</td><td className="py-1 text-right text-gray-500 font-mono">2 hours</td></tr>
                    <tr><td className="py-1 text-gray-500 pl-4">Needs Fix Today deadline</td><td className="py-1 text-right text-gray-500 font-mono">8 hours</td></tr>
                    <tr><td className="py-1 text-gray-500 pl-4">Minor deadline</td><td className="py-1 text-right text-gray-500 font-mono">48 hours</td></tr>
                    <tr><td className="py-1 text-gray-600">Minor with no due date — same calendar day</td><td className="py-1 text-right text-green-600 font-mono">100 pts</td></tr>
                    <tr><td className="py-1 text-gray-600">Minor with no due date — different day</td><td className="py-1 text-right text-yellow-600 font-mono">80 pts</td></tr>
                  </tbody>
                </table>
              </div>

              {/* Volume */}
              <div>
                <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-1">Volume — 10% <span className="normal-case font-normal text-gray-400">(relative output, 0–100)</span></p>
                <p className="text-xs text-gray-600">Your completions ÷ highest completions by anyone this period × 100. The employee who closes the most tickets scores 100; everyone else scores proportionally less.</p>
              </div>

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
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Open</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Skipped</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Reopened</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Quality Pen.</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Consist. Pen.</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Total Pen.</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {data.employeeStats.map((stat) => (
                    <tr key={stat.user.id} className={stat.totalPenalty > 0 ? 'bg-red-50/30' : ''}>
                      <td className="px-4 py-3">
                        <span className="font-medium text-gray-900">{stat.user.name}</span>
                        {stat.user.specialty && <span className="ml-2 text-xs text-gray-400 capitalize">{stat.user.specialty}</span>}
                      </td>
                      <td className="px-4 py-3 text-center text-green-700 font-semibold">{stat.closed}</td>
                      <td className="px-4 py-3 text-center text-gray-500">{stat.open}</td>
                      <td className="px-4 py-3 text-center text-yellow-600">{stat.skipped || '—'}</td>
                      <td className="px-4 py-3 text-center text-red-600">{stat.rejected || '—'}</td>
                      <td className="px-4 py-3 text-center"><PenaltyBadge value={stat.qualityPenalty} /></td>
                      <td className="px-4 py-3 text-center"><PenaltyBadge value={stat.consistencyPenalty} /></td>
                      <td className="px-4 py-3 text-center font-bold"><PenaltyBadge value={stat.totalPenalty} /></td>
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
