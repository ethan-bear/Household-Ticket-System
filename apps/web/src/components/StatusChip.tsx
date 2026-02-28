import { useTranslation } from 'react-i18next';

interface Props {
  status: string;
}

const STATUS_CLASSES: Record<string, string> = {
  open: 'bg-gray-100 text-gray-700',
  in_progress: 'bg-blue-100 text-blue-700',
  needs_review: 'bg-orange-100 text-orange-700',
  closed: 'bg-green-100 text-green-700',
  skipped: 'bg-gray-200 text-gray-500 line-through',
};

export function StatusChip({ status }: Props) {
  const { t } = useTranslation();
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STATUS_CLASSES[status] ?? 'bg-gray-100 text-gray-700'}`}
    >
      {t(`ticket.status.${status}`, { defaultValue: status })}
    </span>
  );
}
