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
  const [tasks, setTasks] = useState<any[]>([]);

  useEffect(() => {
    if (isOpen) {
      fetch('/api/tasks').then(r => r.json()).then(d => {
        if (Array.isArray(d)) setTasks(d);
      }).catch(e => console.error(e));
    }
  }, [isOpen]);


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
    { label: 'Gestão de Empresas & Assinaturas', tab: 'saas_tenants', icon: HardDrive, desc: 'Administração multi-empresa e planos' },
  ];

  const filteredQuickNav = cleanQ
    ? quickNavItems.filter(
        item => item.label.toLowerCase().includes(cleanQ) || item.desc.toLowerCase().includes(cleanQ)
      )
    : quickNavItems;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 sm:pt-20 bg-[var(--scrim)] p-4 backdrop-blur-xs">
      <div className="w-full max-w-2xl rounded-2xl bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)]  border border-[var(--field-border)] dark:border-[var(--field-border)] overflow-hidden flex flex-col max-h-[85vh]">
        {/* Search Input Bar */}
        <div className="relative border-b border-[var(--field-border)] dark:border-[var(--field-border)] p-4 flex items-center gap-3 bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface)]">
          <Search className="h-5 w-5 text-[var(--text-secondary)] shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Pesquise por CPF, Nome de Cliente, ADE / Proposta, Parceiro ou Módulo..."
            className="flex-1 text-sm text-[var(--text-secondary)] dark:text-[var(--text-primary)] bg-transparent placeholder:text-[var(--text-secondary)] focus:outline-hidden"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="text-[var(--text-secondary)] hover:text-[var(--text-secondary)] dark:hover:text-[var(--text-primary)] cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          )}
          <span className="text-[10px] font-mono font-bold text-[var(--text-secondary)] dark:text-[var(--text-secondary)] bg-[var(--bg-surface-elevated)] dark:bg-[var(--bg-surface-elevated)] px-2 py-0.5 rounded">
            ESC
          </span>
        </div>

        {/* Results Area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Matched Clients */}
          {matchedClients.length > 0 && (
            <div className="space-y-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-secondary)] dark:text-[var(--text-secondary)] flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5 text-[var(--link)] dark:text-[var(--link)]" />
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
                    className="w-full flex items-center justify-between p-2.5 rounded-xl hover:bg-[var(--info-bg)] dark:hover:bg-[var(--info-bg)] border border-transparent hover:border-[var(--field-border)] dark:hover:border-[var(--field-border)] transition-all text-left cursor-pointer group"
                  >
                    <div>
                      <span className="font-bold text-xs text-[var(--text-secondary)] dark:text-[var(--text-primary)] group-hover:text-[var(--link)] dark:group-hover:text-[var(--link)] block">
                        {c.fullName}
                      </span>
                      <span className="text-[11px] font-mono text-[var(--text-secondary)] dark:text-[var(--text-secondary)]">
                        {formatCpf(c.cpf)} {c.convenio ? `• ${c.convenio}` : ''}
                      </span>
                    </div>
                    <ArrowRight className="h-4 w-4 text-[var(--text-secondary)] group-hover:text-[var(--link)] dark:group-hover:text-[var(--link)] transform group-hover:translate-x-0.5 transition-transform" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Matched Proposals */}
          {matchedProposals.length > 0 && (
            <div className="space-y-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-secondary)] dark:text-[var(--text-secondary)] flex items-center gap-1.5">
                <FileText className="h-3.5 w-3.5 text-[var(--success-text)] dark:text-[var(--success-text)]" />
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
                    className="w-full flex items-center justify-between p-2.5 rounded-xl hover:bg-[var(--success-bg)] dark:hover:bg-[var(--success-bg)] border border-transparent hover:border-[var(--success-border)] dark:hover:border-[var(--success-border)] transition-all text-left cursor-pointer group"
                  >
                    <div>
                      <span className="font-mono font-bold text-xs text-[var(--text-secondary)] dark:text-[var(--text-primary)] group-hover:text-[var(--success-text)] dark:group-hover:text-[var(--success-text)] block">
                        ADE {p.proposalNumber}
                      </span>
                      <span className="text-[11px] text-[var(--text-secondary)] dark:text-[var(--text-secondary)] font-mono">
                        Liberado: {formatCurrency(p.disbursedValue || 0)}
                      </span>
                    </div>
                    <ArrowRight className="h-4 w-4 text-[var(--text-secondary)] group-hover:text-[var(--success-text)] dark:group-hover:text-[var(--success-text)] transform group-hover:translate-x-0.5 transition-transform" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Matched Partners */}
          {matchedPartners.length > 0 && (
            <div className="space-y-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-secondary)] dark:text-[var(--text-secondary)] flex items-center gap-1.5">
                <Building2 className="h-3.5 w-3.5 text-[var(--link)] dark:text-[var(--link)]" />
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
                    className="w-full flex items-center justify-between p-2.5 rounded-xl hover:bg-[var(--info-bg)] dark:hover:bg-[var(--info-bg)] border border-transparent hover:border-[var(--field-border)] dark:hover:border-[var(--field-border)] transition-all text-left cursor-pointer group"
                  >
                    <div>
                      <span className="font-mono font-bold text-xs text-[var(--text-secondary)] dark:text-[var(--text-primary)] group-hover:text-[var(--link)] dark:group-hover:text-[var(--link)] block">
                        {pt.login}
                      </span>
                      <span className="text-[11px] text-[var(--text-secondary)] dark:text-[var(--text-secondary)]">
                        {pt.fullName || 'Correspondente Parceiro'}
                      </span>
                    </div>
                    <ArrowRight className="h-4 w-4 text-[var(--text-secondary)] group-hover:text-[var(--link)] dark:group-hover:text-[var(--link)] transform group-hover:translate-x-0.5 transition-transform" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Quick Navigation / Shortcuts */}
          <div className="space-y-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-secondary)] dark:text-[var(--text-secondary)] flex items-center gap-1.5">
              <Command className="h-3.5 w-3.5 text-[var(--text-secondary)] dark:text-[var(--text-secondary)]" />
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
                    className="flex items-start gap-3 p-3 rounded-xl border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] hover:border-[var(--field-border)] dark:hover:border-[var(--field-border)] hover:bg-[var(--info-bg)] dark:hover:bg-[var(--info-bg)] transition-all text-left cursor-pointer group"
                  >
                    <div className="p-2 rounded-lg bg-[var(--bg-surface-elevated)] dark:bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] dark:text-[var(--text-primary)] group-hover:bg-[var(--info-bg)] dark:group-hover:bg-[var(--info-bg)] group-hover:text-[var(--link)] dark:group-hover:text-[var(--link)]">
                      <Icon className="h-4 w-4" />
                    </div>
                    <div>
                      <span className="font-bold text-xs text-[var(--text-secondary)] dark:text-[var(--text-primary)] group-hover:text-[var(--link)] dark:group-hover:text-[var(--link)] block">
                        {item.label}
                      </span>
                      <span className="text-[11px] text-[var(--text-secondary)] dark:text-[var(--text-secondary)] block">{item.desc}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface)] flex items-center justify-between text-[11px] text-[var(--text-secondary)] dark:text-[var(--text-secondary)]">
          <div className="flex items-center gap-2">
            <span>
              Dica: Pressione <strong className="font-mono text-[var(--text-secondary)] dark:text-[var(--text-primary)]">Ctrl + K</strong> a qualquer momento para abrir esta busca universal.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
