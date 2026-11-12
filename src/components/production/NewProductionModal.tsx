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
import { Product, Bank, Promoter, Partner, Client, Convenio } from '../../types';
import { PartnerSearchSelect } from '../common/PartnerSearchSelect';

interface AdeRow {
  id: string;
  proposalNumber: string;
  convenioId?: string;
  productId: string;
  bankId: string;
  promoterId: string;
  disbursedValue?: string | number; // Valor liberado cliente
  contractBalance?: string | number; // Saldo do contrato (portabilidade)
  installmentsCount?: string;
  installmentValue?: string;
  notes?: string;
  linkWithPortabilityIndex?: number; // link to another row in this batch
}

interface NewProductionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (count: number) => void;
}

const isPortProduct = (p?: any) => {
  if (!p) return false;
  const nameUpper = p.name?.toUpperCase() || '';
  const codeUpper = p.code?.toUpperCase() || '';
  return p.type === 'PORTABILIDADE' || nameUpper === 'PORTABILIDADE' || nameUpper.includes('PORTABILIDADE') || codeUpper === 'PORTABILIDADE';
};

const isRefinPortProduct = (p?: any) => {
  if (!p) return false;
  const nameUpper = p.name?.toUpperCase() || '';
  const codeUpper = p.code?.toUpperCase() || '';
  return (
    p.requiresPortabilityRelation === true ||
    p.type === 'REFIN_PORTABILIDADE' ||
    nameUpper === 'REFIN DA PORTABILIDADE' ||
    nameUpper === 'PORTAB/REFIN' ||
    nameUpper.includes('PORTAB/REFIN') ||
    nameUpper.includes('REFIN DA PORTABILIDADE') ||
    codeUpper === 'PORTAB_REFIN' ||
    codeUpper === 'REFIN_PORTABILIDADE'
  );
};

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
  const [convenios, setConvenios] = useState<Convenio[]>([]);
  const [banks, setBanks] = useState<Bank[]>([]);
  const [promoters, setPromoters] = useState<Promoter[]>([]);
  const [partners, setPartners] = useState<Partner[]>([]);

  const [adeRows, setAdeRows] = useState<AdeRow[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      const p = StorageService.getProducts().filter(x => x.active);
      const c = StorageService.getConvenios().filter(x => x.active);
      const b = StorageService.getBanks().filter(x => x.active);
      const pr = StorageService.getPromoters().filter(x => x.active);

      setProducts(p);
      setConvenios(c);
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
        const defaultConv = c[0];
        const defaultProd = defaultConv ? (StorageService.getProductsForConvenio(defaultConv.id)[0] || p[0]) : p[0];

        setAdeRows([
          {
            id: 'row-1',
            proposalNumber: '',
            installmentsCount: '84',
            convenioId: defaultConv?.id || '',
            productId: defaultProd.id,
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
    const defaultConv = convenios[0];
    const defaultProduct = defaultConv?.id
      ? StorageService.getProductsForConvenio(defaultConv.id)[0] || products[0] || { id: '' }
      : products[0] || { id: '' };
    const defaultBank = banks[0] || { id: '' };
    const allowed = defaultBank.id ? StorageService.getPromotersForBank(defaultBank.id) : [];
    const defaultPromoter = allowed[0] || promoters[0] || { id: '' };

    // Check if there's already a PORTABILIDADE row in adeRows
    let defaultLinkIndex: number | undefined = undefined;
    const existingPortIndex = adeRows.findIndex(r => {
      const prod = products.find(p => p.id === r.productId);
      return isPortProduct(prod);
    });
    if (existingPortIndex !== -1) {
      defaultLinkIndex = existingPortIndex;
    }

    setAdeRows(prev => [
      ...prev,
      {
        id: `row-${Date.now()}-${prev.length + 1}`,
        proposalNumber: '',
        installmentsCount: '84',
        convenioId: defaultConv?.id || '',
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

      // If convenio changed, check if current product is compatible; if not, auto-select first compatible product
      if (field === 'convenioId') {
        if (value) {
          const compatibleProducts = StorageService.getProductsForConvenio(value).filter(p => p.active);
          if (compatibleProducts.length > 0 && !compatibleProducts.some(p => p.id === row.productId)) {
            row.productId = compatibleProducts[0].id;
          }
        }
      }

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
        const nameUpper = selectedProd?.name?.toUpperCase() || '';
        const codeUpper = selectedProd?.code?.toUpperCase() || '';
        const isRefinPort =
          selectedProd?.requiresPortabilityRelation === true ||
          selectedProd?.type === 'REFIN_PORTABILIDADE' ||
          nameUpper === 'REFIN DA PORTABILIDADE' ||
          nameUpper === 'PORTAB/REFIN' ||
          nameUpper.includes('PORTAB/REFIN') ||
          nameUpper.includes('REFIN DA PORTABILIDADE') ||
          codeUpper === 'PORTAB_REFIN' ||
          codeUpper === 'REFIN_PORTABILIDADE';

        if (isRefinPort) {
          const portIndex = updated.findIndex((r, idx) => {
            if (idx === index) return false;
            const pObj = products.find(p => p.id === r.productId);
            const otherNameUpper = pObj?.name?.toUpperCase() || '';
            const otherCodeUpper = pObj?.code?.toUpperCase() || '';
            return pObj?.type === 'PORTABILIDADE' || otherNameUpper === 'PORTABILIDADE' || otherNameUpper.includes('PORTABILIDADE') || otherCodeUpper === 'PORTABILIDADE';
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
  const handleSave = async () => {
    if (isSaving) return;
    setIsSaving(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    const cleanCpf = normalizeCpf(cpf);
    if (cleanCpf.length !== 11) {
      setErrorMsg('CPF inválido ou incompleto. Deve conter 11 dígitos.');
      setIsSaving(false);
      return;
    }

    if (!fullName.trim()) {
      setErrorMsg('O nome completo do cliente é obrigatório.');
      setIsSaving(false);
      return;
    }

    if (!selectedPartnerId) {
      setErrorMsg('Selecione o parceiro responsável pela produção.');
      setIsSaving(false);
      return;
    }

    // Validate rows
    const seenNumbers = new Set<string>();
    for (let i = 0; i < adeRows.length; i++) {
      const row = adeRows[i];
      if (!row.proposalNumber.trim()) {
        setErrorMsg(`Linha ${i + 1}: Informe o número da ADE/Proposta.`);
        setIsSaving(false);
        return;
      }
      const numUpper = row.proposalNumber.trim().toUpperCase();
      if (seenNumbers.has(numUpper)) {
        setErrorMsg(`Linha ${i + 1}: ADE "${row.proposalNumber}" repetida no mesmo formulário.`);
        setIsSaving(false);
        return;
      }
      seenNumbers.add(numUpper);

      // Bank × Promoter validation
      if (!StorageService.isBankPromoterAllowed(row.bankId, row.promoterId)) {
        const bank = banks.find(b => b.id === row.bankId);
        const promoter = promoters.find(p => p.id === row.promoterId);
        setErrorMsg(`Linha ${i + 1}: A promotora ${promoter?.name} NÃO está habilitada para o banco ${bank?.name}.`);
        setIsSaving(false);
        return;
      }

      // Convênio × Produto compatibility validation
      if (row.convenioId && row.productId) {
        const isCompat = StorageService.isProductCompatibleWithConvenio(row.productId, row.convenioId);
        if (!isCompat) {
          const conv = convenios.find(c => c.id === row.convenioId);
          const prod = products.find(p => p.id === row.productId);
          setErrorMsg(`Linha ${i + 1}: O produto "${prod?.name || 'Selecionado'}" não é compatível com o convênio "${conv?.name || 'Selecionado'}".`);
          setIsSaving(false);
          return;
        }
      }

      // Operational rules validation
      const term = Number(row.installmentsCount);
      if (!Number.isInteger(term) || term <= 0) {
        setErrorMsg(`Linha ${i + 1}: informe um prazo inteiro maior que zero.`); setIsSaving(false); return;
      }
      const installment = row.installmentValue?.trim() ? parseCurrency(row.installmentValue) : undefined;
      if (row.installmentValue?.trim() && (installment === undefined || !Number.isFinite(installment) || installment < 0)) {
        setErrorMsg(`Linha ${i + 1}: informe um valor de parcela válido.`); setIsSaving(false); return;
      }
      const ruleCheck = StorageService.validateProposalAgainstRules({
        productId: row.productId,
        convenioId: row.convenioId,
        contractValue: row.disbursedValue ? parseCurrency(row.disbursedValue) : undefined,
        contractBalance: row.contractBalance ? parseCurrency(row.contractBalance) : undefined,
        installmentsCount: term,
      });
      if (!ruleCheck.valid) {
        setErrorMsg(`Linha ${i + 1}: ${ruleCheck.errors.join('; ')}`);
        setIsSaving(false);
        return;
      }
    }

    // Integrity check for REFIN DA PORTABILIDADE to prevent orphan proposals
    for (let i = 0; i < adeRows.length; i++) {
      const row = adeRows[i];
      const prod = products.find(p => p.id === row.productId);
      const isRefinPort = isRefinPortProduct(prod);

      if (isRefinPort) {
        const hasBatchPort = adeRows.some((r, idx) => {
          if (idx === i) return false;
          const p = products.find(pr => pr.id === r.productId);
          return isPortProduct(p);
        });

        let hasDbPort = false;
        const existingClient = StorageService.findClientByCpf(cleanCpf);
        if (existingClient) {
          const clientProps = StorageService.getProposalsByClientId(existingClient.id);
          hasDbPort = clientProps.some(p => {
            const pr = products.find(prodObj => prodObj.id === p.productId);
            return isPortProduct(pr);
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
          setIsSaving(false);
          return;
        }
      }
    }

    const createdProposalMap = new Map<number, any>();
    const createdRows = new Map<string, string>();
    const allCreated: any[] = [];

    try {
      setLinkingErrorLog(null);

      // 1. Get or Create Client - Ensure name and CPF are explicitly saved in PostgreSQL
      const client = await StorageService.getOrCreateClientAsync({
        cpf: cleanCpf,
        fullName: fullName.trim(),
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
      });

      // 2. Insert all proposals with robust portability relation handling
      const portRowIndex = adeRows.findIndex(r => {
        const prod = products.find(p => p.id === r.productId);
        return isPortProduct(prod);
      });

      // First pass: Create PORTABILIDADE proposals first
      for (let i = 0; i < adeRows.length; i++) {
        const row = adeRows[i];
        const prod = products.find(p => p.id === row.productId);
        const isPort = isPortProduct(prod);

        if (isPort) {
          const prop = await StorageService.createProposalAsync({
            proposalNumber: row.proposalNumber.trim(),
            clientId: client.id,
            clientCpf: cleanCpf,
            clientName: fullName.trim(),
            convenioId: row.convenioId || undefined,
            productId: row.productId,
            bankId: row.bankId,
            promoterId: row.promoterId,
            partnerId: selectedPartnerId,
            installmentsCount: Number(row.installmentsCount),
            installmentValue: row.installmentValue?.trim() ? parseCurrency(row.installmentValue) : undefined,
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
          createdRows.set(row.id, row.proposalNumber.trim());
        }
      }

      // Second pass: Create REFIN and other proposals and link them
      for (let i = 0; i < adeRows.length; i++) {
        const row = adeRows[i];
        const prod = products.find(p => p.id === row.productId);
        const isPort = isPortProduct(prod);

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
              return isPortProduct(pObj);
            });
            if (existingPort) {
              relatedPortabilityId = existingPort.id;
            }
          }

          const prop = await StorageService.createProposalAsync({
            proposalNumber: row.proposalNumber.trim(),
            clientId: client.id,
            clientCpf: cleanCpf,
            clientName: fullName.trim(),
            convenioId: row.convenioId || undefined,
            productId: row.productId,
            bankId: row.bankId,
            promoterId: row.promoterId,
            partnerId: selectedPartnerId,
            installmentsCount: Number(row.installmentsCount),
            installmentValue: row.installmentValue?.trim() ? parseCurrency(row.installmentValue) : undefined,
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
          createdRows.set(row.id, row.proposalNumber.trim());
        }
      }

      setSuccessMsg(`${allCreated.length} propostas cadastradas com sucesso para ${client.fullName}!`);
      setIsSaving(false);
      onSuccess(allCreated.length);
      onClose();
    } catch (err: any) {
      setIsSaving(false);
      if (createdRows.size > 0) {
        const savedAdeNumbers = Array.from(createdRows.values()).filter(Boolean);
        setAdeRows(current => current
          .filter(row => !createdRows.has(row.id))
          .map(row => ({ ...row, linkWithPortabilityIndex: undefined })));
        const partialMessage = `${createdRows.size} proposta(s) já foram salvas${savedAdeNumbers.length ? ` (ADEs ${savedAdeNumbers.slice(0, 8).join(', ')}${savedAdeNumbers.length > 8 ? ', …' : ''})` : ''}. Essas linhas foram retiradas do formulário para evitar duplicidade; revise e tente salvar as linhas restantes.`;
        setSuccessMsg(partialMessage);
        setErrorMsg(`O lote foi interrompido após uma falha: ${err.message || 'erro inesperado'}. ${partialMessage}`);
        setLinkingErrorLog({
          title: 'Lote parcialmente salvo',
          message: partialMessage,
          details: `CPF: ${cleanCpf} | ADEs salvas: ${savedAdeNumbers.join(', ') || createdRows.size} | Linhas restantes: ${adeRows.length - createdRows.size}`,
          timestamp: new Date().toLocaleTimeString(),
        });
        return;
      }
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
    <div role="dialog" aria-modal="true" aria-labelledby="new-proposal-heading" data-entry-layout={mode === 'RAPIDO' ? 'form' : 'table'} className="internal-proposal-modal fixed inset-0 z-50 flex items-center justify-center bg-[var(--scrim)] dark:bg-[var(--scrim)] p-2 sm:p-4 backdrop-blur-xs">
      <div className="relative w-full max-w-[98vw] 2xl:max-w-7xl rounded-xl bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)]  flex flex-col max-h-[96vh] border border-[var(--field-border)] dark:border-[var(--field-border)] overflow-hidden">
        {/* Modal Header */}
        <div className="shrink-0 flex items-center justify-between border-b border-[var(--field-border)] dark:border-[var(--field-border)] px-4 sm:px-6 py-3.5 sm:py-4 bg-[var(--bg-canvas)] dark:bg-[var(--bg-canvas)] rounded-t-xl">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-[var(--success-bg)] text-[var(--success-text)] flex items-center justify-center shadow-xs">
              <Plus className="h-5 w-5" />
            </div>
            <div>
              <h2 id="new-proposal-heading" className="text-base font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">Cadastrar proposta</h2>
              <p className="text-xs text-[var(--text-secondary)] dark:text-[var(--text-secondary)]">
                Inclusão de propostas individuais ou múltiplas ADEs para o mesmo cliente
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              aria-label="Fechar cadastro de proposta"
              onClick={onClose}
              disabled={isSaving}
              className="p-1.5 text-[var(--text-secondary)] hover:text-[var(--text-secondary)] dark:hover:text-[var(--text-primary)] rounded-lg hover:bg-[var(--bg-surface-elevated)] dark:hover:bg-[var(--bg-surface-elevated)] disabled:opacity-90 disabled:cursor-not-allowed cursor-pointer transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <fieldset disabled={isSaving} aria-busy={isSaving} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] border-0 m-0 min-w-0">
          {/* Visual Error Log with Retry Mechanism */}
          {linkingErrorLog && (
            <div className="rounded-xl border border-[var(--danger-border)] dark:border-[var(--danger-border)] bg-[var(--danger-bg)] dark:bg-[var(--danger-bg)] p-4  animate-shake">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-[var(--danger-bg)] dark:bg-[var(--danger-bg)] text-[var(--danger-text)] dark:text-[var(--danger-text)] shrink-0">
                    <AlertTriangle className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-xs font-black text-[var(--danger-text)] dark:text-[var(--danger-text)] uppercase tracking-wide">
                        {linkingErrorLog.title}
                      </h4>
                      <span className="text-[10px] font-mono text-[var(--danger-text)] dark:text-[var(--danger-text)] bg-[var(--danger-bg)] dark:bg-[var(--danger-bg)] px-1.5 py-0.5 rounded-md">
                        {linkingErrorLog.timestamp}
                      </span>
                    </div>
                    <p className="mt-1 text-xs font-semibold text-[var(--danger-text)] dark:text-[var(--danger-text)]">
                      {linkingErrorLog.message}
                    </p>
                    {linkingErrorLog.details && (
                      <p className="mt-1 text-[11px] font-mono text-[var(--danger-text)] dark:text-[var(--danger-text)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] p-2 rounded-lg border border-[var(--danger-border)] dark:border-[var(--danger-border)]">
                        {linkingErrorLog.details}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={handleSave}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--danger-bg)] hover:bg-[var(--danger-bg)] text-[var(--danger-text)] rounded-lg text-xs font-bold  transition-all cursor-pointer"
                  >
                    <RefreshCw className="h-3.5 w-3.5 animate-spin-hover" />
                    Tentar Novamente
                  </button>
                  <button
                    type="button"
                    onClick={() => setLinkingErrorLog(null)}
                    className="p-1 text-[var(--danger-text)] hover:text-[var(--danger-text)] dark:hover:text-[var(--danger-text)] rounded-md cursor-pointer transition-colors"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Mode Selector */}
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[var(--field-border)] dark:border-[var(--field-border)]">
            <div className="flex items-center gap-2">
              <button
                aria-pressed={mode === 'RAPIDO'} onClick={() => setMode('RAPIDO')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                  mode === 'RAPIDO'
                    ? 'bg-[var(--action)] text-[var(--text-primary)] shadow-xs'
                    : 'bg-[var(--bg-surface-elevated)] dark:bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] dark:text-[var(--text-primary)] hover:bg-[var(--bg-surface-elevated)] dark:hover:bg-[var(--bg-surface-elevated)]'
                }`}
              >
                Formulário
              </button>
              <button
                aria-pressed={mode === 'COMPLETO'} onClick={() => setMode('COMPLETO')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                  mode === 'COMPLETO'
                    ? 'bg-[var(--action)] text-[var(--text-primary)] shadow-xs'
                    : 'bg-[var(--bg-surface-elevated)] dark:bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] dark:text-[var(--text-primary)] hover:bg-[var(--bg-surface-elevated)] dark:hover:bg-[var(--bg-surface-elevated)]'
                }`}
              >
                Planilha avançada
              </button>
            </div>

            {existingClient && (
              <div className="flex items-center gap-2 text-xs font-medium bg-[var(--success-bg)] dark:bg-[var(--success-bg)] text-[var(--success-text)] dark:text-[var(--success-text)] px-3 py-1 rounded-full border border-[var(--success-border)] dark:border-[var(--success-border)]">
                <CheckCircle2 className="h-3.5 w-3.5 text-[var(--success-text)] dark:text-[var(--success-text)] shrink-0" />
                <span>
                  Cliente existente no banco ({existingProposalCount} propostas anteriores)
                </span>
              </div>
            )}
          </div>

          {/* Section 1: Client & Partner Info */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface-elevated)] p-4 rounded-xl border border-[var(--field-border)] dark:border-[var(--field-border)]">
            <div>
              <label className="block text-xs font-semibold text-[var(--text-secondary)] dark:text-[var(--text-primary)] mb-1">
                CPF do Cliente *
              </label>
              <input
                id="input-new-prod-cpf"
                type="text"
                value={cpf}
                onChange={e => handleCpfChange(e.target.value)}
                placeholder="000.000.000-00 ou 00000000000"
                className="w-full rounded-lg border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] px-3 py-2 text-xs font-medium text-[var(--text-secondary)] dark:text-[var(--text-primary)] placeholder-[var(--text-secondary)] dark:placeholder-[var(--text-secondary)] focus:border-[var(--field-border)] dark:focus:border-[var(--field-border)] focus:ring-1 focus:ring-[var(--focus)] focus:outline-hidden transition-colors"
              />
              <span className="text-[10px] text-[var(--text-secondary)] dark:text-[var(--text-secondary)] mt-1 block">
                {cpf ? `Formatado: ${formatCpf(cpf)}` : 'Digite o CPF para buscar cliente'}
              </span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--text-secondary)] dark:text-[var(--text-primary)] mb-1">
                Nome Completo do Cliente *
              </label>
              <input
                id="input-new-prod-name"
                type="text"
                value={fullName}
                onChange={e => setFullName(e.target.value)}
                placeholder="Ex: MARIA JOSE ALEXANDRE"
                className="w-full rounded-lg border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] px-3 py-2 text-xs font-medium text-[var(--text-secondary)] dark:text-[var(--text-primary)] placeholder-[var(--text-secondary)] dark:placeholder-[var(--text-secondary)] focus:border-[var(--field-border)] dark:focus:border-[var(--field-border)] focus:ring-1 focus:ring-[var(--focus)] focus:outline-hidden uppercase transition-colors"
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
                <span className="text-[10px] font-medium text-[var(--link)] dark:text-[var(--link)] mt-1 block">
                  Identificador Institucional selecionado: <strong>{currentPartnerCode}</strong>
                </span>
              )}
            </div>

            {mode === 'COMPLETO' && (
              <>
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-secondary)] dark:text-[var(--text-primary)] mb-1">
                    Telefone (Opcional)
                  </label>
                  <input
                    type="text"
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    placeholder="(00) 00000-0000"
                    className="w-full rounded-lg border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] px-3 py-2 text-xs font-medium text-[var(--text-secondary)] dark:text-[var(--text-primary)] placeholder-[var(--text-secondary)] dark:placeholder-[var(--text-secondary)] focus:border-[var(--field-border)] dark:focus:border-[var(--field-border)] focus:ring-1 focus:ring-[var(--focus)] focus:outline-hidden transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-secondary)] dark:text-[var(--text-primary)] mb-1">
                    E-mail (Opcional)
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="email@cliente.com"
                    className="w-full rounded-lg border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] px-3 py-2 text-xs font-medium text-[var(--text-secondary)] dark:text-[var(--text-primary)] placeholder-[var(--text-secondary)] dark:placeholder-[var(--text-secondary)] focus:border-[var(--field-border)] dark:focus:border-[var(--field-border)] focus:ring-1 focus:ring-[var(--focus)] focus:outline-hidden transition-colors"
                  />
                </div>
              </>
            )}
          </div>

          {/* Section 2: Table of ADEs */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
                Dados das propostas ({adeRows.length})
              </h3>
              <button
                id="btn-add-ade-row"
                onClick={handleAddRow}
                className="flex items-center gap-1.5 rounded-lg border border-[var(--success-border)] dark:border-[var(--success-border)] bg-[var(--success-bg)] dark:bg-[var(--success-bg)] px-3 py-1.5 text-xs font-bold text-[var(--success-text)] dark:text-[var(--success-text)] hover:bg-[var(--success-bg)] dark:hover:bg-[var(--success-bg)] transition-colors cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Adicionar outra proposta</span>
              </button>
            </div>

            <div className="w-full overflow-x-auto rounded-xl border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] shadow-xs">
              <table className="internal-proposal-entry-table w-full min-w-[1100px] text-left text-xs text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
                <thead className="bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface-elevated)] text-[11px] font-bold uppercase tracking-wider text-[var(--text-secondary)] dark:text-[var(--text-secondary)] border-b border-[var(--field-border)] dark:border-[var(--field-border)]">
                  <tr>
                    <th className="px-3 py-2.5 w-12 text-center shrink-0">#</th>
                    <th className="px-3 py-2.5 min-w-[160px]">ADE / Nº Proposta *</th>
                    <th className="px-3 py-2.5 min-w-[150px]">Convênio</th>
                    <th className="px-3 py-2.5 min-w-[180px]">Produto *</th>
                    <th className="px-3 py-2.5 min-w-[120px]">Prazo (meses) *</th>
                    <th className="px-3 py-2.5 min-w-[145px]">Parcela (R$)</th>
                    <th className="px-3 py-2.5 min-w-[210px]">Banco *</th>
                    <th className="px-3 py-2.5 min-w-[200px]">Promotora Habilitada *</th>
                    <th className="px-3 py-2.5 min-w-[140px]">Valor Liberado (R$)</th>
                    <th className="px-3 py-2.5 min-w-[140px]">Saldo Contrato (R$)</th>
                    <th className="px-3 py-2.5 min-w-[180px]">Vínculo Refin/Port</th>
                    {mode === 'COMPLETO' && <th className="px-3 py-2.5 min-w-[200px]">Observações</th>}
                    <th className="px-3 py-2.5 w-14 text-center shrink-0">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--field-border)] dark:divide-[var(--field-border)] font-medium">
                  {adeRows.map((row, idx) => {
                    const allowedPromoters = StorageService.getPromotersForBank(row.bankId);
                    const selectedProd = products.find(p => p.id === row.productId);
                    const isRefinPort = isRefinPortProduct(selectedProd);
                    const isPort = isPortProduct(selectedProd);

                    const availableProducts = row.convenioId
                      ? StorageService.getProductsForConvenio(row.convenioId).filter(p => p.active)
                      : products;

                    return (
                      <tr key={row.id} className="hover:bg-[var(--bg-canvas)] dark:hover:bg-[var(--bg-surface-elevated)] transition-colors">
                        <td data-label="Proposta" className="px-3 py-2 text-center font-bold text-[var(--text-secondary)] dark:text-[var(--text-secondary)] shrink-0">
                          {idx + 1}
                        </td>
                        <td data-label="Número da proposta *" className="px-3 py-2">
                          <input aria-label={`Número da proposta * da proposta ${idx + 1}`}
                            type="text"
                            value={row.proposalNumber}
                            onChange={e => handleUpdateRow(idx, 'proposalNumber', e.target.value)}
                            placeholder="833085808 ou UUID"
                            className="w-full font-mono rounded-md border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] px-2.5 py-1.5 text-xs text-[var(--text-secondary)] dark:text-[var(--text-primary)] placeholder-[var(--text-secondary)] dark:placeholder-[var(--text-secondary)] focus:border-[var(--field-border)] dark:focus:border-[var(--field-border)] focus:ring-1 focus:ring-[var(--focus)] focus:outline-hidden transition-colors"
                          />
                        </td>
                        <td data-label="Convênio" className="px-3 py-2">
                          <select aria-label={`Convênio da proposta ${idx + 1}`}
                            value={row.convenioId || ''}
                            onChange={e => handleUpdateRow(idx, 'convenioId', e.target.value)}
                            title={convenios.find(c => c.id === row.convenioId)?.name || 'Todos os Convênios'}
                            className="w-full min-w-[130px] rounded-md border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] px-2 py-1.5 text-xs font-semibold text-[var(--text-secondary)] dark:text-[var(--text-primary)] focus:border-[var(--field-border)] dark:focus:border-[var(--field-border)] focus:ring-1 focus:ring-[var(--focus)] focus:outline-hidden transition-colors"
                          >
                            <option value="" className="bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] text-[var(--text-secondary)] dark:text-[var(--text-primary)]">(Todos / Geral)</option>
                            {convenios.map(c => (
                              <option key={c.id} value={c.id} title={c.name} className="bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
                                {c.name} {c.code ? `(${c.code})` : ''}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td data-label="Produto *" className="px-3 py-2">
                          <select aria-label={`Produto * da proposta ${idx + 1}`}
                            value={row.productId}
                            onChange={e => handleUpdateRow(idx, 'productId', e.target.value)}
                            title={products.find(p => p.id === row.productId)?.name || 'Produto'}
                            className="w-full min-w-[165px] rounded-md border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] px-2.5 py-1.5 text-xs font-semibold text-[var(--text-secondary)] dark:text-[var(--text-primary)] focus:border-[var(--field-border)] dark:focus:border-[var(--field-border)] focus:ring-1 focus:ring-[var(--focus)] focus:outline-hidden transition-colors"
                          >
                            {(availableProducts.length > 0 ? availableProducts : products).map(p => (
                              <option key={p.id} value={p.id} title={p.name} className="bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
                                {p.name}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td data-label="Prazo em meses *" className="px-3 py-2">
                          <input aria-label={`Prazo da proposta ${idx + 1} (meses)`} type="number" min="1" step="1" value={row.installmentsCount ?? '84'} onChange={e => handleUpdateRow(idx, 'installmentsCount', e.target.value)} className="w-full rounded-md border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] px-2 py-1.5 text-xs" />
                        </td>
                        <td data-label="Parcela (R$)" className="px-3 py-2">
                          <input aria-label={`Valor da parcela da proposta ${idx + 1}`} type="text" inputMode="decimal" value={row.installmentValue ?? ''} placeholder="0,00" onChange={e => handleUpdateRow(idx, 'installmentValue', e.target.value)} className="w-full rounded-md border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] px-2 py-1.5 text-xs" />
                        </td>
                        <td data-label="Banco *" className="px-3 py-2">
                          <select aria-label={`Banco * da proposta ${idx + 1}`}
                            value={row.bankId}
                            onChange={e => handleUpdateRow(idx, 'bankId', e.target.value)}
                            title={banks.find(b => b.id === row.bankId)?.name || 'Banco'}
                            className="w-full min-w-[195px] rounded-md border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] px-2.5 py-1.5 text-xs font-semibold text-[var(--text-secondary)] dark:text-[var(--text-primary)] focus:border-[var(--field-border)] dark:focus:border-[var(--field-border)] focus:ring-1 focus:ring-[var(--focus)] focus:outline-hidden transition-colors"
                          >
                            {banks.map(b => (
                              <option key={b.id} value={b.id} title={b.name} className="bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
                                {b.name}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td data-label="Promotora *" className="px-3 py-2">
                          <select aria-label={`Promotora * da proposta ${idx + 1}`}
                            value={row.promoterId}
                            onChange={e => handleUpdateRow(idx, 'promoterId', e.target.value)}
                            title={allowedPromoters.find(pr => pr.id === row.promoterId)?.name || 'Promotora'}
                            className="w-full min-w-[185px] rounded-md border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] px-2.5 py-1.5 text-xs font-semibold text-[var(--text-secondary)] dark:text-[var(--text-primary)] focus:border-[var(--field-border)] dark:focus:border-[var(--field-border)] focus:ring-1 focus:ring-[var(--focus)] focus:outline-hidden transition-colors"
                          >
                            {allowedPromoters.map(pr => (
                              <option key={pr.id} value={pr.id} title={pr.name} className="bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
                                {pr.name}
                              </option>
                            ))}
                          </select>
                        </td>

                        {/* Valor Liberado */}
                        <td data-label="Valor liberado (R$)" className="px-3 py-2">
                          <div className="relative rounded-md">
                            <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-2 text-[10px] font-bold text-[var(--text-secondary)] dark:text-[var(--text-secondary)]">
                              R$
                            </span>
                            <input aria-label={`Valor liberado (R$) da proposta ${idx + 1}`}
                              type="text"
                              value={row.disbursedValue ?? ''}
                              onChange={e => handleUpdateRow(idx, 'disbursedValue', e.target.value)}
                              placeholder="0,00"
                              title="Valor liberado para o cliente"
                              className="w-full rounded-md border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] pl-7 pr-2 py-1.5 text-xs font-semibold text-[var(--text-secondary)] dark:text-[var(--text-primary)] placeholder-[var(--text-secondary)] dark:placeholder-[var(--text-secondary)] focus:border-[var(--field-border)] dark:focus:border-[var(--field-border)] focus:ring-1 focus:ring-[var(--focus)] focus:outline-hidden transition-colors"
                            />
                          </div>
                        </td>

                        {/* Saldo Contrato (Destacado em Portabilidade) */}
                        <td data-label="Saldo do contrato (R$)" className="px-3 py-2">
                          <div className="relative rounded-md">
                            <span
                              className={`pointer-events-none absolute inset-y-0 left-0 flex items-center pl-2 text-[10px] font-bold ${
                                isPort ? 'text-[var(--link)] dark:text-[var(--link)]' : 'text-[var(--text-secondary)] dark:text-[var(--text-secondary)]'
                              }`}
                            >
                              R$
                            </span>
                            <input aria-label={`Saldo do contrato (R$) da proposta ${idx + 1}`}
                              type="text"
                              value={row.contractBalance ?? ''}
                              onChange={e => handleUpdateRow(idx, 'contractBalance', e.target.value)}
                              placeholder={isPort ? 'Saldo devedor' : 'Opcional'}
                              title={isPort ? 'Informe o saldo do contrato a ser portado' : 'Saldo do contrato'}
                              className={`w-full rounded-md border pl-7 pr-2 py-1.5 text-xs font-semibold focus:outline-hidden transition-all ${
                                isPort
                                  ? 'border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--info-bg)] dark:bg-[var(--info-bg)] text-[var(--link)] dark:text-[var(--link)] placeholder-[var(--link)] dark:placeholder-[var(--link)] focus:border-[var(--field-border)] dark:focus:border-[var(--field-border)] ring-1 ring-[var(--focus)] dark:ring-[var(--focus)]'
                                  : 'border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] text-[var(--text-secondary)] dark:text-[var(--text-primary)] placeholder-[var(--text-secondary)] dark:placeholder-[var(--text-secondary)] focus:border-[var(--field-border)] dark:focus:border-[var(--field-border)] focus:ring-1 focus:ring-[var(--focus)]'
                              }`}
                            />
                          </div>
                        </td>

                        <td data-empty={!isRefinPort && !isPort} data-label="Vínculo de refinanciamento / portabilidade" className="px-3 py-2">
                          {isRefinPort ? (
                            <div className="flex items-center gap-1">
                              <Link2 className="h-3.5 w-3.5 text-[var(--link)] dark:text-[var(--link)] shrink-0" />
                              <select aria-label={`Vínculo de refinanciamento / portabilidade da proposta ${idx + 1}`}
                                value={row.linkWithPortabilityIndex ?? ''}
                                onChange={e =>
                                  handleUpdateRow(
                                    idx,
                                    'linkWithPortabilityIndex',
                                    e.target.value === '' ? undefined : Number(e.target.value)
                                  )
                                }
                                className="w-full rounded border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--info-bg)] dark:bg-[var(--info-bg)] text-xs font-semibold text-[var(--link)] dark:text-[var(--link)] px-2 py-1 focus:border-[var(--field-border)] dark:focus:border-[var(--field-border)] focus:outline-hidden transition-colors"
                              >
                                <option value="" className="bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] text-[var(--text-secondary)] dark:text-[var(--text-primary)]">Nenhum Vínculo</option>
                                {adeRows.map((other, oIdx) => {
                                  if (oIdx === idx) return null;
                                  const otherProd = products.find(p => p.id === other.productId);
                                  return (
                                    <option key={other.id} value={oIdx} className="bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
                                      Linha #{oIdx + 1} ({other.proposalNumber ? `ADE ${other.proposalNumber}` : 'Sem ADE'}) - {otherProd?.name || 'Produto'}
                                    </option>
                                  );
                                })}
                              </select>
                            </div>
                          ) : isPort ? (() => {
                            const portRowIndex = adeRows.findIndex(r => {
                              const prod = products.find(p => p.id === r.productId);
                              return isPortProduct(prod);
                            });
                            const linkingRowIdx = adeRows.findIndex((other, oIdx) => {
                              const otherProd = products.find(p => p.id === other.productId);
                              return isRefinPortProduct(otherProd) && (
                                other.linkWithPortabilityIndex === idx ||
                                (other.linkWithPortabilityIndex === undefined && idx === portRowIndex)
                              );
                            });
                            if (linkingRowIdx !== -1) {
                              const linkingRow = adeRows[linkingRowIdx];
                              const linkingProd = products.find(p => p.id === linkingRow.productId);
                              return (
                                <div className="flex items-center gap-1.5 text-[10px] text-[var(--link)] dark:text-[var(--link)] font-semibold bg-[var(--info-bg)] dark:bg-[var(--info-bg)] px-2 py-1 rounded border border-[var(--field-border)] dark:border-[var(--field-border)] w-fit">
                                  <Link2 className="h-3 w-3 text-[var(--link)] dark:text-[var(--link)] shrink-0" />
                                  <span>Será vinculado ao salvar ({linkingProd?.name || 'PORTAB/REFIN'})</span>
                                </div>
                              );
                            }
                            return <span className="text-[var(--text-secondary)] dark:text-[var(--text-secondary)] text-[10px] block text-center">-</span>;
                          })() : (
                            <span className="text-[var(--text-secondary)] dark:text-[var(--text-secondary)] text-[10px] block text-center">-</span>
                          )}
                        </td>

                        {mode === 'COMPLETO' && (
                          <td data-label="Observações" className="px-3 py-2">
                            <input aria-label={`Observações da proposta ${idx + 1}`}
                              type="text"
                              value={row.notes || ''}
                              onChange={e => handleUpdateRow(idx, 'notes', e.target.value)}
                              placeholder="Observação"
                              className="w-full rounded-md border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] px-2 py-1.5 text-[11px] text-[var(--text-secondary)] dark:text-[var(--text-primary)] placeholder-[var(--text-secondary)] dark:placeholder-[var(--text-secondary)] focus:border-[var(--field-border)] dark:focus:border-[var(--field-border)] focus:ring-1 focus:ring-[var(--focus)] focus:outline-hidden transition-colors"
                            />
                          </td>
                        )}

                        <td data-label="Ações" className="px-3 py-2 text-center">
                          <button
                            onClick={() => handleRemoveRow(idx)}
                            disabled={adeRows.length <= 1}
                            className="text-[var(--text-secondary)] dark:text-[var(--text-secondary)] hover:text-[var(--danger-text)] dark:hover:text-[var(--danger-text)] disabled:opacity-90 cursor-pointer transition-colors"
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
            <div className="rounded-lg border border-[var(--danger-border)] dark:border-[var(--danger-border)] bg-[var(--danger-bg)] dark:bg-[var(--danger-bg)] p-3 text-xs text-[var(--danger-text)] dark:text-[var(--danger-text)] flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-[var(--danger-text)] dark:text-[var(--danger-text)] shrink-0 mt-0.5" />
              <div className="whitespace-pre-line">{errorMsg}</div>
            </div>
          )}

          {successMsg && (
            <div className="rounded-lg border border-[var(--success-border)] dark:border-[var(--success-border)] bg-[var(--success-bg)] dark:bg-[var(--success-bg)] p-3 text-xs text-[var(--success-text)] dark:text-[var(--success-text)] flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-[var(--success-text)] dark:text-[var(--success-text)] shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}
        </fieldset>

        {/* Modal Footer */}
        <div className="shrink-0 flex items-center justify-between border-t border-[var(--field-border)] dark:border-[var(--field-border)] px-4 sm:px-6 py-3.5 sm:py-4 bg-[var(--bg-canvas)] dark:bg-[var(--bg-canvas)] rounded-b-xl">
          <div className="text-xs text-[var(--text-secondary)] dark:text-[var(--text-secondary)] font-medium">
            Total de propostas para salvar:{' '}
            <strong className="text-[var(--text-secondary)] dark:text-[var(--text-primary)]">{adeRows.length}</strong>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              disabled={isSaving}
              className="px-4 py-2 text-xs font-semibold text-[var(--text-secondary)] dark:text-[var(--text-primary)] hover:text-[var(--text-secondary)] dark:hover:text-[var(--text-primary)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface-elevated)] border border-[var(--field-border)] dark:border-[var(--field-border)] rounded-lg hover:bg-[var(--bg-canvas)] dark:hover:bg-[var(--bg-surface-elevated)] disabled:opacity-90 disabled:cursor-not-allowed transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              id="btn-save-all-ades"
              onClick={handleSave}
              disabled={isSaving}
              className="px-5 py-2 text-xs font-bold text-[var(--success-text)] bg-[var(--success-bg)] hover:bg-[var(--success-bg)] disabled:bg-[var(--success-bg)] disabled:cursor-not-allowed rounded-lg  transition-colors flex items-center gap-2 cursor-pointer"
            >
              {isSaving ? (
                <>
                  <span className="h-4 w-4 border-2 border-[var(--field-border)] border-t-transparent rounded-full animate-spin shrink-0" />
                  <span>SALVANDO...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  <span>{adeRows.length === 1 ? 'Salvar proposta' : "Salvar " + adeRows.length + " propostas"}</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
