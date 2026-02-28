import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import client from '../api/client';

interface Props {
  ticketId: string;
  photoType: 'before' | 'after' | 'completion';
  onUploaded?: (url: string) => void;
}

export function PhotoUpload({ ticketId, photoType, onUploaded }: Props) {
  const { t } = useTranslation();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError(null);

    const formData = new FormData();
    formData.append('photo', file);
    formData.append('ticketId', ticketId);
    formData.append('photoType', photoType);

    try {
      const res = await client.post('/photos/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      onUploaded?.(res.data.data.photo.url);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Upload failed';
      setError(msg);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="mt-2">
      <label className="flex items-center gap-2 cursor-pointer text-blue-600 hover:text-blue-800">
        <span className="text-2xl">📷</span>
        <span className="text-sm">{t('ticket.addPhoto')}</span>
        <input type="file" accept="image/*" className="hidden" onChange={handleFile} disabled={uploading} />
      </label>
      {uploading && <p className="text-xs text-gray-500 mt-1">Uploading...</p>}
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  );
}
