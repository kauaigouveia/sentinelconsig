import React, { useEffect, useState } from 'react';
import { Send } from 'lucide-react';
type State = {
    available: boolean;
    bot: string | null;
    reason?: string;
    requiresPasswordChange?: boolean;
    linked: boolean;
    pendingConfirmation: boolean;
    ticketId?: string;
    candidateLabel?: string;
};
export function PartnerTelegramSettings() {
    const [state, setState] = useState<State | null>(null), [url, setUrl] = useState(''), [busy, setBusy] = useState(false), [notice, setNotice] = useState('');
    async function load() { const response = await fetch('/api/partner-portal/telegram', { cache: 'no-store' }); const data = await response.json(); if (!response.ok)
        throw new Error(data.error); setState(data); }
    useEffect(() => { const request = new AbortController(); fetch('/api/partner-portal/telegram', { cache: 'no-store', signal: request.signal }).then(async (response) => { const data = await response.json(); if (!response.ok)
        throw new Error(data.error); setState(data); }).catch((error) => { if (!request.signal.aborted)
        setNotice(error instanceof Error ? error.message : 'Não foi possível carregar o vínculo Telegram.'); }); return () => request.abort(); }, []);
    async function action(path: string, method = 'POST', body: unknown = {}) { setBusy(true); setNotice(''); try {
        const response = await fetch(`/api/partner-portal/telegram${path}`, { method, headers: { 'Content-Type': 'application/json' }, ...(method === 'DELETE' ? {} : { body: JSON.stringify(body) }) });
        const data = await response.json();
        if (!response.ok)
            throw new Error(data.error);
        if (data.url)
            setUrl(data.url);
        if (path !== '/link')
            setUrl('');
        await load();
    }
    catch (error) {
        setNotice(error instanceof Error ? error.message : 'Não foi possível concluir.');
    }
    finally {
        setBusy(false);
    } }
    async function refresh() { setBusy(true); try {
        await load();
        setNotice('Situação do Telegram atualizada.');
    }
    catch (error) {
        setNotice(error instanceof Error ? error.message : 'Não foi possível atualizar.');
    }
    finally {
        setBusy(false);
    } }
    return <section className="space-y-4 rounded-2xl border border-[var(--field-border)] bg-[var(--bg-surface)] p-5 text-sm dark:border-[var(--field-border)] dark:bg-[var(--bg-surface)]"><h2 className="flex items-center gap-2 text-base font-bold"><Send size={20} className="text-[var(--link)]"/>Avisos pelo Telegram</h2><p className="leading-6 text-[var(--text-secondary)]">Receba atualizações das suas propostas pelo bot da empresa. Para falar com a equipe, utilize Atendimento no portal.</p>
 {state && <>{state.reason && <p role="status" className="rounded-xl border border-[var(--warning-border)] bg-[var(--warning-bg)] p-3 leading-6">{state.reason}</p>}{state.bot && <p className="text-sm">Bot da empresa: <strong>{state.bot === 'Bot próprio' ? state.bot : '@'+state.bot}</strong></p>}{state.linked && <p className="leading-6">Você receberá os avisos das propostas neste Telegram.</p>}<p className="font-semibold">{state.linked ? 'Telegram conectado' : state.available ? 'Telegram disponível para vínculo' : 'Vínculo indisponível no momento'}</p><div className="flex flex-wrap gap-3">{state.available && !state.linked && <button type="button" disabled={busy} onClick={() => action('/link')} className="rounded-lg bg-[var(--action)] px-4 py-2 font-semibold text-[var(--action-ink)] disabled:opacity-90">1. Gerar vínculo com Telegram</button>}{state.linked && <button type="button" disabled={busy} onClick={() => action('', 'DELETE')} className="rounded-lg border border-[var(--danger-border)] px-4 py-2 text-[var(--danger-text)] disabled:opacity-90">Desconectar Telegram</button>}{<button type="button" disabled={busy} onClick={refresh} className="rounded-lg border border-[var(--field-border)] px-4 py-2 disabled:opacity-90">Atualizar vínculo</button>}</div>
 {url && <div className="space-y-3 rounded-xl bg-[var(--info-bg)] p-4"><a href={url} target="_blank" rel="noopener noreferrer" className="inline-block rounded-lg border border-[var(--field-border)] px-4 py-2 font-semibold text-[var(--link)]">2. Abrir bot no Telegram ↗</a><p className="leading-6">Toque em <strong>Iniciar</strong> no Telegram. Volte aqui, clique em <strong>Atualizar vínculo</strong> e confirme a conta. O link expira em 10 minutos; não compartilhe.</p></div>}
 {state.pendingConfirmation && <div className="space-y-3 rounded-xl border border-[var(--warning-border)] p-4"><p>Conta encontrada: <strong>{state.candidateLabel || 'Telegram pessoal'}</strong>. Confirme somente se esta for a sua conta.</p><button type="button" disabled={busy} onClick={() => action('/confirm', 'POST', { ticketId: state.ticketId })} className="rounded-lg bg-[var(--action)] px-4 py-2 font-semibold text-[var(--action-ink)] disabled:opacity-90">3. Confirmar minha conta</button></div>}</>}
 {notice && <p role="status">{notice}</p>}{!state && <button type="button" disabled={busy} onClick={refresh} className="rounded-lg border border-[var(--field-border)] px-4 py-2 disabled:opacity-90">Tentar novamente</button>}
 </section>;
}
