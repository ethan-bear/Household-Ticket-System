import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import client from '../api/client';

export function WeeklyReport() {
  const { t } = useTranslation();
  const [weekOffset, setWeekOffset] = useState(0);

  const { data, isLoading } = useQuery({
    queryKey: ['report', weekOffset],
    queryFn: async () => {
      const res = await client.get('/reports/weekly', { params: { weekOffset } });
      return res.data.data;
    },
  });

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm px-6 py-3 flex items-center gap-3">
        <Link to="/" className="text-blue-600 text-sm">← Back</Link>
        <h1 className="font-bold text-gray-900">{t('report.title')}</h1>
      </header>

      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <button onClick={() => setWeekOffset((w) => w + 1)} className="px-3 py-1 border rounded text-sm">← Prev</button>
          <span className="text-sm text-gray-600">{weekOffset === 0 ? 'This Week' : `${weekOffset} week(s) ago`}</span>
          <button onClick={() => setWeekOffset((w) => Math.max(0, w - 1))} disabled={weekOffset === 0} className="px-3 py-1 border rounded text-sm disabled:opacity-40">Next →</button>
        </div>

        {isLoading ? (
          <p className="text-center text-gray-400">{t('app.loading')}</p>
        ) : data ? (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                { label: t('report.open'), value: data.summary.open, color: 'bg-gray-100' },
                { label: t('report.closed'), value: data.summary.closed, color: 'bg-green-100' },
                { label: t('report.skipped'), value: data.summary.skipped, color: 'bg-yellow-100' },
                { label: t('report.rejections'), value: data.summary.rejections, color: 'bg-red-100' },
              ].map((item) => (
                <div key={item.label} className={`${item.color} rounded-xl p-4 text-center`}>
                  <p className="text-2xl font-bold">{item.value}</p>
                  <p className="text-xs text-gray-500 mt-1">{item.label}</p>
                </div>
              ))}
            </div>

            <div className="bg-white rounded-xl shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Employee</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Open</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Done</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Skipped</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Rejected</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {data.employeeStats?.map((stat: { user: { id: string; name: string }; open: number; closed: number; skipped: number; rejected: number }) => (
                    <tr key={stat.user.id}>
                      <td className="px-4 py-3 font-medium">{stat.user.name}</td>
                      <td className="px-4 py-3 text-center">{stat.open}</td>
                      <td className="px-4 py-3 text-center text-green-600 font-semibold">{stat.closed}</td>
                      <td className="px-4 py-3 text-center text-yellow-600">{stat.skipped}</td>
                      <td className="px-4 py-3 text-center text-red-600">{stat.rejected}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {data.repeatIssues?.length > 0 && (
              <div className="bg-orange-50 rounded-xl p-4">
                <h3 className="font-semibold text-orange-800 mb-3">⚠️ {t('report.repeatIssues')}</h3>
                <div className="space-y-2">
                  {data.repeatIssues.map((issue: { id: string; title: string; area: string; category: string }) => (
                    <div key={issue.id} className="text-sm text-orange-700">
                      {issue.title} — {issue.area} › {issue.category}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}
