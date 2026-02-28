import { useTranslation } from 'react-i18next';

interface Props {
  severity: 'minor' | 'needs_fix_today' | 'immediate_interrupt';
  className?: string;
}

const SEVERITY_CLASSES = {
  minor: 'bg-green-100 text-green-800 border-green-300',
  needs_fix_today: 'bg-yellow-100 text-yellow-800 border-yellow-300',
  immediate_interrupt: 'bg-red-100 text-red-800 border-red-300 animate-pulse',
};

export function SeverityBadge({ severity, className = '' }: Props) {
  const { t } = useTranslation();
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${SEVERITY_CLASSES[severity]} ${className}`}
    >
      {t(`ticket.severity_label.${severity}`)}
    </span>
  );
}
