import React, { useState, useEffect } from 'react';
import {
  X,
  Plus,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Building,
  UserCheck,
  CreditCard,
  FileSpreadsheet,
  Link2,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react';
import { StorageService } from '../../services/storageService';
import { normalizeCpf, formatCpf, extractPartnerCode, isValidCpf, parseCurrency, formatCurrency } from '../../lib/utils';
import { Product, Bank, Promoter, Partner, Client } from '../../types';
import { PartnerSearchSelect } from '../common/PartnerSearchSelect';

interface AdeRow {
  id: string;
  proposalNumber: string;
  productId: string;
  bankId: string;
  promoterId: string;
  disbursedValue?: string | number; // Valor liberado cliente
  contractBalance?: string | number; // Saldo do contrato (portabilidade)
  notes?: string;
  linkWithPortabilityIndex?: number; // link to another row in this batch
}

interface NewProductionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (count: number) => void;
}

export const NewProductionModal: React.FC<NewProductionModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [cpf, setCpf] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [existingClient, setExistingClient] = useState<Client | null>(null);
  const [existingProposalCount, setExistingProposalCount] = useState(0);

  const [selectedPartnerId, setSelectedPartnerId] = useState('');
  const [mode, setMode] = useState<'RAPIDO' | 'COMPLETO'>('RAPIDO');

  const [products, setProducts] = useState<Product[]>([]);
  const [banks, setBanks] = useState<Bank[]>([]);
  const [promoters, setPromoters] = useState<Promoter[]>([]);
  const [partners, setPartners] = useState<Partner[]>([]);

  const [adeRows, setAdeRows] = useState<AdeRow[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      const p = StorageService.getProducts().filter(x => x.active);
      const b = StorageService.getBanks().filter(x => x.active);
      const pr = StorageService.getPromoters().filter(x => x.active);
      
      setProducts(p);
      setBanks(b);
      setPromoters(pr);

      // 1. Initial synchronous load from StorageService so partners are immediately available
      const localPartners = StorageService.getPartners().filter(x => x.active !== false);
      if (localPartners.length > 0) {
        setPartners(localPartners);
        if (!selectedPartnerId || !localPartners.some(pt => pt.id === selectedPartnerId)) {
          setSelectedPartnerId(localPartners[0].id);
        }
      }

      // 2. Fetch fresh partners from API with tenant isolation
      fetch('/api/partners', { headers: { 'Accept': 'application/json' } })
        .then(async res => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.json();
        })
        .then(data => {
          if (Array.isArray(data) && data.length > 0) {
            const currentTenantId = StorageService.getCurrentTenantId();
            const activePartners = data
              .map((pt: any) => ({
                id: pt.id,
                fullName: pt.fullName || pt.name || 'Parceiro sem Nome',
                login: pt.login || pt.code || '',
                code: pt.code || pt.login || '',
                promoterId: pt.promoterId || '',
                active: pt.active !== undefined ? Boolean(pt.active) : (pt.status !== 'INATIVO'),
                tenantId: pt.tenantId || currentTenantId,
                createdAt: pt.createdAt,
                updatedAt: pt.updatedAt,
              }))
              .filter((pt: any) => {
                if (pt.active === false || pt.status === 'INATIVO') return false;
                if (pt.tenantId && currentTenantId && pt.tenantId !== currentTenantId) return false;
                return true;
              });

            if (activePartners.length > 0) {
              setPartners(activePartners);
              if (!selectedPartnerId || !activePartners.some(pt => pt.id === selectedPartnerId)) {
                setSelectedPartnerId(activePartners[0].id);
              }
              localStorage.setItem('cg_partners', JSON.stringify(activePartners));
            }
          }
        })
        .catch(err => {
          console.warn('[NewProductionModal] Using partners from StorageService:', err);
          const fallback = StorageService.getPartners().filter(x => x.active !== false);
          setPartners(fallback);
          if (fallback.length > 0 && (!selectedPartnerId || !fallback.some(pt => pt.id === selectedPartnerId))) {
            setSelectedPartnerId(fallback[0].id);
          }
        });

      // Initial blank row
      if (adeRows.length === 0 && p.length > 0 && b.length > 0 && pr.length > 0) {
        const defaultBank = b[0];
        const allowedPromoters = StorageService.getPromotersForBank(defaultBank.id);
        const defaultPromoter = allowedPromoters[0] || pr[0];

        setAdeRows([
          {
            id: 'row-1',
            proposalNumber: '',
            productId: p[0].id,
            bankId: defaultBank.id,
            promoterId: defaultPromoter.id,
            notes: '',
          },
        ]);
      }
    }
  }, [isOpen]);

  const [linkingErrorLog, setLinkingErrorLog] = useState<{
    title: string;
    message: string;
    details?: string;
    timestamp: string;
  } | null>(null);

  // When CPF changes, auto-search client and pending data
  const handleCpfChange = (val: string) => {
    const clean = normalizeCpf(val);
    setCpf(val);
    setErrorMsg(null);
    setLinkingErrorLog(null);

    if (clean.length === 11) {
      const lookup = StorageService.lookupClientAndPendingData(clean);
      if (lookup.client) {
        setExistingClient(lookup.client);
        if (lookup.suggestedName && (!fullName.trim() || fullName === 'CLIENTE NÃO NOMEADO')) {
          setFullName(lookup.suggestedName);
        }
        if (lookup.suggestedPhone && !phone) setPhone(lookup.suggestedPhone);
        if (lookup.suggestedEmail && !email) setEmail(lookup.suggestedEmail);
        setExistingProposalCount(lookup.pendingProposals.length);
      } else if (lookup.suggestedName) {
        if (!fullName.trim() || fullName === 'CLIENTE NÃO NOMEADO') {
          setFullName(lookup.suggestedName);
        }
        if (lookup.suggestedPhone && !phone) setPhone(lookup.suggestedPhone);
        if (lookup.suggestedEmail && !email) setEmail(lookup.suggestedEmail);
        setExistingClient(null);
        setExistingProposalCount(lookup.pendingProposals.length);
      } else {
        setExistingClient(null);
        setExistingProposalCount(0);
      }
    } else {
      setExistingClient(null);
      setExistingProposalCount(0);
    }
  };

  // When Partner changes, auto-suggest partner's linked promoter
  const handlePartnerChange = (partnerId: string) => {
    setSelectedPartnerId(partnerId);
    const partner = partners.find(p => p.id === partnerId);
    if (partner) {
      // update default promoter in rows if matches allowed
      setAdeRows(prev =>
        prev.map(row => {
          if (StorageService.isBankPromoterAllowed(row.bankId, partner.promoterId)) {
            return { ...row, promoterId: partner.promoterId };
          }
          return row;
        })
      );
    }
  };

  // Add new ADE Row
  const handleAddRow = () => {
    const defaultProduct = products[0] || { id: '' };
    const defaultBank = banks[0] || { id: '' };
    const allowed = defaultBank.id ? StorageService.getPromotersForBank(defaultBank.id) : [];
    const defaultPromoter = allowed[0] || promoters[0] || { id: '' };

    // Check if there's already a PORTABILIDADE row in adeRows
    let defaultLinkIndex: number | undefined = undefined;
    const existingPortIndex = adeRows.findIndex(r => {
      const prod = products.find(p => p.id === r.productId);
      return prod?.name === 'PORTABILIDADE' || prod?.type === 'PORTABILIDADE';
    });
    if (existingPortIndex !== -1) {
      defaultLinkIndex = existingPortIndex;
    }

    setAdeRows(prev => [
      ...prev,
      {
        id: `row-${Date.now()}-${prev.length + 1}`,
        proposalNumber: '',
        productId: defaultProduct.id,
        bankId: defaultBank.id,
        promoterId: defaultPromoter.id,
        notes: '',
        linkWithPortabilityIndex: defaultLinkIndex,
      },
    ]);
  };

  // Remove row
  const handleRemoveRow = (index: number) => {
    if (adeRows.length <= 1) return;
    setAdeRows(prev => prev.filter((_, i) => i !== index));
  };

  // Update row
  const handleUpdateRow = (index: number, field: keyof AdeRow, value: any) => {
    setAdeRows(prev => {
      const updated = [...prev];
      const row = { ...updated[index], [field]: value };

      // If bank changed, verify if current promoter is valid for new bank; if not, auto-select first allowed
      if (field === 'bankId') {
        const allowedPromoters = StorageService.getPromotersForBank(value);
        if (allowedPromoters.length > 0 && !allowedPromoters.some(pr => pr.id === row.promoterId)) {
          row.promoterId = allowedPromoters[0].id;
        }
      }

      // If product changed to REFIN DA PORTABILIDADE, auto-select link to preceding PORTABILIDADE row
      if (field === 'productId') {
        const selectedProd = products.find(p => p.id === value);
        if (
          selectedProd?.name === 'REFIN DA PORTABILIDADE' ||
          selectedProd?.requiresPortabilityRelation ||
          selectedProd?.name?.toUpperCase().includes('REFIN')
        ) {
          const portIndex = updated.findIndex((r, idx) => {
            if (idx === index) return false;
            const pObj = products.find(p => p.id === r.productId);
            return pObj?.name === 'PORTABILIDADE' || pObj?.type === 'PORTABILIDADE';
          });
          if (portIndex !== -1) {
            row.linkWithPortabilityIndex = portIndex;
          }
        }
      }

      updated[index] = row;
      return updated;
    });
  };

  // Save All
  const handleSave = () => {
    setErrorMsg(null);
    setSuccessMsg(null);

    const cleanCpf = normalizeCpf(cpf);
    if (cleanCpf.length !== 11) {
      setErrorMsg('CPF inválido ou incompleto. Deve conter 11 dígitos.');
      return;
    }

    if (!fullName.trim()) {
      setErrorMsg('O nome completo do cliente é obrigatório.');
      return;
    }

    if (!selectedPartnerId) {
      setErrorMsg('Selecione o parceiro responsável pela produção.');
      return;
    }

    // Validate rows
    const seenNumbers = new Set<string>();
    for (let i = 0; i < adeRows.length; i++) {
      const row = adeRows[i];
      if (!row.proposalNumber.trim()) {
        setErrorMsg(`Linha ${i + 1}: Informe o número da ADE/Proposta.`);
        return;
      }
      const numUpper = row.proposalNumber.trim().toUpperCase();
      if (seenNumbers.has(numUpper)) {
        setErrorMsg(`Linha ${i + 1}: ADE "${row.proposalNumber}" repetida no mesmo formulário.`);
        return;
      }
      seenNumbers.add(numUpper);

      // Bank × Promoter validation
      if (!StorageService.isBankPromoterAllowed(row.bankId, row.promoterId)) {
        const bank = banks.find(b => b.id === row.bankId);
        const promoter = promoters.find(p => p.id === row.promoterId);
        setErrorMsg(`Linha ${i + 1}: A promotora ${promoter?.name} NÃO está habilitada para o banco ${bank?.name}.`);
        return;
      }
    }

    // Integrity check for REFIN DA PORTABILIDADE to prevent orphan proposals
    for (let i = 0; i < adeRows.length; i++) {
      const row = adeRows[i];
      const prod = products.find(p => p.id === row.productId);
      const isRefinPort =
        prod?.name === 'REFIN DA PORTABILIDADE' ||
        prod?.requiresPortabilityRelation ||
        prod?.name?.toUpperCase().includes('REFIN');

      if (isRefinPort) {
        const hasBatchPort = adeRows.some((r, idx) => {
          if (idx === i) return false;
          const p = products.find(pr => pr.id === r.productId);
          return p?.name === 'PORTABILIDADE' || p?.type === 'PORTABILIDADE';
        });

        let hasDbPort = false;
        const existingClient = StorageService.findClientByCpf(cleanCpf);
        if (existingClient) {
          const clientProps = StorageService.getProposalsByClientId(existingClient.id);
          hasDbPort = clientProps.some(p => {
            const pr = products.find(prodObj => prodObj.id === p.productId);
            return pr?.name === 'PORTABILIDADE' || pr?.type === 'PORTABILIDADE';
          });
        }

        if (!hasBatchPort && !hasDbPort) {
          const errPayload = {
            title: 'Verificação de Integridade de Vínculo de Proposta',
            message: `A proposta da linha ${i + 1} (${row.proposalNumber || 'Sem ADE'}) é um "REFIN DA PORTABILIDADE", mas nenhuma proposta de Portabilidade foi incluída no lote nem encontrada no banco de dados para este cliente.`,
            details: 'Para evitar propostas órfãs, adicione uma proposta de Portabilidade no mesmo cadastro ou selecione uma existente.',
            timestamp: new Date().toLocaleTimeString(),
          };
          setLinkingErrorLog(errPayload);
          setErrorMsg(errPayload.message);
          return;
        }
      }
    }

    try {
      setLinkingErrorLog(null);

      // 1. Get or Create Client - Ensure name and CPF are explicitly saved
      const client = StorageService.getOrCreateClient({
        cpf: cleanCpf,
        fullName: fullName.trim(),
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
      });

      // 2. Insert all proposals with robust portability relation handling
      const createdProposalMap = new Map<number, any>();
      const portRowIndex = adeRows.findIndex(r => {
        const prod = products.find(p => p.id === r.productId);
        return prod?.name === 'PORTABILIDADE' || prod?.type === 'PORTABILIDADE';
      });

      // First pass: Create PORTABILIDADE proposals first
      const allCreated: any[] = [];
      for (let i = 0; i < adeRows.length; i++) {
        const row = adeRows[i];
        const prod = products.find(p => p.id === row.productId);
        const isPort = prod?.name === 'PORTABILIDADE' || prod?.type === 'PORTABILIDADE';

        if (isPort) {
          const prop = StorageService.createProposal({
            proposalNumber: row.proposalNumber.trim(),
            clientId: client.id,
            productId: row.productId,
            bankId: row.bankId,
            promoterId: row.promoterId,
            partnerId: selectedPartnerId,
            disbursedValue:
              row.disbursedValue !== undefined && row.disbursedValue !== ''
                ? parseCurrency(row.disbursedValue)
                : undefined,
            contractBalance:
              row.contractBalance !== undefined && row.contractBalance !== ''
                ? parseCurrency(row.contractBalance)
                : undefined,
            notes: row.notes,
          });
          createdProposalMap.set(i, prop);
          allCreated.push(prop);
        }
      }

      // Second pass: Create REFIN and other proposals and link them
      for (let i = 0; i < adeRows.length; i++) {
        const row = adeRows[i];
        const prod = products.find(p => p.id === row.productId);
        const isPort = prod?.name === 'PORTABILIDADE' || prod?.type === 'PORTABILIDADE';

        if (!isPort) {
          let relatedPortabilityId: string | undefined = undefined;

          if (typeof row.linkWithPortabilityIndex === 'number' && createdProposalMap.has(row.linkWithPortabilityIndex)) {
            relatedPortabilityId = createdProposalMap.get(row.linkWithPortabilityIndex).id;
          } else if (portRowIndex !== -1 && createdProposalMap.has(portRowIndex)) {
            relatedPortabilityId = createdProposalMap.get(portRowIndex).id;
          } else {
            // Check existing portability proposals for this client in database
            const clientProps = StorageService.getProposalsByClientId(client.id);
            const existingPort = clientProps.find(p => {
              const pObj = products.find(pr => pr.id === p.productId);
              return pObj?.name === 'PORTABILIDADE' || pObj?.type === 'PORTABILIDADE';
            });
            if (existingPort) {
              relatedPortabilityId = existingPort.id;
            }
          }

          const prop = StorageService.createProposal({
            proposalNumber: row.proposalNumber.trim(),
            clientId: client.id,
            productId: row.productId,
            bankId: row.bankId,
            promoterId: row.promoterId,
            partnerId: selectedPartnerId,
            disbursedValue:
              row.disbursedValue !== undefined && row.disbursedValue !== ''
                ? parseCurrency(row.disbursedValue)
                : undefined,
            contractBalance:
              row.contractBalance !== undefined && row.contractBalance !== ''
                ? parseCurrency(row.contractBalance)
                : undefined,
            notes: row.notes,
            relatedPortabilityId: relatedPortabilityId,
          });

          if (relatedPortabilityId) {
            StorageService.createProposalRelation(relatedPortabilityId, prop.id);
          }

          createdProposalMap.set(i, prop);
          allCreated.push(prop);
        }
      }

      setSuccessMsg(`${allCreated.length} propostas cadastradas com sucesso para ${client.fullName}!`);
      setTimeout(() => {
        onSuccess(allCreated.length);
        onClose();
      }, 1200);
    } catch (err: any) {
      const errPayload = {
        title: 'Erro ao Persistir Propostas no Banco',
        message: err.message || 'Falha na gravação ou vinculação no banco de dados.',
        details: `CPF: ${cleanCpf} | Linhas: ${adeRows.length}`,
        timestamp: new Date().toLocaleTimeString(),
      };
      setLinkingErrorLog(errPayload);
      setErrorMsg(err.message || 'Falha ao salvar propostas.');
    }
  };

  if (!isOpen) return null;

  const currentPartner = partners.find(p => p.id === selectedPartnerId);
  const currentPartnerCode = currentPartner ? currentPartner.login : '';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-2 sm:p-4 backdrop-blur-xs">
      <div className="relative w-full max-w-[98vw] 2xl:max-w-7xl rounded-xl bg-white dark:bg-slate-900 shadow-2xl flex flex-col max-h-[96vh] border border-slate-200 dark:border-slate-800 overflow-hidden">
        {/* Modal Header */}
        <div className="shrink-0 flex items-center justify-between border-b border-slate-200 dark:border-slate-800 px-4 sm:px-6 py-3.5 sm:py-4 bg-slate-50 dark:bg-slate-950/40 rounded-t-xl">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-emerald-600 text-white flex items-center justify-center">
              <Plus className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">Nova Produção</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Inclusão de propostas individuais ou múltiplas ADEs para o mesmo cliente
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          {/* Visual Error Log with Retry Mechanism */}
          {linkingErrorLog && (
            <div className="rounded-xl border border-rose-300 bg-rose-50 p-4 shadow-sm animate-shake">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-rose-200 text-rose-800 shrink-0">
                    <AlertTriangle className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-xs font-black text-rose-900 uppercase tracking-wide">
                        {linkingErrorLog.title}
                      </h4>
                      <span className="text-[10px] font-mono text-rose-600 bg-rose-100 px-1.5 py-0.5 rounded-md">
                        {linkingErrorLog.timestamp}
                      </span>
                    </div>
                    <p className="mt-1 text-xs font-semibold text-rose-800">
                      {linkingErrorLog.message}
                    </p>
                    {linkingErrorLog.details && (
                      <p className="mt-1 text-[11px] font-mono text-rose-700 bg-white/60 p-2 rounded-lg border border-rose-200">
                        {linkingErrorLog.details}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={handleSave}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-700 hover:bg-rose-800 text-white rounded-lg text-xs font-bold shadow-sm transition-all"
                  >
                    <RefreshCw className="h-3.5 w-3.5 animate-spin-hover" />
                    Tentar Novamente
                  </button>
                  <button
                    type="button"
                    onClick={() => setLinkingErrorLog(null)}
                    className="p-1 text-rose-400 hover:text-rose-700 rounded-md"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Mode Selector */}
          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setMode('RAPIDO')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  mode === 'RAPIDO'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Modo Rápido (Multi-ADE)
              </button>
              <button
                onClick={() => setMode('COMPLETO')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  mode === 'COMPLETO'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Modo Completo (com Observações)
              </button>
            </div>

            {existingClient && (
              <div className="flex items-center gap-2 text-xs font-medium bg-emerald-50 text-emerald-800 px-3 py-1 rounded-full border border-emerald-200">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                <span>
                  Cliente existente no banco ({existingProposalCount} propostas anteriores)
                </span>
              </div>
            )}
          </div>

          {/* Section 1: Client & Partner Info */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                CPF do Cliente *
              </label>
              <input
                id="input-new-prod-cpf"
                type="text"
                value={cpf}
                onChange={e => handleCpfChange(e.target.value)}
                placeholder="000.000.000-00 ou 00000000000"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-900 focus:border-blue-500 focus:outline-hidden"
              />
              <span className="text-[10px] text-slate-500">
                {cpf ? `Formatado: ${formatCpf(cpf)}` : 'Digite o CPF para buscar cliente'}
              </span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Nome Completo do Cliente *
              </label>
              <input
                id="input-new-prod-name"
                type="text"
                value={fullName}
                onChange={e => setFullName(e.target.value)}
                placeholder="Ex: MARIA JOSE ALEXANDRE"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-900 focus:border-blue-500 focus:outline-hidden uppercase"
              />
            </div>

            <div>
              <PartnerSearchSelect
                partners={partners}
                selectedPartnerId={selectedPartnerId}
                onSelectPartner={handlePartnerChange}
                label="Parceiro de Venda (Agente) *"
                placeholder="Digite o código (ex: 16740) ou nome do agente..."
                required
              />
              {currentPartner && (
                <span className="text-[10px] font-medium text-blue-700 dark:text-blue-400 mt-1 block">
                  Identificador Institucional selecionado: <strong>{currentPartnerCode}</strong>
                </span>
              )}
            </div>

            {mode === 'COMPLETO' && (
              <>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Telefone (Opcional)
                  </label>
                  <input
                    type="text"
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    placeholder="(00) 00000-0000"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    E-mail (Opcional)
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="email@cliente.com"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-900"
                  />
                </div>
              </>
            )}
          </div>

          {/* Section 2: Table of ADEs */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                Linhas de Produção / ADEs ({adeRows.length})
              </h3>
              <button
                id="btn-add-ade-row"
                onClick={handleAddRow}
                className="flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700 hover:bg-emerald-100 transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>+ Adicionar ADE</span>
              </button>
            </div>

            <div className="w-full overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-xs">
              <table className="w-full min-w-[1100px] text-left text-xs text-slate-700">
                <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200">
                  <tr>
                    <th className="px-3 py-2.5 w-12 text-center shrink-0">#</th>
                    <th className="px-3 py-2.5 min-w-[160px]">ADE / Nº Proposta *</th>
                    <th className="px-3 py-2.5 min-w-[180px]">Produto *</th>
                    <th className="px-3 py-2.5 min-w-[210px]">Banco *</th>
                    <th className="px-3 py-2.5 min-w-[200px]">Promotora Habilitada *</th>
                    <th className="px-3 py-2.5 min-w-[140px]">Valor Liberado (R$)</th>
                    <th className="px-3 py-2.5 min-w-[140px]">Saldo Contrato (R$)</th>
                    <th className="px-3 py-2.5 min-w-[180px]">Vínculo Refin/Port</th>
                    {mode === 'COMPLETO' && <th className="px-3 py-2.5 min-w-[200px]">Observações</th>}
                    <th className="px-3 py-2.5 w-14 text-center shrink-0">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {adeRows.map((row, idx) => {
                    const allowedPromoters = StorageService.getPromotersForBank(row.bankId);
                    const selectedProd = products.find(p => p.id === row.productId);
                    const isRefinPort = selectedProd?.name === 'REFIN DA PORTABILIDADE';
                    const isPort =
                      selectedProd?.name === 'PORTABILIDADE' ||
                      selectedProd?.type === 'PORTABILIDADE' ||
                      selectedProd?.name?.toUpperCase().includes('PORT');

                    return (
                      <tr key={row.id} className="hover:bg-slate-50/80">
                        <td className="px-3 py-2 text-center font-bold text-slate-400 shrink-0">
                          {idx + 1}
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            value={row.proposalNumber}
                            onChange={e => handleUpdateRow(idx, 'proposalNumber', e.target.value)}
                            placeholder="833085808 ou UUID"
                            className="w-full font-mono rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-blue-500 focus:outline-hidden"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <select
                            value={row.productId}
                            onChange={e => handleUpdateRow(idx, 'productId', e.target.value)}
                            title={products.find(p => p.id === row.productId)?.name || 'Produto'}
                            className="w-full min-w-[165px] rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-900 focus:border-blue-500 focus:outline-hidden"
                          >
                            {products.map(p => (
                              <option key={p.id} value={p.id} title={p.name}>
                                {p.name}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          <select
                            value={row.bankId}
                            onChange={e => handleUpdateRow(idx, 'bankId', e.target.value)}
                            title={banks.find(b => b.id === row.bankId)?.name || 'Banco'}
                            className="w-full min-w-[195px] rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-900 focus:border-blue-500 focus:outline-hidden"
                          >
                            {banks.map(b => (
                              <option key={b.id} value={b.id} title={b.name}>
                                {b.name}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          <select
                            value={row.promoterId}
                            onChange={e => handleUpdateRow(idx, 'promoterId', e.target.value)}
                            title={allowedPromoters.find(pr => pr.id === row.promoterId)?.name || 'Promotora'}
                            className="w-full min-w-[185px] rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-900 focus:border-blue-500 focus:outline-hidden"
                          >
                            {allowedPromoters.map(pr => (
                              <option key={pr.id} value={pr.id} title={pr.name}>
                                {pr.name}
                              </option>
                            ))}
                          </select>
                        </td>

                        {/* Valor Liberado */}
                        <td className="px-3 py-2">
                          <div className="relative rounded-md">
                            <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-2 text-[10px] font-bold text-slate-400">
                              R$
                            </span>
                            <input
                              type="text"
                              value={row.disbursedValue ?? ''}
                              onChange={e => handleUpdateRow(idx, 'disbursedValue', e.target.value)}
                              placeholder="0,00"
                              title="Valor liberado para o cliente"
                              className="w-full rounded-md border border-slate-300 bg-white pl-7 pr-2 py-1.5 text-xs font-semibold text-slate-900 focus:border-blue-500 focus:outline-hidden"
                            />
                          </div>
                        </td>

                        {/* Saldo Contrato (Destacado em Portabilidade) */}
                        <td className="px-3 py-2">
                          <div className="relative rounded-md">
                            <span
                              className={`pointer-events-none absolute inset-y-0 left-0 flex items-center pl-2 text-[10px] font-bold ${
                                isPort ? 'text-purple-600' : 'text-slate-400'
                              }`}
                            >
                              R$
                            </span>
                            <input
                              type="text"
                              value={row.contractBalance ?? ''}
                              onChange={e => handleUpdateRow(idx, 'contractBalance', e.target.value)}
                              placeholder={isPort ? 'Saldo devedor' : 'Opcional'}
                              title={isPort ? 'Informe o saldo do contrato a ser portado' : 'Saldo do contrato'}
                              className={`w-full rounded-md border pl-7 pr-2 py-1.5 text-xs font-semibold focus:outline-hidden transition-all ${
                                isPort
                                  ? 'border-purple-300 bg-purple-50/70 text-purple-950 placeholder-purple-400 focus:border-purple-500 ring-1 ring-purple-200'
                                  : 'border-slate-300 bg-white text-slate-900 focus:border-blue-500'
                              }`}
                            />
                          </div>
                        </td>

                        <td className="px-3 py-2">
                          {isRefinPort ? (
                            <div className="flex items-center gap-1">
                              <Link2 className="h-3.5 w-3.5 text-purple-600 shrink-0" />
                              <select
                                value={row.linkWithPortabilityIndex ?? ''}
                                onChange={e =>
                                  handleUpdateRow(
                                    idx,
                                    'linkWithPortabilityIndex',
                                    e.target.value === '' ? undefined : Number(e.target.value)
                                  )
                                }
                                className="w-full rounded border border-purple-300 bg-purple-50 text-xs font-semibold text-purple-900 px-2 py-1 focus:border-purple-500 focus:outline-hidden"
                              >
                                <option value="">Nenhum Vínculo</option>
                                {adeRows.map((other, oIdx) => {
                                  if (oIdx === idx) return null;
                                  const otherProd = products.find(p => p.id === other.productId);
                                  return (
                                    <option key={other.id} value={oIdx}>
                                      Linha #{oIdx + 1} ({other.proposalNumber ? `ADE ${other.proposalNumber}` : 'Sem ADE'}) - {otherProd?.name || 'Produto'}
                                    </option>
                                  );
                                })}
                              </select>
                            </div>
                          ) : (
                            <span className="text-slate-400 text-[10px] block text-center">-</span>
                          )}
                        </td>

                        {mode === 'COMPLETO' && (
                          <td className="px-3 py-2">
                            <input
                              type="text"
                              value={row.notes || ''}
                              onChange={e => handleUpdateRow(idx, 'notes', e.target.value)}
                              placeholder="Observação"
                              className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-[11px] text-slate-800"
                            />
                          </td>
                        )}

                        <td className="px-3 py-2 text-center">
                          <button
                            onClick={() => handleRemoveRow(idx)}
                            disabled={adeRows.length <= 1}
                            className="text-slate-400 hover:text-rose-600 disabled:opacity-30"
                            title="Remover linha"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Feedback Messages */}
          {errorMsg && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
              <div className="whitespace-pre-line">{errorMsg}</div>
            </div>
          )}

          {successMsg && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              <span>{successMsg}</span>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="shrink-0 flex items-center justify-between border-t border-slate-200 px-4 sm:px-6 py-3.5 sm:py-4 bg-slate-50 rounded-b-xl">
          <div className="text-xs text-slate-500 font-medium">
            Total de propostas para salvar: <strong>{adeRows.length}</strong>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer"
            >
              Cancelar
            </button>
            <button
              id="btn-save-all-ades"
              onClick={handleSave}
              className="px-5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-sm transition-colors flex items-center gap-2 cursor-pointer"
            >
              <CheckCircle2 className="h-4 w-4" />
              <span>SALVAR TODAS AS ADEs</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
