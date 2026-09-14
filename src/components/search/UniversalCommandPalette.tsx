import React, { useState, useEffect, useRef } from 'react';
import {
  Search,
  Users,
  FileText,
  Building2,
  Calendar,
  Command,
  ArrowRight,
  X,
  Plus,
  Tv,
  TrendingUp,
  Trophy,
  Bot,
  Layers,
  HardDrive,
  Copy,
} from 'lucide-react';
import { StorageService } from '../../services/storageService';
import { normalizeCpf, formatCpf, formatCurrency } from '../../lib/utils';
import { Client, Proposal, Partner, OperationalTask } from '../../types';

interface UniversalCommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (tab: any, params?: any) => void;
}

export const UniversalCommandPalette: React.FC<UniversalCommandPaletteProps> = ({
  isOpen,
  onClose,
  onNavigate,
}) => {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const clients = StorageService.getClients();
  const proposals = StorageService.getProposals();
  const partners = StorageService.getPartners();
  const tasks = StorageService.getOperationalTasks();

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setQuery('');
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (isOpen) onClose();
        else onNavigate(null as any);
      }
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, onNavigate]);

  if (!isOpen) return null;

  const cleanQ = query.trim().toLowerCase();
  const cleanCpf = normalizeCpf(cleanQ);

  // Search clients
  const matchedClients = cleanQ
    ? clients
        .filter(c => c.fullName.toLowerCase().includes(cleanQ) || (cleanCpf && c.cpf.includes(cleanCpf)))
        .slice(0, 4)
    : [];

  // Search proposals
  const matchedProposals = cleanQ
    ? proposals
        .filter(p => p.proposalNumber.toLowerCase().includes(cleanQ) || (p.notes && p.notes.toLowerCase().includes(cleanQ)))
        .slice(0, 4)
    : [];

  // Search partners
  const matchedPartners = cleanQ
    ? partners
        .filter(
          pt =>
            pt.login.toLowerCase().includes(cleanQ) ||
            (pt.fullName && pt.fullName.toLowerCase().includes(cleanQ))
        )
        .slice(0, 3)
    : [];

  // Search tasks
  const matchedTasks = cleanQ
    ? tasks
        .filter(
          t =>
            t.title.toLowerCase().includes(cleanQ) ||
            (t.clientName && t.clientName.toLowerCase().includes(cleanQ))
        )
        .slice(0, 3)
    : [];

  const quickNavItems = [
    { label: 'Visão do Cliente 360º', tab: 'clients_360', icon: Users, desc: 'Ficha completa, documentos e WhatsApp' },
    { label: 'Monitor de TV em Tempo Real', tab: 'tv_monitor', icon: Tv, desc: 'Sala de controle e rankings ao vivo' },
    { label: 'Radar Comercial & BI', tab: 'commercial_radar', icon: TrendingUp, desc: 'Conversão por banco e tendências' },
    { label: 'Sentinela IA Assistente', tab: 'sentinela_ai', icon: Bot, desc: 'Consultas operacionais em linguagem natural' },
    { label: 'Agenda & Tarefas Operacionais', tab: 'agenda', icon: Calendar, desc: 'Gestão de prazos e pendências CIP' },
    { label: 'Central de Conquistas & Gamificação', tab: 'gamification', icon: Trophy, desc: 'Medalhas e metas de operadores' },
    { label: 'Central de Gestão SaaS & Tenants', tab: 'saas_tenants', icon: HardDrive, desc: 'Administração multi-empresa e backups' },
  ];

  const filteredQuickNav = cleanQ
    ? quickNavItems.filter(
        item => item.label.toLowerCase().includes(cleanQ) || item.desc.toLowerCase().includes(cleanQ)
      )
    : quickNavItems;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 sm:pt-20 bg-slate-950/70 p-4 backdrop-blur-xs">
      <div className="w-full max-w-2xl rounded-2xl bg-white dark:bg-[#0c1220] shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[85vh]">
        {/* Search Input Bar */}
        <div className="relative border-b border-slate-200 dark:border-slate-800 p-4 flex items-center gap-3 bg-slate-50/70 dark:bg-slate-900/60">
          <Search className="h-5 w-5 text-slate-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Pesquise por CPF, Nome de Cliente, ADE / Proposta, Parceiro ou Módulo..."
            className="flex-1 text-sm text-slate-900 dark:text-slate-100 bg-transparent placeholder:text-slate-400 focus:outline-hidden"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          )}
          <span className="text-[10px] font-mono font-bold text-slate-500 dark:text-slate-400 bg-slate-200 dark:bg-slate-800 px-2 py-0.5 rounded">
            ESC
          </span>
        </div>

        {/* Results Area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Matched Clients */}
          {matchedClients.length > 0 && (
            <div className="space-y-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                <span>Clientes Encontrados ({matchedClients.length})</span>
              </span>
              <div className="space-y-1">
                {matchedClients.map(c => (
                  <button
                    key={c.id}
                    onClick={() => {
                      onNavigate('clients_360', { clientId: c.id, cpf: c.cpf });
                      onClose();
                    }}
                    className="w-full flex items-center justify-between p-2.5 rounded-xl hover:bg-blue-50/80 dark:hover:bg-blue-950/40 border border-transparent hover:border-blue-200 dark:hover:border-blue-800/60 transition-all text-left cursor-pointer group"
                  >
                    <div>
                      <span className="font-bold text-xs text-slate-900 dark:text-slate-100 group-hover:text-blue-700 dark:group-hover:text-blue-400 block">
                        {c.fullName}
                      </span>
                      <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                        {formatCpf(c.cpf)} {c.convenio ? `• ${c.convenio}` : ''}
                      </span>
                    </div>
                    <ArrowRight className="h-4 w-4 text-slate-400 group-hover:text-blue-600 dark:group-hover:text-blue-400 transform group-hover:translate-x-0.5 transition-transform" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Matched Proposals */}
          {matchedProposals.length > 0 && (
            <div className="space-y-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 flex items-center gap-1.5">
                <FileText className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                <span>Propostas / ADEs ({matchedProposals.length})</span>
              </span>
              <div className="space-y-1">
                {matchedProposals.map(p => (
                  <button
                    key={p.id}
                    onClick={() => {
                      onNavigate('proposals', { proposalId: p.id });
                      onClose();
                    }}
                    className="w-full flex items-center justify-between p-2.5 rounded-xl hover:bg-emerald-50/80 dark:hover:bg-emerald-950/40 border border-transparent hover:border-emerald-200 dark:hover:border-emerald-800/60 transition-all text-left cursor-pointer group"
                  >
                    <div>
                      <span className="font-mono font-bold text-xs text-slate-900 dark:text-slate-100 group-hover:text-emerald-700 dark:group-hover:text-emerald-400 block">
                        ADE {p.proposalNumber}
                      </span>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                        Liberado: {formatCurrency(p.disbursedValue || 0)}
                      </span>
                    </div>
                    <ArrowRight className="h-4 w-4 text-slate-400 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transform group-hover:translate-x-0.5 transition-transform" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Matched Partners */}
          {matchedPartners.length > 0 && (
            <div className="space-y-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 flex items-center gap-1.5">
                <Building2 className="h-3.5 w-3.5 text-purple-600 dark:text-purple-400" />
                <span>Parceiros / Corbans ({matchedPartners.length})</span>
              </span>
              <div className="space-y-1">
                {matchedPartners.map(pt => (
                  <button
                    key={pt.id}
                    onClick={() => {
                      onNavigate('parceiros');
                      onClose();
                    }}
                    className="w-full flex items-center justify-between p-2.5 rounded-xl hover:bg-purple-50/80 dark:hover:bg-purple-950/40 border border-transparent hover:border-purple-200 dark:hover:border-purple-800/60 transition-all text-left cursor-pointer group"
                  >
                    <div>
                      <span className="font-mono font-bold text-xs text-slate-900 dark:text-slate-100 group-hover:text-purple-700 dark:group-hover:text-purple-400 block">
                        {pt.login}
                      </span>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400">
                        {pt.fullName || 'Correspondente Parceiro'}
                      </span>
                    </div>
                    <ArrowRight className="h-4 w-4 text-slate-400 group-hover:text-purple-600 dark:group-hover:text-purple-400 transform group-hover:translate-x-0.5 transition-transform" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Quick Navigation / Shortcuts */}
          <div className="space-y-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 flex items-center gap-1.5">
              <Command className="h-3.5 w-3.5 text-slate-600 dark:text-slate-400" />
              <span>Navegação Rápida & Módulos</span>
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {filteredQuickNav.map((item, idx) => {
                const Icon = item.icon;
                return (
                  <button
                    key={idx}
                    onClick={() => {
                      onNavigate(item.tab);
                      onClose();
                    }}
                    className="flex items-start gap-3 p-3 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900/80 hover:border-blue-300 dark:hover:border-blue-700 hover:bg-blue-50/50 dark:hover:bg-blue-950/40 transition-all text-left cursor-pointer group"
                  >
                    <div className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 group-hover:bg-blue-100 dark:group-hover:bg-blue-900 group-hover:text-blue-700 dark:group-hover:text-blue-300">
                      <Icon className="h-4 w-4" />
                    </div>
                    <div>
                      <span className="font-bold text-xs text-slate-900 dark:text-slate-100 group-hover:text-blue-700 dark:group-hover:text-blue-400 block">
                        {item.label}
                      </span>
                      <span className="text-[11px] text-slate-400 dark:text-slate-500 block">{item.desc}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-slate-100 dark:border-slate-800/80 bg-slate-50 dark:bg-slate-900/60 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
          <div className="flex items-center gap-2">
            <span>
              Dica: Pressione <strong className="font-mono text-slate-800 dark:text-slate-200">Ctrl + K</strong> a qualquer momento para abrir esta busca universal.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
