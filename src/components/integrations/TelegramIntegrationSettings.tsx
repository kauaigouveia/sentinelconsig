import React, { useEffect, useState } from 'react';
import { Send } from 'lucide-react';
type Settings = {
    bot: string;
    configured: boolean;
    registered: boolean;
    enabled: boolean;
    platformMaster: boolean;
    canManage: boolean;
};
export function TelegramIntegrationSettings() {
    const [settings, setSettings] = useState<Settings | null>(null), [token, setToken] = useState(''), [busy, setBusy] = useState(false), [notice, setNotice] = useState('');
    async function load() { const response = await fetch('/api/integrations/telegram/config', { cache: 'no-store' }); const data = await response.json(); if (!response.ok)
        throw new Error(data.error); setSettings(data); }
    useEffect(() => { let active = true; fetch('/api/integrations/telegram/config', { cache: 'no-store' }).then(async (response) => { const data = await response.json(); if (!response.ok)
        throw new Error(data.error); if (active)
        setSettings(data); }).catch(() => { if (active)
        setNotice('Não foi possível carregar a configuração Telegram.'); }); return () => { active = false; }; }, []);
    async function action(path: string, body: unknown, method = 'POST') { setBusy(true); setNotice(''); try {
        const response = await fetch(`/api/integrations/telegram/${path}`, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        const data = await response.json();
        if (!response.ok)
            throw new Error(data.error);
        setToken('');
        await load();
        setNotice('Configuração atualizada.');
    }
    catch (error) {
        setNotice(error instanceof Error ? error.message : 'Não foi possível salvar.');
    }
    finally {
        setBusy(false);
    } }
    return <section className="space-y-4 rounded-2xl border border-blue-500/30 bg-white p-5 dark:bg-slate-900"><header className="flex items-center gap-3"><Send className="text-blue-500" size={22}/><div><h2 className="text-base font-bold">Telegram · Sentinel Conecta</h2><p className="mt-1 text-sm text-slate-500">Um bot compartilhado. Os avisos levam o nome da sua empresa e seguem o parceiro vinculado no portal.</p></div></header>
 <p className="text-sm leading-6">Avisos: saldo retornado, ação do parceiro ou cliente, proposta cancelada e proposta paga. O envio acompanha as atualizações registradas no Sentinel, em ciclos de até 5 minutos.</p>
 {settings && <><p className="text-sm">Bot: <strong>@{settings.bot}</strong> · {settings.registered ? 'Conexão pronta' : settings.configured ? 'Falta ativar recebimento' : 'Aguardando configuração da plataforma'}</p><label className="flex items-center gap-3 text-sm font-semibold"><input type="checkbox" checked={settings.enabled} disabled={busy || !settings.registered || !settings.canManage} onChange={event => action('config', { enabled: event.target.checked }, 'PUT')}/>Habilitar avisos para esta empresa</label>
 {settings.platformMaster && <div className="space-y-3 rounded-xl border border-slate-500/20 p-4"><h3 className="font-semibold">Configuração global · administração da plataforma</h3><p className="text-sm text-slate-500">O token é criptografado e não será exibido novamente. Cadastre o token do @SentinelConectaBot e depois ative o recebimento de vínculos.</p><label className="block text-sm">Token do BotFather<input type="password" autoComplete="new-password" value={token} onChange={event => setToken(event.target.value)} placeholder={settings.configured ? 'Cadastrado — preencha somente para alterar' : 'Cole o token neste campo protegido'} className="mt-2 block w-full rounded-lg border border-slate-500/30 bg-transparent p-3"/></label><div className="flex flex-wrap gap-3"><button type="button" disabled={busy || !token.trim()} onClick={() => action('bot', { token }, 'PUT')} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">Salvar token</button><button type="button" disabled={busy || !settings.configured} onClick={() => action('webhook', {})} className="rounded-lg border border-blue-500/40 px-4 py-2 text-sm font-semibold disabled:opacity-40">Ativar recebimento de vínculos</button></div></div>}</>}
 {notice && <p role="status" className="text-sm">{notice}</p>}
 </section>;
}
