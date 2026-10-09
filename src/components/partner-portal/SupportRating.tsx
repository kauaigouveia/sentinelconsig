import React, { useState } from 'react';

export function SupportRating({ conversation, onRated }: { conversation: any; onRated: () => void }) {
  const [rating, setRating] = useState(0), [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  if (conversation.rating) return <div className="shrink-0 border-t border-slate-200 p-3 text-xs dark:border-slate-800"><strong>Obrigado pela avaliação: {'★'.repeat(conversation.rating)} ({conversation.rating}/5)</strong>{conversation.ratingComment && <p className="mt-1 whitespace-pre-wrap break-words">{conversation.ratingComment}</p>}</div>;
  if (!['RESOLVED', 'CLOSED'].includes(conversation.status)) return null;
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const response = await fetch(`/api/partner-portal/support/conversations/${encodeURIComponent(conversation.id)}/rating`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rating, comment }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível enviar sua avaliação.');
      onRated();
    } catch (err: any) { setError(err.message); }
    finally { setBusy(false); }
  };
  return <form onSubmit={submit} className="shrink-0 space-y-2 border-t border-slate-200 p-3 dark:border-slate-800">
    <h4 className="text-xs font-bold">Como foi seu atendimento?</h4>
    <div aria-label="Nota do atendimento" className="flex items-center gap-2">{[1, 2, 3, 4, 5].map(value => <button key={value} type="button" aria-label={`${value} ${value === 1 ? 'estrela' : 'estrelas'}`} aria-pressed={rating === value} disabled={busy} onClick={() => setRating(value)} className={`text-2xl ${value <= rating ? 'text-amber-500' : 'text-slate-400'}`}>★</button>)}<span className="text-xs">{rating ? `${rating}/5` : 'Escolha uma nota'}</span></div>
    <input aria-label="Comentário sobre o atendimento (opcional)" maxLength={1000} value={comment} onChange={event => setComment(event.target.value)} placeholder="Comentário (opcional)" className="w-full rounded-lg border border-slate-300 bg-white p-2 text-xs dark:border-slate-700 dark:bg-slate-950" />
    <button disabled={!rating || busy} className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-40">{busy ? 'Enviando…' : 'Enviar avaliação'}</button>
    {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
  </form>;
}
