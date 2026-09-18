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
    const login = String(partnerObj.login ?? '');
    const code = String(partnerObj.code ?? '');
    return login || code || 'S/C';
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

  // Filter partners based on query (defensive case-insensitive search by code, name or login)
  const filteredPartners = safePartners.filter(p => {
    if (!p) return false;
    const { fullName, login } = getPartnerStrings(p);
    
    if (!query.trim()) return true;
    const q = query.trim().toLowerCase();
    
    const loginParts = login.split('@');
    const loginName = loginParts[0] || '';
    const codePart = loginParts[1] || (p as any).code || '';

    return (
      codePart.toLowerCase().includes(q) ||
      login.toLowerCase().includes(q) ||
      fullName.toLowerCase().includes(q) ||
      loginName.toLowerCase().includes(q)
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
        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
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
          className="w-full flex items-center justify-between gap-2 rounded-lg border border-blue-500/40 bg-blue-50/60 dark:bg-blue-950/40 px-3 py-2 cursor-pointer hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-950/60 transition-all group shadow-xs"
        >
          <div className="flex items-center gap-2 overflow-hidden min-w-0">
            <span className="shrink-0 px-2 py-0.5 rounded-md bg-blue-600 text-white font-mono font-black text-[11px] shadow-xs">
              {extractCode(selectedPartner)}
            </span>
            <div className="min-w-0">
              <span className="text-xs font-bold text-slate-900 dark:text-white truncate block">
                {selectedStrings.fullName}
              </span>
              <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono block -mt-0.5">
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
              className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
              title="Trocar Agente"
            >
              <X className="h-3.5 w-3.5" />
            </button>
            <ChevronsUpDown className="h-3.5 w-3.5 text-slate-400 group-hover:text-blue-500 transition-colors" />
          </div>
        </div>
      ) : (
        /* Search Input View */
        <div className="relative">
          <div className="relative flex items-center">
            <Search className="absolute left-3 h-4 w-4 text-slate-400 pointer-events-none" />
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
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 pl-9 pr-8 py-2 text-xs font-medium text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-hidden transition-all shadow-xs"
            />
            {query && (
              <button
                type="button"
                onClick={() => {
                  setQuery('');
                  inputRef.current?.focus();
                }}
                className="absolute right-2.5 p-0.5 rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Floating Dropdown Results */}
      {isOpen && (
        <div className="absolute left-0 right-0 top-full mt-1.5 z-50 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-100">
          <div className="px-3 py-1.5 bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 text-[10px] font-bold text-slate-500 dark:text-slate-400 flex items-center justify-between">
            <span>
              {query
                ? `${filteredPartners.length} agentes encontrados para "${query}"`
                : `Selecione um Agente/Parceiro (${partners.length} cadastrados)`}
            </span>
            <span className="text-[9px] text-slate-400 font-mono">
              Busca por Código ou Nome
            </span>
          </div>

          <div className="max-h-64 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/50">
            {allowAll && (
              <div
                onClick={() => handleSelect('')}
                className={`px-3 py-2.5 flex items-center justify-between cursor-pointer text-xs font-semibold transition-colors ${
                  selectedPartnerId === '' || (allowAll && highlightedIndex === 0)
                    ? 'bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                }`}
              >
                <span>{allLabel}</span>
                {selectedPartnerId === '' && <Check className="h-4 w-4 text-blue-600 dark:text-blue-400" />}
              </div>
            )}

            {filteredPartners.length === 0 ? (
              <div className="p-4 text-center text-xs text-slate-500 dark:text-slate-400 flex flex-col items-center gap-1">
                <ShieldAlert className="h-5 w-5 text-amber-500 opacity-80" />
                <span>Nenhum agente encontrado com "{query}".</span>
                <span className="text-[10px] text-slate-400">
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
                        ? 'bg-blue-50 dark:bg-blue-950/60 font-bold text-blue-900 dark:text-blue-200'
                        : isHighlighted
                        ? 'bg-slate-100 dark:bg-slate-800/80 text-slate-900 dark:text-slate-100'
                        : 'text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/40'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="shrink-0 px-2 py-0.5 rounded bg-slate-900 dark:bg-slate-800 text-blue-400 font-mono font-bold text-[11px] border border-slate-700">
                        {code}
                      </span>
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-slate-900 dark:text-white truncate">
                          {itemFullName}
                        </div>
                        <div className="text-[10px] font-mono text-slate-500 dark:text-slate-400 truncate">
                          Login: {itemLogin}
                        </div>
                      </div>
                    </div>

                    {isSelected && (
                      <Check className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0" />
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
