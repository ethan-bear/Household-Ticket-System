import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { Ticket } from '../hooks/useTickets';

interface Props {
  ticket: Ticket;
  onAcknowledge: () => void;
}

export function InterruptAlert({ ticket, onAcknowledge }: Props) {
  const { t } = useTranslation();

  useEffect(() => {
    // Vibrate if available (mobile devices)
    if ('vibrate' in navigator) {
      navigator.vibrate([500, 200, 500, 200, 500]);
    }
  }, []);

  return (
    <div className="fixed inset-0 bg-red-600 z-50 flex flex-col items-center justify-center text-white p-8">
      <div className="text-6xl mb-6 animate-bounce">🚨</div>
      <h1 className="text-4xl font-bold mb-4 text-center">{t('interrupt.title')}</h1>
      <div className="bg-red-700 rounded-xl p-6 max-w-md w-full mb-8">
        <h2 className="text-2xl font-semibold mb-2">{ticket.title}</h2>
        <p className="text-red-100 text-lg">{ticket.description}</p>
        {ticket.area && (
          <p className="text-red-200 mt-2 text-sm">
            {ticket.area} › {ticket.category}
          </p>
        )}
      </div>
      <button
        onClick={onAcknowledge}
        className="bg-white text-red-600 font-bold text-xl py-4 px-12 rounded-full hover:bg-red-50 active:scale-95 transition-transform"
      >
        {t('interrupt.acknowledge')}
      </button>
    </div>
  );
}
