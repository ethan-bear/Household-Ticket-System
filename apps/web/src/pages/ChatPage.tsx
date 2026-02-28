import React, { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import client from '../api/client';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  toolsUsed?: string[];
}

const SUGGESTED_PROMPTS: Record<string, { en: string; es: string }[]> = {
  mother: [
    { en: 'Show all open tasks', es: 'Mostrar tareas abiertas' },
    { en: "Show this week's report", es: 'Ver reporte de esta semana' },
    { en: 'Delete ticket [ID]', es: 'Eliminar tarea [ID]' },
    { en: "Show Rosa's score", es: 'Ver puntuación de Rosa' },
  ],
  father: [
    { en: 'Show all open tasks', es: 'Mostrar tareas abiertas' },
    { en: "Show this week's report", es: 'Ver reporte de esta semana' },
    { en: 'Show in-progress tasks', es: 'Ver tareas en progreso' },
    { en: "Show Miguel's score", es: 'Ver puntuación de Miguel' },
  ],
  employee: [
    { en: 'Show my tasks', es: 'Mostrar mis tareas' },
    { en: 'Show my score', es: 'Ver mi puntuación' },
    { en: 'Create a new task', es: 'Crear una nueva tarea' },
    { en: 'Mark task [ID] as in progress', es: 'Marcar tarea [ID] como en progreso' },
  ],
};

export function ChatPage() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userMsg: Message = { id: Date.now().toString(), role: 'user', content: input.trim() };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const history = messages.map((m) => ({ role: m.role, content: m.content }));
      const res = await client.post('/chat/message', {
        message: userMsg.content,
        language: i18n.language === 'es' ? 'es' : 'en',
        history,
      });
      const assistantMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: res.data.data.reply,
        toolsUsed: res.data.data.toolsUsed,
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { id: (Date.now() + 1).toString(), role: 'assistant', content: t('chat.error') },
      ]);
    } finally {
      setLoading(false);
    }
  }

  const role = user?.role ?? 'employee';
  const lang = i18n.language === 'es' ? 'es' : 'en';
  const prompts = SUGGESTED_PROMPTS[role] ?? SUGGESTED_PROMPTS.employee;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white shadow-sm px-4 py-3 flex items-center gap-3">
        <Link to="/" className="text-blue-600 text-sm">← {t('nav.dashboard')}</Link>
        <h1 className="font-bold text-gray-900">{t('chat.title')}</h1>
        <div className="ml-auto flex items-center gap-2">
          {user && (
            <span className="text-xs text-gray-400 capitalize hidden sm:inline">{user.role}</span>
          )}
          <button
            onClick={() => i18n.changeLanguage(i18n.language === 'en' ? 'es' : 'en')}
            className="text-sm font-medium text-blue-600 border border-blue-200 rounded-full px-3 py-1"
          >
            {i18n.language === 'en' ? 'ES' : 'EN'}
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="space-y-4">
            <p className="text-center text-gray-400 py-6">
              {lang === 'es' ? '¡Hola! ¿Cómo puedo ayudarte?' : 'Hello! How can I help you today?'}
            </p>
            <div className="flex flex-wrap gap-2 justify-center">
              {prompts.map((p, i) => (
                <button
                  key={i}
                  onClick={() => setInput(p[lang])}
                  className="text-sm bg-white border border-gray-200 text-gray-600 rounded-full px-3 py-1.5 hover:border-blue-400 hover:text-blue-600 transition-colors shadow-sm"
                >
                  {p[lang]}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-xs sm:max-w-md rounded-2xl px-4 py-2 ${msg.role === 'user' ? 'bg-blue-600 text-white' : 'bg-white text-gray-900 shadow-sm'}`}>
              <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
              {msg.toolsUsed && msg.toolsUsed.length > 0 && (
                <p className="text-xs mt-1 opacity-60">{t('chat.used')}: {msg.toolsUsed.join(', ')}</p>
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-white shadow-sm rounded-2xl px-4 py-2 text-gray-400 text-sm animate-pulse">...</div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={sendMessage} className="bg-white border-t p-4 flex gap-3">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={t('chat.placeholder')}
          className="flex-1 border border-gray-300 rounded-full px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          disabled={loading}
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="bg-blue-600 text-white rounded-full px-5 py-2 text-sm font-medium disabled:opacity-50"
        >
          {t('chat.send')}
        </button>
      </form>
    </div>
  );
}
