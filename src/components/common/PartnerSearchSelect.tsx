import React, { useState, useEffect, useRef } from 'react';
import { Search, UserCheck, X, Check, ChevronsUpDown, ShieldAlert } from 'lucide-react';
import { Partner } from '../../types';

interface PartnerSearchSelectProps {
  partners: Partner[];
  selectedPartnerId: string;
  onSelectPartner: (partnerId: string) => void;
  label?: string;
  placeholder?: string;
  allowAll?: boolean;
  allLabel?: string;
  required?: boolean;
  className?: string;
  autoFocus?: boolean;
}

export const PartnerSearchSelect: React.FC<PartnerSearchSelectProps> = ({
  partners,
  selectedPartnerId,
  onSelectPartner,
  label = 'Parceiro de Venda *',
  placeholder = 'Digite o código (ex: 16740) ou nome do agente...',
  allowAll = false,
  allLabel = 'Todos os Parceiros',
  required = false,
  className = '',
  autoFocus = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const safePartners = Array.isArray(partners) ? partners : [];

  // Helper to extract code safely
  const extractCode = (partnerObj?: any) => {
    if (!partnerObj) return 'S/C';
    const code = String(partnerObj.code ?? '');
    const login = String(partnerObj.login ?? '');
    return code || login || 'S/C';
  };

  // Helper to get safe partner strings
  const getPartnerStrings = (p: any) => {
    const fullName = String(p?.fullName ?? p?.name ?? 'Parceiro');
    const login = String(p?.login ?? p?.code ?? fullName);
    return { fullName, login };
  };

  const selectedPartner = safePartners.find(p => p && p.id === selectedPartnerId);
  const selectedStrings = selectedPartner ? getPartnerStrings(selectedPartner) : null;

  // Close when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const normalizeText = (text: string) =>
    text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();

  // Filter partners based on query (defensive case-insensitive search by code, name or login)
  const filteredPartners = safePartners.filter(p => {
    if (!p) return false;
    const { fullName, login } = getPartnerStrings(p);
    const code = String(p.code ?? '');

    if (!query.trim()) return true;
    const q = normalizeText(query);

    const normFullName = normalizeText(fullName);
    const normLogin = normalizeText(login);
    const normCode = normalizeText(code);

    const loginParts = login.split('@');
    const part0 = normalizeText(loginParts[0] || '');
    const part1 = normalizeText(loginParts[1] || '');

    return (
      normFullName.includes(q) ||
      normLogin.includes(q) ||
      normCode.includes(q) ||
      part0.includes(q) ||
      part1.includes(q)
    );
  });

  // Reset highlighted index when query changes
  useEffect(() => {
    setHighlightedIndex(0);
  }, [query]);

  const handleSelect = (partnerId: string) => {
    onSelectPartner(partnerId);
    setIsOpen(false);
    setQuery('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        setIsOpen(true);
      }
      return;
    }

    const totalCount = allowAll ? filteredPartners.length + 1 : filteredPartners.length;
    if (totalCount === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex(prev => (prev + 1) % totalCount);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex(prev => (prev - 1 + totalCount) % totalCount);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (allowAll && highlightedIndex === 0) {
        handleSelect('');
      } else {
        const actualIndex = allowAll ? highlightedIndex - 1 : highlightedIndex;
        if (filteredPartners[actualIndex]) {
          handleSelect(filteredPartners[actualIndex].id);
        }
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      {label && (
        <label className="block text-xs font-semibold text-[var(--text-secondary)] dark:text-[var(--text-primary)] mb-1">
          {label}
        </label>
      )}

      {/* Selected State View (When partner is chosen and dropdown is closed) */}
      {selectedPartner && !isOpen && selectedStrings ? (
        <div
          onClick={() => {
            setIsOpen(true);
            setTimeout(() => inputRef.current?.focus(), 50);
          }}
          className="w-full flex items-center justify-between gap-2 rounded-lg border border-[var(--field-border)] bg-[var(--info-bg)] dark:bg-[var(--info-bg)] px-3 py-2 cursor-pointer hover:border-[var(--field-border)] hover:bg-[var(--info-bg)] dark:hover:bg-[var(--info-bg)] transition-all group shadow-xs"
        >
          <div className="flex items-center gap-2 overflow-hidden min-w-0">
            <span className="shrink-0 px-2 py-0.5 rounded-md bg-[var(--info-bg)] text-[var(--text-primary)] font-mono font-black text-[11px] shadow-xs">
              {extractCode(selectedPartner)}
            </span>
            <div className="min-w-0">
              <span className="text-xs font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)] truncate block">
                {selectedStrings.fullName}
              </span>
              <span className="text-[10px] text-[var(--text-secondary)] dark:text-[var(--text-secondary)] font-mono block -mt-0.5">
                Login: {selectedStrings.login}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onSelectPartner('');
                setIsOpen(true);
                setQuery('');
                setTimeout(() => inputRef.current?.focus(), 50);
              }}
              className="p-1 rounded hover:bg-[var(--bg-surface-elevated)] dark:hover:bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-secondary)] dark:hover:text-[var(--text-primary)] transition-colors"
              title="Trocar Agente"
            >
              <X className="h-3.5 w-3.5" />
            </button>
            <ChevronsUpDown className="h-3.5 w-3.5 text-[var(--text-secondary)] group-hover:text-[var(--link)] transition-colors" />
          </div>
        </div>
      ) : (
        /* Search Input View */
        <div className="relative">
          <div className="relative flex items-center">
            <Search className="absolute left-3 h-4 w-4 text-[var(--text-secondary)] pointer-events-none" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={e => {
                setQuery(e.target.value);
                if (!isOpen) setIsOpen(true);
              }}
              onFocus={() => setIsOpen(true)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              autoFocus={autoFocus}
              required={required && !selectedPartnerId}
              className="w-full rounded-lg border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] pl-9 pr-8 py-2 text-xs font-medium text-[var(--text-secondary)] dark:text-[var(--text-primary)] placeholder-[var(--text-secondary)] dark:placeholder-[var(--text-secondary)] focus:border-[var(--field-border)] dark:focus:border-[var(--field-border)] focus:ring-1 focus:ring-[var(--focus)] focus:outline-hidden transition-all shadow-xs"
            />
            {query && (
              <button
                type="button"
                onClick={() => {
                  setQuery('');
                  inputRef.current?.focus();
                }}
                className="absolute right-2.5 p-0.5 rounded text-[var(--text-secondary)] hover:text-[var(--text-secondary)] dark:hover:text-[var(--text-primary)]"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Floating Dropdown Results */}
      {isOpen && (
        <div className="absolute left-0 right-0 top-full mt-1.5 z-50 rounded-xl border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)]  overflow-hidden animate-in fade-in zoom-in-95 duration-100">
          <div className="px-3 py-1.5 bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface-elevated)] border-b border-[var(--field-border)] dark:border-[var(--field-border)] text-[10px] font-bold text-[var(--text-secondary)] dark:text-[var(--text-secondary)] flex items-center justify-between">
            <span>
              {query
                ? `${filteredPartners.length} agentes encontrados para "${query}"`
                : `Selecione um Agente/Parceiro (${safePartners.length} cadastrados)`}
            </span>
            <span className="text-[9px] text-[var(--text-secondary)] font-mono">
              Busca por Código ou Nome
            </span>
          </div>

          <div className="max-h-64 overflow-y-auto divide-y divide-[var(--field-border)] dark:divide-[var(--field-border)]">
            {allowAll && (
              <div
                onClick={() => handleSelect('')}
                className={`px-3 py-2.5 flex items-center justify-between cursor-pointer text-xs font-semibold transition-colors ${
                  selectedPartnerId === '' || (allowAll && highlightedIndex === 0)
                    ? 'bg-[var(--info-bg)] dark:bg-[var(--info-bg)] text-[var(--link)] dark:text-[var(--link)]'
                    : 'text-[var(--text-secondary)] dark:text-[var(--text-primary)] hover:bg-[var(--bg-canvas)] dark:hover:bg-[var(--bg-surface-elevated)]'
                }`}
              >
                <span>{allLabel}</span>
                {selectedPartnerId === '' && <Check className="h-4 w-4 text-[var(--link)] dark:text-[var(--link)]" />}
              </div>
            )}

            {filteredPartners.length === 0 ? (
              <div className="p-4 text-center text-xs text-[var(--text-secondary)] dark:text-[var(--text-secondary)] flex flex-col items-center gap-1">
                <ShieldAlert className="h-5 w-5 text-[var(--warning-text)] opacity-80" />
                <span>Nenhum agente encontrado com "{query}".</span>
                <span className="text-[10px] text-[var(--text-secondary)]">
                  Tente buscar pelo código numérico (ex: 16740) ou pelo nome.
                </span>
              </div>
            ) : (
              filteredPartners.map((p, index) => {
                const itemIndex = allowAll ? index + 1 : index;
                const isSelected = p.id === selectedPartnerId;
                const isHighlighted = itemIndex === highlightedIndex;
                const code = extractCode(p);
                const { fullName: itemFullName, login: itemLogin } = getPartnerStrings(p);

                return (
                  <div
                    key={p.id}
                    onClick={() => handleSelect(p.id)}
                    onMouseEnter={() => setHighlightedIndex(itemIndex)}
                    className={`px-3 py-2.5 flex items-center justify-between gap-3 cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-[var(--info-bg)] dark:bg-[var(--info-bg)] font-bold text-[var(--link)] dark:text-[var(--link)]'
                        : isHighlighted
                        ? 'bg-[var(--bg-surface-elevated)] dark:bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] dark:text-[var(--text-primary)]'
                        : 'text-[var(--text-secondary)] dark:text-[var(--text-primary)] hover:bg-[var(--bg-canvas)] dark:hover:bg-[var(--bg-surface-elevated)]'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="shrink-0 px-2 py-0.5 rounded bg-[var(--bg-surface)] dark:bg-[var(--bg-surface-elevated)] text-[var(--link)] font-mono font-bold text-[11px] border border-[var(--field-border)]">
                        {code}
                      </span>
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)] truncate">
                          {itemFullName}
                        </div>
                        <div className="text-[10px] font-mono text-[var(--text-secondary)] dark:text-[var(--text-secondary)] truncate">
                          Login: {itemLogin}
                        </div>
                      </div>
                    </div>

                    {isSelected && (
                      <Check className="h-4 w-4 text-[var(--link)] dark:text-[var(--link)] shrink-0" />
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};
