import { BankPlaybooksPanel } from './BankPlaybooksPanel';
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { PartnerSearchSelect } from '../common/PartnerSearchSelect';
import {
  Calculator,
  Plus,
  Search,
  Filter,
  CheckCircle2,
  XCircle,
  Clock,
  Send,
  Sparkles,
  User,
  Building2,
  Calendar,
  AlertTriangle,
  RotateCcw,
  Copy,
  Check,
  ArrowRight,
  TrendingUp,
  FileCheck2,
  ExternalLink,
  ShieldCheck,
  Trash2,
  ShieldAlert,
  Download,
  ListFilter,
  Info,
  ChevronRight,
  BarChart2,
  Users,
  Hourglass,
  FileSpreadsheet,
} from 'lucide-react';
import { StorageService } from '../../services/storageService';
import { RecordWorkspace, OperationCard, operationLabel, type RecordPresentation } from '../ui/RecordWorkspace';
import { SimulationRequest, SimulationStatus, SimulationType, Partner, User as UserType, Convenio, Product } from '../../types';
import { formatCpf, normalizeCpf, isValidCpf, extractPartnerCode } from '../../lib/utils';
import { SimulationImportModal } from './SimulationImportModal';
import { PartnerSimulationMonthlyReport } from './PartnerSimulationMonthlyReport';
import { SimulationFlowSelectorModal } from './SimulationFlowSelectorModal';
import { SpreadsheetPortRefinWorkspace } from './SpreadsheetPortRefinWorkspace';
import { ProductSimulationModal } from './ProductSimulationModal';
import { HappyInssSimulationModal } from './HappyInssSimulationModal';
import { HappyCltSimulationModal } from './HappyCltSimulationModal';
import { FinantoInssSimulationModal } from './FinantoInssSimulationModal';
import { NossaFintechPortRefinSimulationModal } from './NossaFintechPortRefinSimulationModal';
import { toastService } from '../ui/toastService';
import { hasPermission } from '../../lib/permissions';

interface SimulationViewProps {
  premium?: boolean;
  onOpenProposalDetail?: (proposalId: string) => void;
}

type TabType = 'VISAO_GERAL' | 'AGUARDANDO_DIGITACAO' | 'DASHBOARD_ANALISES' | 'PORT_REFIN_PLANILHAS';

const toLocalDateKey = (value: string): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const SimulationWorkspace: React.FC<SimulationViewProps> = ({ onOpenProposalDetail, premium = false }) => {
  const activeUser = StorageService.getActiveUser();
  const canSetInitialStatus = hasPermission(activeUser?.role, activeUser?.customPermissions, 'simulations.update');
  const [activeTab, setActiveTab] = useState<TabType>('VISAO_GERAL');
  const [presentation, setPresentation] = useState<RecordPresentation>('cards');
  const [simulations, setSimulations] = useState<SimulationRequest[]>([]);
  const [simulationsLoadError, setSimulationsLoadError] = useState<string | null>(null);
  const [isLoadingSimulations, setIsLoadingSimulations] = useState(true);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [users, setUsers] = useState<UserType[]>([]);

  // Filter states
  const [cpfSearch, setCpfSearch] = useState('');
  const [selectedPartnerId, setSelectedPartnerId] = useState('');
  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<string>('TODOS');
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<string>('TODOS');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Bulk Selection State
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Modals state
  const [isFlowSelectorOpen, setIsFlowSelectorOpen] = useState(false);
  const [multiProduct, setMultiProduct] = useState<'CLT' | 'FGTS' | null>(null);
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [isHappyInssModalOpen, setIsHappyInssModalOpen] = useState(false);
  const [isHappyCltModalOpen, setIsHappyCltModalOpen] = useState(false);
  const [isFinantoInssModalOpen, setIsFinantoInssModalOpen] = useState(false);
  const [finantoOperationCode, setFinantoOperationCode] = useState<'1' | '2' | '3' | '4'>('1');
  const [finantoEnabled, setFinantoEnabled] = useState(false);
  const [nossaFintechEnabled, setNossaFintechEnabled] = useState(false);
  const [inssInitialDraft, setInssInitialDraft] = useState<React.ComponentProps<typeof FinantoInssSimulationModal>['initialDraft']>();
  const [isNossaFintechPortRefinOpen, setIsNossaFintechPortRefinOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [newCpf, setNewCpf] = useState('');
  const [selectedPartner, setSelectedPartner] = useState<Partner | null>(null);
  const [partnerQuery, setPartnerQuery] = useState('');
  const [isPartnerDropdownOpen, setIsPartnerDropdownOpen] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [initialStatus, setInitialStatus] = useState<SimulationStatus>('SIMULAÇÃO ENVIADA');
  const [initialRejectionReason, setInitialRejectionReason] = useState<string>('');
  const [isCreatingSimulation, setIsCreatingSimulation] = useState(false);
  const isCreatingSimulationRef = useRef(false);
  const [conveniosList, setConveniosList] = useState<Convenio[]>([]);
  const [productsList, setProductsList] = useState<Product[]>([]);
  const [selectedConvenioId, setSelectedConvenioId] = useState<string>('');
  const [selectedProductId, setSelectedProductId] = useState<string>('');

  // Duplicate Warning State
  const [duplicateWarning, setDuplicateWarning] = useState<{
    pendingSim: SimulationRequest;
    cleanCpf: string;
    partnerId: string;
  } | null>(null);

  // Status Change Confirmation Modal
  const [statusModalTarget, setStatusModalTarget] = useState<SimulationRequest | null>(null);
  const [selectedTargetStatus, setSelectedTargetStatus] = useState<SimulationStatus>('DIGITADA PELA MESA');
  const [selectedAdeNumber, setSelectedAdeNumber] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');

  // Single Deletion Modal
  const [deleteModalTarget, setDeleteModalTarget] = useState<SimulationRequest | null>(null);
  const [deleteReason, setDeleteReason] = useState('');
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Bulk Deletion Modal
  const [isBulkDeleteModalOpen, setIsBulkDeleteModalOpen] = useState(false);
  const [bulkDeleteReason, setBulkDeleteReason] = useState('');
  const [bulkDeleteError, setBulkDeleteError] = useState<string | null>(null);

  // Detail Modal
  const [detailTarget, setDetailTarget] = useState<SimulationRequest | null>(null);

  // Copy feedback
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Simulation Access Control State (Específico para integrações Happy)
  const [happySimulationAccessEnabled, setHappySimulationAccessEnabled] = useState<boolean>(true);
  const fetchSimulationAccess = async () => {
    try {
      const res = await fetch('/api/settings/simulation-access', { credentials: 'same-origin' });
      if (res.ok) {
        const data = await res.json();
        const isEnabled = data.happySimulationAccessEnabled !== undefined
          ? data.happySimulationAccessEnabled !== false
          : data.simulationAccessEnabled !== false;
        setHappySimulationAccessEnabled(isEnabled);
      } else {
        // Fallback para o tenant local se rota ainda não estiver disponível
        const currentTenant = StorageService.getCurrentTenant();
        if (currentTenant && currentTenant.happySimulationAccessEnabled !== undefined) {
          setHappySimulationAccessEnabled(currentTenant.happySimulationAccessEnabled);
        }
      }
    } catch {
      const currentTenant = StorageService.getCurrentTenant();
      if (currentTenant && currentTenant.happySimulationAccessEnabled !== undefined) {
        setHappySimulationAccessEnabled(currentTenant.happySimulationAccessEnabled);
      }
    }
  };

  const comboboxRef = useRef<HTMLDivElement>(null);
  const loadRequestRef = useRef(0);

  const loadData = async () => {
    const requestId = ++loadRequestRef.current;
    setIsLoadingSimulations(true);
    setSimulationsLoadError(null);
    try {
      const res = await fetch('/api/simulations', { credentials: 'same-origin' });
      if (res.ok) {
        const data = await res.json();
        if (requestId !== loadRequestRef.current) return;
        setSimulations(data);
      } else {
        if (requestId !== loadRequestRef.current) return;
        console.error('Erro ao carregar simulações da API:', res.statusText);
        setSimulationsLoadError('Não foi possível carregar as solicitações. Confira sua conexão e tente novamente.');
      }
    } catch (err) {
      if (requestId !== loadRequestRef.current) return;
      console.error('Falha de rede ao carregar simulações da API:', err);
      setSimulationsLoadError('Falha de conexão ao carregar as solicitações. Tente novamente.');
    } finally {
      if (requestId === loadRequestRef.current) setIsLoadingSimulations(false);
    }
    if (requestId !== loadRequestRef.current) return;

    try {
      const pRes = await fetch('/api/partners');
      if (pRes.ok) {
        const pData = await pRes.json();
        if (requestId !== loadRequestRef.current) return;
        setPartners(pData.filter((p: any) => p.status === 'ATIVO' || p.active === true));
      } else {
        console.error('Erro ao carregar parceiros da API:', pRes.statusText);
        if (requestId === loadRequestRef.current) setPartners(StorageService.getPartners().filter(p => p.active));
      }
    } catch (err) {
      console.error('Falha de rede ao carregar parceiros da API:', err);
      if (requestId === loadRequestRef.current) setPartners(StorageService.getPartners().filter(p => p.active));
    }
    if (requestId !== loadRequestRef.current) return;

    try {
      const uRes = await fetch('/api/users');
      if (uRes.ok) {
        const uData = await uRes.json();
        if (requestId !== loadRequestRef.current) return;
        setUsers(uData);
      } else {
        if (requestId === loadRequestRef.current) setUsers(StorageService.getUsers());
      }
    } catch {
      if (requestId === loadRequestRef.current) setUsers(StorageService.getUsers());
    }
    if (requestId !== loadRequestRef.current) return;

    try {
      const cRes = await fetch('/api/convenios');
      if (cRes.ok) {
        const cData = await cRes.json();
        if (requestId !== loadRequestRef.current) return;
        setConveniosList(cData.filter((c: any) => c.active !== false));
      } else {
        if (requestId === loadRequestRef.current) setConveniosList(StorageService.getConvenios().filter(c => c.active));
      }
    } catch {
      if (requestId === loadRequestRef.current) setConveniosList(StorageService.getConvenios().filter(c => c.active));
    }
    if (requestId !== loadRequestRef.current) return;

    try {
      const prRes = await fetch('/api/products');
      if (prRes.ok) {
        const prData = await prRes.json();
        if (requestId !== loadRequestRef.current) return;
        setProductsList(prData.filter((p: any) => p.active !== false));
      } else {
        if (requestId === loadRequestRef.current) setProductsList(StorageService.getProducts().filter(p => p.active));
      }
    } catch {
      if (requestId === loadRequestRef.current) setProductsList(StorageService.getProducts().filter(p => p.active));
    }
  };

  useEffect(() => {
    loadData();
    fetchSimulationAccess();
    const handleUpdate = () => {
      loadData();
      fetchSimulationAccess();
    };
    window.addEventListener('credit_gestao_storage_update', handleUpdate);
    window.addEventListener('tenantUpdated', handleUpdate);
    return () => {
      // Invalidate any in-flight loadData sequence before the view unmounts.
      loadRequestRef.current += 1;
      window.removeEventListener('credit_gestao_storage_update', handleUpdate);
      window.removeEventListener('tenantUpdated', handleUpdate);
    };
  }, []);

  // Close combobox when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (comboboxRef.current && !comboboxRef.current.contains(event.target as Node)) {
        setIsPartnerDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filtered partners for autocomplete combobox
  const filteredPartnerOptions = useMemo(() => {
    if (!partnerQuery.trim()) return partners;

    const query = partnerQuery.trim().toLowerCase();
    return partners.filter(p => {
      if (!p) return false;
      const loginStr = String(p.login ?? (p as any).code ?? '');
      const fullNameStr = String(p.fullName ?? (p as any).name ?? '');
      const code = loginStr.trim().toLowerCase();
      const login = loginStr.toLowerCase();
      const name = fullNameStr.toLowerCase();

      return code.includes(query) || login.includes(query) || name.includes(query);
    });
  }, [partners, partnerQuery]);

  // Format CPF as typing in modal
  const handleCpfChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value.replace(/\D/g, '');
    if (value.length > 11) value = value.slice(0, 11);

    // Apply visual mask 000.000.000-00
    if (value.length > 9) {
      value = `${value.slice(0, 3)}.${value.slice(3, 6)}.${value.slice(6, 9)}-${value.slice(9)}`;
    } else if (value.length > 6) {
      value = `${value.slice(0, 3)}.${value.slice(3, 6)}.${value.slice(6)}`;
    } else if (value.length > 3) {
      value = `${value.slice(0, 3)}.${value.slice(3)}`;
    }
    setNewCpf(value);
    setModalError(null);
  };

  const handleOpenNewModal = () => {
    setIsFlowSelectorOpen(true);
  };

  const handleOpenManualModal = () => {
    setModalError(null);
    setNewCpf('');
    setSelectedPartner(null);
    setPartnerQuery('');
    setDuplicateWarning(null);
    setInitialStatus('SIMULAÇÃO ENVIADA');
    setInitialRejectionReason('');
    setSelectedConvenioId('');
    setSelectedProductId('');
    setIsNewModalOpen(true);
  };

  const executeCreateSimulation = async (
    cleanCpf: string,
    partnerId: string,
    statusOverride?: SimulationStatus,
    reasonOverride?: string
  ) => {
    if (isCreatingSimulationRef.current) return;
    isCreatingSimulationRef.current = true;
    setIsCreatingSimulation(true);
    try {
      const res = await fetch('/api/simulations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          cpf: cleanCpf,
          partnerId,
          simulationType: 'MANUAL',
          convenioId: selectedConvenioId || undefined,
          productId: selectedProductId || undefined,
          initialStatus: statusOverride || initialStatus,
          rejectionReason: (statusOverride || initialStatus) === 'NÃO PASSÍVEL DE CONTRATAÇÃO'
            ? (reasonOverride ?? initialRejectionReason).trim() || undefined
            : undefined,
        }),
      });

      if (res.status === 409) {
        const data = await res.json();
        setDuplicateWarning({
          pendingSim: data.existing,
          cleanCpf,
          partnerId,
        });
        return;
      }

      if (!res.ok) {
        const data = await res.json();
        setModalError(data.error || 'Erro ao registrar solicitação de simulação.');
        return;
      }

      await res.json();

      setIsNewModalOpen(false);
      setNewCpf('');
      setSelectedPartner(null);
      setPartnerQuery('');
      setDuplicateWarning(null);
      setInitialStatus('SIMULAÇÃO ENVIADA');
      setInitialRejectionReason('');
      await loadData();
    } catch (err: any) {
      setModalError(err.message || 'Erro de comunicação ao registrar solicitação de simulação.');
    } finally {
      isCreatingSimulationRef.current = false;
      setIsCreatingSimulation(false);
    }
  };

  useEffect(() => {
    fetch('/api/integrations/finanto/config', { credentials: 'same-origin' })
      .then(response => response.ok ? response.json() : null)
      .then(config => setFinantoEnabled(Boolean(config?.isConfigured && config?.enabled)))
      .catch(() => setFinantoEnabled(false));
    fetch('/api/integrations/nossa-fintech/config', { credentials: 'same-origin' })
      .then(response => response.ok ? response.json() : null)
      .then(config => setNossaFintechEnabled(Boolean(config?.isConfigured && config?.enabled)))
      .catch(() => setNossaFintechEnabled(false));
  }, []);

  const handleSubmitSimulation = (e: React.FormEvent) => {
    e.preventDefault();
    setModalError(null);

    const cleanCpf = normalizeCpf(newCpf);
    if (!cleanCpf || cleanCpf.length !== 11) {
      setModalError('Informe um CPF válido com exatamente 11 dígitos.');
      return;
    }

    if (!isValidCpf(cleanCpf)) {
      setModalError('CPF com formato inválido. Verifique os dígitos digitados.');
      return;
    }

    if (!selectedPartner) {
      setModalError('Selecione um parceiro válido na lista de pesquisa.');
      return;
    }

    // Check for existing pending duplicate in state
    const existingPending = simulations.find(
      s => s.status === 'SIMULAÇÃO ENVIADA' && s.cpf === cleanCpf && s.partnerId === selectedPartner.id
    );
    if (existingPending) {
      setDuplicateWarning({
        pendingSim: existingPending,
        cleanCpf,
        partnerId: selectedPartner.id,
      });
      return;
    }

    executeCreateSimulation(cleanCpf, selectedPartner.id, initialStatus, initialRejectionReason);
  };

  const handleConfirmStatusChange = async () => {
    if (!statusModalTarget) return;

    try {
      const res = await fetch(`/api/simulations/${statusModalTarget.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          status: selectedTargetStatus,
          rejectionReason: rejectionReason || (selectedTargetStatus === 'NÃO PASSÍVEL DE CONTRATAÇÃO' ? 'Inviabilidade de crédito / sem margem ou política de crédito' : 'Alteração manual de status'),
          matchedProposalNumber: selectedAdeNumber,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        toastService.error('Erro ao atualizar status', data.error || 'Tente novamente.');
        return;
      }

      setStatusModalTarget(null);
      setRejectionReason('');
      setSelectedAdeNumber('');
      window.dispatchEvent(new Event('credit_gestao_storage_update'));
      window.dispatchEvent(new Event('proposalsUpdated'));
      await loadData();
    } catch (err: any) {
      toastService.error('Erro de comunicação', err.message || 'Não foi possível atualizar o status.');
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteModalTarget) return;
    setDeleteError(null);

    try {
      const res = await fetch(`/api/simulations/${deleteModalTarget.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ reason: deleteReason || 'Exclusão solicitada' }),
      });

      if (!res.ok) {
        const data = await res.json();
        setDeleteError(data.error || 'Erro ao excluir solicitação de simulação.');
        return;
      }

      setDeleteModalTarget(null);
      setDeleteReason('');
      setSelectedIds(prev => prev.filter(id => id !== deleteModalTarget.id));
      await loadData();
    } catch (err: any) {
      setDeleteError(err.message || 'Erro de comunicação ao excluir solicitação de simulação.');
    }
  };

  const handleConfirmBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    setBulkDeleteError(null);

    try {
      const res = await fetch('/api/simulations/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          ids: selectedIds,
          reason: bulkDeleteReason || 'Exclusão em massa de simulações',
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setBulkDeleteError(data.error || 'Erro ao executar exclusão em massa.');
        return;
      }

      const result = await res.json();
      if (result.failedCount > 0) {
        const failedErrors = result.results
          .filter((r: any) => !r.success)
          .map((r: any) => `${r.id}: ${r.error}`)
          .join(' | ');
        setBulkDeleteError(`Excluídos ${result.deletedCount} de ${result.requestedCount}. Erros: ${failedErrors}`);
      }

      if (result.deletedCount > 0) {
        setSelectedIds([]);
        if (result.failedCount === 0) {
          setIsBulkDeleteModalOpen(false);
          setBulkDeleteReason('');
        }
        await loadData();
      }
    } catch (err: any) {
      setBulkDeleteError(err.message || 'Erro de comunicação ao processar exclusão em massa.');
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Metrics calculation
  const metrics = useMemo(() => {
    const total = simulations.length;
    const enviadas = simulations.filter(s => s.status === 'SIMULAÇÃO ENVIADA').length;
    const naoPassivel = simulations.filter(s => s.status === 'NÃO PASSÍVEL DE CONTRATAÇÃO').length;
    const digitadas = simulations.filter(s => s.status === 'DIGITADA PELA MESA').length;
    const perdidas = simulations.filter(s => s.status === 'PERDIDA (NÃO DIGITADA)').length;

    // Taxa de conversão: Digitadas sobre o total de simulações cadastradas
    const taxaConversao = total > 0 ? (digitadas / total) * 100 : 0;

    return {
      total,
      enviadas,
      naoPassivel,
      digitadas,
      perdidas,
      taxaConversao: taxaConversao.toFixed(1),
    };
  }, [simulations]);

  // Filtered simulations
  const filteredSimulations = useMemo(() => {
    const cleanSearch = normalizeCpf(cpfSearch);

    return simulations.filter(sim => {
      // CPF Filter
      if (cleanSearch) {
        if (!normalizeCpf(sim.cpf).includes(cleanSearch)) return false;
      }

      // Partner Filter
      if (selectedPartnerId && sim.partnerId !== selectedPartnerId) {
        return false;
      }

      // User Filter
      if (selectedUserId && sim.createdById !== selectedUserId) {
        return false;
      }

      // Status Filter
      if (selectedStatus !== 'TODOS' && sim.status !== selectedStatus) {
        return false;
      }

      // Simulation Type Filter
      if (selectedTypeFilter !== 'TODOS') {
        const type = sim.simulationType || 'MANUAL';
        if (type !== selectedTypeFilter) return false;
      }

      // Date Range Filter
      if (startDate || endDate) {
        const simDate = toLocalDateKey(sim.createdAt);
        if (!simDate) return false;
        if (startDate && simDate < startDate) return false;
        if (endDate && simDate > endDate) return false;
      }

      return true;
    });
  }, [simulations, cpfSearch, selectedPartnerId, selectedUserId, selectedStatus, selectedTypeFilter, startDate, endDate]);

  // Aguardando Digitação (Fila da Mesa - sorted oldest first)
  const pendingQueueSimulations = useMemo(() => {
    return simulations
      .filter(s => s.status === 'SIMULAÇÃO ENVIADA')
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }, [simulations]);

  // Partner Analysis
  const partnerStats = useMemo(() => {
    const map = new Map<
      string,
      {
        partner: Partner;
        enviadas: number;
        digitadas: number;
        naoPassivel: number;
        perdidas: number;
        total: number;
      }
    >();

    simulations.forEach(sim => {
      const partner = partners.find(p => p.id === sim.partnerId);
      if (!partner) return;

      const current = map.get(partner.id) || {
        partner,
        enviadas: 0,
        digitadas: 0,
        naoPassivel: 0,
        perdidas: 0,
        total: 0,
      };

      current.total++;
      if (sim.status === 'SIMULAÇÃO ENVIADA') current.enviadas++;
      else if (sim.status === 'DIGITADA PELA MESA') current.digitadas++;
      else if (sim.status === 'NÃO PASSÍVEL DE CONTRATAÇÃO') current.naoPassivel++;
      else if (sim.status === 'PERDIDA (NÃO DIGITADA)') current.perdidas++;

      map.set(partner.id, current);
    });

    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [simulations, partners]);

  // Responsável Analysis
  const userStats = useMemo(() => {
    const map = new Map<
      string,
      {
        user: UserType;
        enviadas: number;
        digitadas: number;
        naoPassivel: number;
        perdidas: number;
        total: number;
      }
    >();

    simulations.forEach(sim => {
      const user = users.find(u => u.id === sim.createdById);
      if (!user) return;

      const current = map.get(user.id) || {
        user,
        enviadas: 0,
        digitadas: 0,
        naoPassivel: 0,
        perdidas: 0,
        total: 0,
      };

      current.total++;
      if (sim.status === 'SIMULAÇÃO ENVIADA') current.enviadas++;
      else if (sim.status === 'DIGITADA PELA MESA') current.digitadas++;
      else if (sim.status === 'NÃO PASSÍVEL DE CONTRATAÇÃO') current.naoPassivel++;
      else if (sim.status === 'PERDIDA (NÃO DIGITADA)') current.perdidas++;

      map.set(user.id, current);
    });

    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [simulations, users]);

  // Average Time calculation for matched simulations
  const averageMatchTime = useMemo(() => {
    const matched = simulations.filter(s => s.status === 'DIGITADA PELA MESA' && s.matchedAt);
    if (matched.length === 0) return '0 min';

    let totalMs = 0;
    matched.forEach(s => {
      const start = new Date(s.createdAt).getTime();
      const end = new Date(s.matchedAt!).getTime();
      if (end >= start) totalMs += end - start;
    });

    const avgMinutes = Math.round(totalMs / matched.length / (1000 * 60));
    if (avgMinutes < 60) return `${avgMinutes} min`;
    const hours = Math.floor(avgMinutes / 60);
    const mins = avgMinutes % 60;
    return `${hours}h ${mins}min`;
  }, [simulations]);

  // Helpers for elapsed time and SLA aging (72h Max)
  const getElapsedTimeInfo = (createdAt: string, matchedAt?: string, status?: string, expiresAt?: string) => {
    const startTime = new Date(createdAt).getTime();
    const endTime = matchedAt ? new Date(matchedAt).getTime() : Date.now();
    const diffMs = Math.max(0, endTime - startTime);
    const diffMins = Math.floor(diffMs / (1000 * 60));

    let text = `${diffMins} min`;
    if (diffMins >= 60) {
      const h = Math.floor(diffMins / 60);
      const m = diffMins % 60;
      text = `${h}h ${m}min`;
    }

    // SLA Maximum: 72 hours (4320 mins)
    const MAX_SLA_MINS = expiresAt ? Math.max(0, (new Date(expiresAt).getTime() - startTime) / 60000) : 72 * 60;
    const remainingMins = Math.max(0, MAX_SLA_MINS - diffMins);

    let remainingText = '';
    if (status === 'PERDIDA (NÃO DIGITADA)' || diffMins >= MAX_SLA_MINS) {
      remainingText = expiresAt ? 'Prazo de 5 dias úteis encerrado' : 'Expirado (72h)';
    } else {
      const remH = Math.floor(remainingMins / 60);
      const remM = remainingMins % 60;
      remainingText = `${remH}h ${remM}m restantes`;
    }

    // SLA Colors based on 72h max limit
    let badgeClass = 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800';
    if (!matchedAt && status !== 'DIGITADA PELA MESA' && status !== 'NÃO PASSÍVEL DE CONTRATAÇÃO') {
      if (status === 'PERDIDA (NÃO DIGITADA)' || diffMins >= MAX_SLA_MINS) {
        badgeClass = 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-300 dark:border-slate-700';
      } else if (diffMins > 60 * 60) { // > 60 hours
        badgeClass = 'bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300 border-rose-200 dark:border-rose-800 animate-pulse';
      } else if (diffMins > 48 * 60) { // > 48 hours
        badgeClass = 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300 border-amber-200 dark:border-amber-800';
      } else if (diffMins > 24 * 60) { // > 24 hours
        badgeClass = 'bg-yellow-50 text-yellow-700 dark:bg-yellow-950/50 dark:text-yellow-300 border-yellow-200 dark:border-yellow-800';
      }
    }

    return { text, diffMins, remainingText, remainingMins, badgeClass };
  };

  const clearFilters = () => {
    setCpfSearch('');
    setSelectedPartnerId('');
    setSelectedUserId('');
    setSelectedStatus('TODOS');
    setSelectedTypeFilter('TODOS');
    setStartDate('');
    setEndDate('');
  };

  const hasActiveFilters =
    cpfSearch || selectedPartnerId || selectedUserId || selectedStatus !== 'TODOS' || selectedTypeFilter !== 'TODOS' || startDate || endDate;

  // UI Permission helpers for simulation view
  const canDeleteSimulationUI = (user: UserType | null, sim: SimulationRequest): boolean => {
    if (!user || !user.role || !sim) return false;
    if (user.role === 'PLATFORM_MASTER' || ['MASTER', 'TENANT_ADMIN', 'GESTOR', 'GERENTE'].includes(user.role)) {
      return true;
    }
    if (['SUPORTE', 'DIGITADOR'].includes(user.role)) {
      return sim.createdById === user.id && sim.status !== 'DIGITADA PELA MESA';
    }
    return false;
  };

  const canChangeStatusUI = (user: UserType | null, sim: SimulationRequest): boolean => {
    if (!user || !user.role || !sim) return false;
    if (sim.status === 'DIGITADA PELA MESA' || sim.status === 'PERDIDA (NÃO DIGITADA)') return false;
    return ['PLATFORM_MASTER', 'MASTER', 'TENANT_ADMIN', 'GESTOR', 'GERENTE', 'SUPORTE', 'DIGITADOR'].includes(user.role);
  };

  // Bulk Selection Handlers
  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      const deletableIds = filteredSimulations
        .filter(s => canDeleteSimulationUI(activeUser, s))
        .map(s => s.id);
      setSelectedIds(deletableIds);
    } else {
      setSelectedIds([]);
    }
  };

  const handleToggleSelectRow = (id: string) => {
    setSelectedIds(prev => (prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]));
  };

  // CSV Export
  const handleExportCsv = () => {
    const dataToExport = filteredSimulations;
    if (dataToExport.length === 0) {
      toastService.info('Sem dados para exportar', 'Ajuste os filtros ou aguarde solicitações na lista.');
      return;
    }

    const headers = [
      'CPF',
      'PARCEIRO_LOGIN',
      'PARCEIRO_NOME',
      'RESPONSAVEL',
      'DATA_HORA_SOLICITACAO',
      'STATUS',
      'ADE_PROPOSTA',
      'DIGITADOR',
      'DATA_HORA_DIGITACAO',
      'TEMPO_ATE_DIGITACAO',
      'CODIGO_PARCEIRO_ORIGINAL', 'ORIGEM', 'MODALIDADE', 'VALOR_LIBERADO', 'PRAZO_DIGITACAO', 'DIGITADA_APOS_PRAZO',
    ];

    const rows = dataToExport.map(s => {
      const partner = partners.find(p => p.id === s.partnerId);
      const creator = users.find(u => u.id === s.createdById);
      const elapsed = getElapsedTimeInfo(s.createdAt, s.matchedAt, s.status, s.offerExpiresAt);

      return [
        `"${formatCpf(s.cpf)}"`,
        `"${partner?.login || ''}"`,
        `"${partner?.fullName || ''}"`,
        `"${creator?.name || s.portalAccessName || ''}"`,
        `"${new Date(s.createdAt).toLocaleString('pt-BR')}"`,
        `"${s.status}"`,
        `"${s.matchedProposalNumber || ''}"`,
        `"${s.matchedDigitizerName || ''}"`,
        `"${s.matchedAt ? new Date(s.matchedAt).toLocaleString('pt-BR') : ''}"`,
        `"${elapsed.text}"`,
        `"${s.partnerCodeSnapshot || partner?.login || ''}"`, `"${s.simulationType || ''}"`, `"${s.operationType || ''}"`, `"${s.selectedCondition?.amount || ''}"`, `"${s.offerExpiresAt ? new Date(s.offerExpiresAt).toLocaleString('pt-BR') : ''}"`, `"${s.matchedAfterDeadline ? 'SIM' : 'NAO'}"`,
      ].join(';');
    });

    const csvContent = '\uFEFF' + [headers.join(';'), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Central_Simulacoes_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    // Audit log
    fetch('/api/audit-logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'EXPORTAR_CENTRAL_SIMULACOES',
        entity: 'SimulationRequest',
        entityId: 'EXPORT',
        newData: { quantity: dataToExport.length },
      }),
    }).catch(() => {});
  };

  const simulationFilters = <>
          {/* Filter Toolbar */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-3">
              {/* Search CPF */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  Buscar CPF
                </label>
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                  <input
                    type="text"
                    value={cpfSearch}
                    onChange={e => setCpfSearch(e.target.value)}
                    placeholder="Ex: 01138777498..."
                    className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Tipo / Fluxo Filter */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  Tipo / Fluxo
                </label>
                <select
                  value={selectedTypeFilter}
                  onChange={e => setSelectedTypeFilter(e.target.value)}
                  className="w-full px-2.5 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                >
                  <option value="TODOS">Todos os Fluxos</option>
                  <option value="MANUAL">Manual</option>
                  <option value="HAPPY_INSS">Happy INSS</option>
                  <option value="HAPPY_CLT">Happy CLT</option>
                  <option value="INSS_MULTI">INSS · simulação</option>
                  <option value="PARTNER_AUTO">Portal do parceiro · automáticas</option>
                  <option value="DAYCOVAL_INSS">Daycoval · versões anteriores</option><option value="SPREADSHEET_INSS">PORT + REFIN · Planilhas</option>
                  <option value="FINANTO_INSS">INSS · enviado à instituição</option>
                </select>
              </div>

              {/* Partner Filter */}
              <div>
                <PartnerSearchSelect
                  partners={partners}
                  selectedPartnerId={selectedPartnerId}
                  onSelectPartner={setSelectedPartnerId}
                  label="Parceiro"
                  placeholder="Buscar código ou nome..."
                  allowAll
                  allLabel="Todos os Parceiros"
                />
              </div>

              {/* Responsável Filter */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  Responsável
                </label>
                <select
                  value={selectedUserId}
                  onChange={e => setSelectedUserId(e.target.value)}
                  className="w-full px-2.5 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Todos os Usuários</option>
                  {users.map(u => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.role})
                    </option>
                  ))}
                </select>
              </div>

              {/* Status Filter */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  Status
                </label>
                <select
                  value={selectedStatus}
                  onChange={e => setSelectedStatus(e.target.value)}
                  className="w-full px-2.5 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                >
                  <option value="TODOS">Todos os Status</option>
                  <option value="SIMULAÇÃO ENVIADA">SIMULAÇÃO ENVIADA</option>
                  <option value="DIGITADA PELA MESA">DIGITADA PELA MESA</option>
                  <option value="NÃO PASSÍVEL DE CONTRATAÇÃO">NÃO PASSÍVEL DE CONTRATAÇÃO</option>
                  <option value="PERDIDA (NÃO DIGITADA)">PERDIDA (NÃO DIGITADA)</option>
                </select>
              </div>

              {/* Date Filter */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  Data Inicial
                </label>
                <input
                  type="date"
                  value={startDate}
                  max={endDate || undefined}
                  onChange={e => setStartDate(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  Data Final
                </label>
                <input
                  type="date"
                  value={endDate}
                  min={startDate || undefined}
                  onChange={e => setEndDate(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {hasActiveFilters && (
              <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  Mostrando <strong>{filteredSimulations.length}</strong> de <strong>{simulations.length}</strong> solicitações
                </span>
                <button
                  onClick={clearFilters}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 cursor-pointer"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Limpar Filtros
                </button>
              </div>
            )}
          </div>

  </>;
  const simulationSummary = <div className="record-stat-stack"><div className="record-stat-featured"><span>Conversão em digitação</span><strong>{metrics.taxaConversao}%</strong><p>{metrics.digitadas} de {metrics.total} simulações</p></div>{[{ label: 'Cadastradas', value: metrics.total, color: '#5c8dff' }, { label: 'Na fila da mesa', value: metrics.enviadas, color: '#ffbc52' }, { label: 'Digitadas', value: metrics.digitadas, color: '#32d9a4' }, { label: 'Ofertas perdidas', value: metrics.perdidas, color: '#fb7b97' }, { label: 'Não passíveis', value: metrics.naoPassivel, color: '#ad7bff' }].map(item => <div className="record-stat-row" key={item.label}><span className="record-stat-dot" style={{ background: item.color }} /><span>{item.label}</span><strong>{item.value}</strong></div>)}<div className="record-stat-note">As ofertas do portal têm prazo de 5 dias úteis para digitação.</div></div>;

  return (
    <div className={`sentinel-simulation-page space-y-6 pb-6 ${premium ? 'p2-live-module p2-live-simulations' : ''}`}>
      <BankPlaybooksPanel />
      {/* Page Header */}
      <div className="module-command-header">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="h-10 w-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-xs">
              <Calculator className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">
                Simulações de crédito
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Ofertas e digitação, do parceiro à mesa de crédito.
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            onClick={handleExportCsv}
            className="inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold rounded-lg transition-all cursor-pointer border border-slate-200 dark:border-slate-700"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Exportar CSV</span>
          </button>

          <button
            onClick={() => setIsImportModalOpen(true)}
            className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-bold rounded-lg transition-all border bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800 cursor-pointer"
          >
            <FileSpreadsheet className="h-4 w-4" />
            <span>Importar em Lote</span>
          </button>

          <button
            id="btn-nova-simulacao"
            onClick={handleOpenNewModal}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg shadow-sm transition-all shrink-0 bg-blue-600 hover:bg-blue-700 text-white cursor-pointer"
            title="Iniciar uma simulação de crédito"
          >
            <Plus className="h-4 w-4" />
            <span>Nova simulação</span>
          </button>
          <button type="button" onClick={() => setActiveTab('PORT_REFIN_PLANILHAS')} className="inline-flex items-center gap-2 rounded-lg border border-blue-300 px-3 py-2 text-xs font-bold text-blue-600 dark:border-blue-800 dark:text-blue-300"><FileSpreadsheet size={16} />PORT + REFIN · Planilhas</button>
        </div>
      </div>

      <div className="module-process-strip"><span>01 · Solicitar simulação</span><ArrowRight size={13} /><span>02 · Comparar ofertas</span><ArrowRight size={13} /><span>03 · Acompanhar digitação</span></div>
      {presentation === 'cards' && simulationsLoadError && <div role="alert" className="rounded-xl border border-rose-300 bg-rose-50 p-4 text-sm text-rose-700 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-200">{simulationsLoadError}<button type="button" className="ml-4 underline" onClick={() => void loadData()}>Tentar novamente</button></div>}
      {/* Navigation Sub-Tabs */}
      <div className="module-mode-tabs" role="navigation" aria-label="Áreas de simulação">
        <button type="button" aria-current={premium && activeTab === 'PORT_REFIN_PLANILHAS' ? 'page' : undefined} onClick={() => setActiveTab('PORT_REFIN_PLANILHAS')} className={`px-4 py-2 text-sm font-semibold ${activeTab === 'PORT_REFIN_PLANILHAS' ? 'text-blue-600' : 'text-slate-500'}`}><FileSpreadsheet size={15} className="mr-2 inline" />PORT + REFIN · Planilhas</button>
        <button
          aria-current={premium && activeTab === 'VISAO_GERAL' ? 'page' : undefined}
          onClick={() => setActiveTab('VISAO_GERAL')}
          className={`flex items-center gap-2 px-4 py-2.5 border-b-2 transition-colors cursor-pointer ${
            activeTab === 'VISAO_GERAL'
              ? 'border-blue-600 text-blue-600 dark:text-blue-400 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <ListFilter className="h-4 w-4" />
          <span>Solicitações</span>
          <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-slate-100 dark:bg-slate-800 font-semibold">
            {simulations.length}
          </span>
        </button>

        <button
          aria-current={premium && activeTab === 'AGUARDANDO_DIGITACAO' ? 'page' : undefined}
          onClick={() => setActiveTab('AGUARDANDO_DIGITACAO')}
          className={`flex items-center gap-2 px-4 py-2.5 border-b-2 transition-colors cursor-pointer ${
            activeTab === 'AGUARDANDO_DIGITACAO'
              ? 'border-blue-600 text-blue-600 dark:text-blue-400 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <Clock className="h-4 w-4 text-amber-500" />
          <span>Fila de digitação</span>
          {metrics.enviadas > 0 && (
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 font-bold">
              {metrics.enviadas}
            </span>
          )}
        </button>

        <button
          aria-current={premium && activeTab === 'DASHBOARD_ANALISES' ? 'page' : undefined}
          onClick={() => setActiveTab('DASHBOARD_ANALISES')}
          className={`flex items-center gap-2 px-4 py-2.5 border-b-2 transition-colors cursor-pointer ${
            activeTab === 'DASHBOARD_ANALISES'
              ? 'border-blue-600 text-blue-600 dark:text-blue-400 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <BarChart2 className="h-4 w-4" />
          <span>Resultados e parceiros</span>
        </button>
      </div>

      {/* TAB 1: VISÃO GERAL & SOLICITAÇÕES */}
      {activeTab === 'PORT_REFIN_PLANILHAS' && <SpreadsheetPortRefinWorkspace premium={premium} partners={partners} onSuccess={() => { void loadData(); }} />}
      {activeTab === 'VISAO_GERAL' && (
        <div className="p2-simulation-requests space-y-6 animate-in fade-in">
          <RecordWorkspace premium={premium} filters={simulationFilters} summary={simulationSummary} count={filteredSimulations.length} mode={presentation} onMode={setPresentation}>
          {/* Bulk Actions Bar */}
          {selectedIds.length > 0 && (
            <div className="bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 rounded-xl p-3 flex items-center justify-between animate-in fade-in">
              <div className="flex items-center gap-2 text-xs font-semibold text-blue-900 dark:text-blue-200">
                <CheckCircle2 className="h-4 w-4 text-blue-600" />
                <span>
                  <strong>{selectedIds.length}</strong> solicitação(ões) selecionada(s)
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSelectedIds([])}
                  className="px-2.5 py-1 text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer"
                >
                  Desmarcar Todas
                </button>
                <button
                  onClick={() => {
                    setBulkDeleteError(null);
                    setBulkDeleteReason('');
                    setIsBulkDeleteModalOpen(true);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold rounded-lg shadow-xs cursor-pointer transition-all"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>Excluir Selecionados ({selectedIds.length})</span>
                </button>
              </div>
            </div>
          )}

          {presentation === 'cards' && <div className="operation-card-grid">{(isLoadingSimulations || simulationsLoadError ? [] : filteredSimulations).map(sim => {
            const partner = partners.find(item => item.id === sim.partnerId);
            return <OperationCard key={sim.id} eyebrow={operationLabel(sim.operationType || sim.productName || sim.simulationType)} title={formatCpf(sim.cpf)} status={sim.status} amountLabel="Valor da oferta" statusColor={sim.status === 'DIGITADA PELA MESA' ? '#22c99a' : sim.status === 'PERDIDA (NÃO DIGITADA)' ? '#fb7185' : '#9581ff'} amount={sim.selectedCondition?.amount ? `R$ ${sim.selectedCondition.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : undefined} fields={[{ label: 'Parceiro', value: `${sim.partnerCodeSnapshot || partner?.login || '—'} · ${partner?.fullName || ''}` }, { label: 'Solicitada em', value: new Date(sim.createdAt).toLocaleString('pt-BR') }, { label: 'ADE / Proposta', value: sim.matchedProposalNumber || 'Aguardando digitação' }, { label: 'Responsável', value: users.find(user => user.id === sim.createdById)?.name || '—' }]} onOpen={() => setDetailTarget(sim)} selected={selectedIds.includes(sim.id)} onSelect={canDeleteSimulationUI(activeUser, sim) ? () => handleToggleSelectRow(sim.id) : undefined} actions={<>{sim.matchedProposalId && onOpenProposalDetail && <button type="button" className="operation-card-action" onClick={() => onOpenProposalDetail(sim.matchedProposalId!)}>Ver ADE</button>}{canChangeStatusUI(activeUser, sim) && <button type="button" className="operation-card-action" onClick={() => { setStatusModalTarget(sim); setSelectedTargetStatus(sim.status === 'NÃO PASSÍVEL DE CONTRATAÇÃO' ? sim.status : 'DIGITADA PELA MESA'); setSelectedAdeNumber(sim.matchedProposalNumber || ''); setRejectionReason(sim.rejectionReason || ''); }}>Definir status</button>}</>} />;
          })}{!isLoadingSimulations && !simulationsLoadError && !filteredSimulations.length && <div className="record-empty">Nenhuma simulação encontrada. Ajuste os filtros ou inicie uma nova simulação.</div>}{isLoadingSimulations && <div className="record-empty">Carregando simulações...</div>}</div>}
          {presentation === 'list' && <>
          {/* Main Table */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-500 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-700">
                  <tr>
                    <th className="px-3 py-3 w-10 text-center">
                      <input
                        type="checkbox"
                        checked={
                          filteredSimulations.length > 0 &&
                          selectedIds.length === filteredSimulations.length
                        }
                        onChange={handleSelectAll}
                        className="rounded border-slate-300 dark:border-slate-700 text-blue-600 focus:ring-blue-500 cursor-pointer"
                      />
                    </th>
                    <th className="px-4 py-3">CPF DO CLIENTE</th>
                    <th className="px-4 py-3">TIPO</th>
                    <th className="px-4 py-3">PARCEIRO</th>
                    <th className="px-4 py-3">RESPONSÁVEL</th>
                    <th className="px-4 py-3">DATA/HORA SOLICITAÇÃO</th>
                    <th className="px-4 py-3">STATUS</th>
                    <th className="px-4 py-3">ADE / PROPOSTA</th>
                    <th className="px-4 py-3">DIGITADOR</th>
                    <th className="px-4 py-3">TEMPO ATÉ DIGITAÇÃO</th>
                    <th className="px-4 py-3 text-right">AÇÕES</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {simulationsLoadError ? (
                    <tr>
                      <td colSpan={11} className="px-4 py-12 text-center">
                        <ShieldAlert className="h-8 w-8 mx-auto mb-2 text-rose-500" />
                        <p className="font-medium text-sm text-slate-700 dark:text-slate-200">Não foi possível carregar as simulações</p>
                        <p className="text-xs mt-1 text-slate-500 dark:text-slate-400">{simulationsLoadError}</p>
                        <button type="button" onClick={() => void loadData()} className="mt-4 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700">
                          Tentar novamente
                        </button>
                      </td>
                    </tr>
                  ) : isLoadingSimulations ? (
                    <tr>
                      <td colSpan={11} className="px-4 py-12 text-center text-sm text-slate-500 dark:text-slate-400">Carregando solicitações...</td>
                    </tr>
                  ) : filteredSimulations.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="px-4 py-12 text-center text-slate-400 dark:text-slate-500">
                        <Calculator className="h-8 w-8 mx-auto mb-2 opacity-40" />
                        <p className="font-medium text-sm">Nenhuma solicitação de simulação encontrada.</p>
                        <p className="text-xs mt-1">Clique no botão "Nova simulação" para cadastrar.</p>
                      </td>
                    </tr>
                  ) : (
                    filteredSimulations.map(sim => {
                      const partner = partners.find(p => p.id === sim.partnerId);
                      const creator = users.find(u => u.id === sim.createdById);
                      const isCopied = copiedId === sim.id;
                      const isSelected = selectedIds.includes(sim.id);
                      const elapsed = getElapsedTimeInfo(sim.createdAt, sim.matchedAt, sim.status, sim.offerExpiresAt);

                      return (
                        <tr
                          key={sim.id}
                          className={`hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors ${
                            isSelected ? 'bg-blue-50/40 dark:bg-blue-950/20' : ''
                          }`}
                        >
                          {/* Checkbox */}
                          <td className="px-3 py-3 text-center">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              disabled={!canDeleteSimulationUI(activeUser, sim)}
                              onChange={() => handleToggleSelectRow(sim.id)}
                              title={
                                canDeleteSimulationUI(activeUser, sim)
                                  ? "Selecionar para exclusão em massa"
                                  : "Sem permissão para excluir esta simulação"
                              }
                              className="rounded border-slate-300 dark:border-slate-700 text-blue-600 focus:ring-blue-500 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                            />
                          </td>

                          {/* CPF */}
                          <td className="px-4 py-3 font-mono font-medium text-slate-900 dark:text-slate-100">
                            <div className="flex items-center gap-1.5">
                              <span>{formatCpf(sim.cpf)}</span>
                              <button
                                title="Copiar CPF"
                                onClick={() => copyToClipboard(sim.cpf, sim.id)}
                                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer p-0.5"
                              >
                                {isCopied ? (
                                  <Check className="h-3.5 w-3.5 text-emerald-500" />
                                ) : (
                                  <Copy className="h-3.5 w-3.5" />
                                )}
                              </button>
                            </div>
                            {(sim.convenioName || sim.productName) && (
                              <div className="flex flex-wrap items-center gap-1 mt-1 font-sans">
                                {sim.convenioName && (
                                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-xs bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                                    {sim.convenioName}
                                  </span>
                                )}
                                {sim.productName && (
                                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-xs bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                                    {sim.productName}
                                  </span>
                                )}
                              </div>
                            )}
                          </td>

                          {/* Tipo / Fluxo */}
                          <td className="px-4 py-3 whitespace-nowrap">
                            {['SPREADSHEET_INSS', 'DAYCOVAL_INSS'].includes(sim.simulationType || '') ? <span className="text-blue-600">Planilha · {sim.selectedCondition?.provider || 'Daycoval'}</span> : sim.simulationType === 'PARTNER_AUTO' ? <span className="text-violet-600">Portal · {sim.operationType}</span> : sim.simulationType === 'INSS_MULTI' ? <span className="text-violet-600">INSS</span> : sim.simulationType === 'FINANTO_INSS' ? (
                              <span className="inline-flex items-center rounded-full border border-violet-200 bg-violet-100 px-2 py-0.5 text-[10px] font-bold text-violet-800 dark:border-violet-800 dark:bg-violet-950 dark:text-violet-300">FINANTO INSS</span>
                            ) : sim.simulationType === 'HAPPY_INSS' ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                                HAPPY INSS
                              </span>
                            ) : sim.simulationType === 'HAPPY_CLT' ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                                HAPPY CLT
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                                MANUAL
                              </span>
                            )}
                          </td>

                          {/* Partner */}
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <span className="inline-flex items-center px-2 py-0.5 rounded-md font-mono text-[11px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200">
                                {sim.partnerCodeSnapshot || partner?.login || 'DESCONHECIDO'}
                              </span>
                              <span className="text-slate-500 dark:text-slate-400 truncate max-w-[140px]" title={partner?.fullName}>
                                {partner?.fullName}
                              </span>
                            </div>
                          </td>

                          {/* Responsável */}
                          <td className="px-4 py-3 text-slate-700 dark:text-slate-300">
                            <div className="flex items-center gap-1.5">
                              <User className="h-3.5 w-3.5 text-slate-400" />
                              <span>{creator?.name || sim.portalAccessName || 'Sistema'}</span>
                            </div>
                          </td>

                          {/* Data de Cadastro */}
                          <td className="px-4 py-3 text-slate-500 dark:text-slate-400 whitespace-nowrap">
                            {new Date(sim.createdAt).toLocaleString('pt-BR', {
                              day: '2-digit',
                              month: '2-digit',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </td>

                          {/* Status - Interactive Selector */}
                          <td className="px-4 py-3 whitespace-nowrap">
                            <div className="flex items-center gap-1.5">
                              <select
                                value={sim.status}
                                onChange={async (e) => {
                                  const val = e.target.value as SimulationStatus;
                                  if (val === 'DIGITADA PELA MESA' || val === 'NÃO PASSÍVEL DE CONTRATAÇÃO') {
                                    setStatusModalTarget(sim);
                                    setSelectedTargetStatus(val);
                                    setRejectionReason(val === 'NÃO PASSÍVEL DE CONTRATAÇÃO' ? 'Inviabilidade de crédito / sem margem ou política de crédito' : '');
                                    setSelectedAdeNumber(sim.matchedProposalNumber || '');
                                  } else {
                                    try {
                                      const res = await fetch(`/api/simulations/${sim.id}/status`, {
                                        method: 'PATCH',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ status: val }),
                                      });
                                      if (!res.ok) {
                                        const errData = await res.json().catch(() => ({}));
                                        throw new Error(errData.error || 'Erro ao atualizar status.');
                                      }
                                      loadData();
                                    } catch (err: any) {
                                      toastService.error('Erro ao atualizar status', err.message || 'Tente novamente.');
                                    }
                                  }
                                }}
                                className={`text-[11px] font-bold rounded-lg px-2 py-1 border cursor-pointer focus:outline-hidden transition-colors ${
                                  sim.status === 'SIMULAÇÃO ENVIADA'
                                    ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 border-blue-200 dark:border-blue-800'
                                    : sim.status === 'NÃO PASSÍVEL DE CONTRATAÇÃO'
                                    ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 border-rose-200 dark:border-rose-800'
                                    : sim.status === 'DIGITADA PELA MESA'
                                    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                                    : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-300 dark:border-slate-700'
                                }`}
                              >
                                <option value="SIMULAÇÃO ENVIADA" className="bg-white text-slate-900">
                                  Enviada (Pendente)
                                </option>
                                <option value="NÃO PASSÍVEL DE CONTRATAÇÃO" className="bg-white text-slate-900">
                                  Inviável (Recusada)
                                </option>
                                <option value="DIGITADA PELA MESA" className="bg-white text-slate-900">
                                  Digitada pela Mesa
                                </option>
                                <option value="PERDIDA (NÃO DIGITADA)" className="bg-white text-slate-900">
                                  Perdida (72h)
                                </option>
                              </select>
                            </div>
                          </td>

                          {/* ADE / Proposta */}
                          <td className="px-4 py-3 whitespace-nowrap">
                            {sim.matchedProposalNumber ? (
                              <button
                                onClick={() => {
                                  if (sim.matchedProposalId && onOpenProposalDetail) {
                                    onOpenProposalDetail(sim.matchedProposalId);
                                  }
                                }}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-mono text-[11px] font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 hover:underline cursor-pointer"
                              >
                                <FileCheck2 className="h-3 w-3" />
                                {sim.matchedProposalNumber}
                                {onOpenProposalDetail && <ExternalLink className="h-2.5 w-2.5 opacity-60" />}
                              </button>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>

                          {/* Digitador */}
                          <td className="px-4 py-3 text-slate-700 dark:text-slate-300 whitespace-nowrap">
                            {sim.matchedDigitizerName ? (
                              <span className="font-medium text-emerald-700 dark:text-emerald-400">
                                {sim.matchedDigitizerName}
                              </span>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>

                          {/* Tempo até digitação / Tempo aguardando */}
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold border ${elapsed.badgeClass}`}
                            >
                              <Clock className="h-3 w-3" />
                              {elapsed.text}
                            </span>
                          </td>

                          {/* Ações */}
                          <td className="px-4 py-3 text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-1.5">
                              {/* Ver Detalhes */}
                              <button
                                title="Ver Detalhes e Histórico"
                                onClick={() => setDetailTarget(sim)}
                                className="p-1 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors cursor-pointer"
                              >
                                <Info className="h-3.5 w-3.5" />
                              </button>

                              {canChangeStatusUI(activeUser, sim) && (
                                <button
                                  onClick={() => {
                                    setStatusModalTarget(sim);
                                    setSelectedTargetStatus(
                                      sim.status === 'DIGITADA PELA MESA' || sim.status === 'NÃO PASSÍVEL DE CONTRATAÇÃO'
                                        ? sim.status
                                        : 'DIGITADA PELA MESA'
                                    );
                                    setSelectedAdeNumber(sim.matchedProposalNumber || '');
                                    setRejectionReason(sim.rejectionReason || '');
                                  }}
                                  className="px-2.5 py-1 text-[11px] font-semibold text-blue-700 hover:text-blue-800 dark:text-blue-300 bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/60 dark:hover:bg-blue-900/60 rounded-md transition-colors cursor-pointer border border-blue-200 dark:border-blue-800 flex items-center gap-1"
                                >
                                  <span>Definir Status</span>
                                </button>
                              )}

                              {canDeleteSimulationUI(activeUser, sim) && (
                                <button
                                  title="Excluir Solicitação"
                                  onClick={() => {
                                    setDeleteModalTarget(sim);
                                    setDeleteReason('');
                                    setDeleteError(null);
                                  }}
                                  className="p-1 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-md transition-colors cursor-pointer"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
          </>}
          </RecordWorkspace>
        </div>
      )}

      {/* TAB 2: FILA DA MESA (AGUARDANDO DIGITAÇÃO) */}
      {activeTab === 'AGUARDANDO_DIGITACAO' && (
        <div className="p2-simulation-queue space-y-4 animate-in fade-in">
          <div className="p2-queue-context p-4 rounded-xl bg-amber-50/80 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 text-amber-900 dark:text-amber-200 text-xs flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Clock className="h-5 w-5 text-amber-600 shrink-0" />
              <div>
                <h3 className="font-bold text-sm">Fila de Acompanhamento da Mesa</h3>
                <p className="text-[11px] text-amber-800 dark:text-amber-300">
                  Exibindo exclusivamente simulações pendentes (SIMULAÇÃO ENVIADA), ordenadas pela mais antiga primeiro.
                  Ofertas do portal têm prazo de <strong>5 dias úteis sem digitação</strong>; os registros manuais mantêm o prazo de 72 horas.
                </p>
              </div>
            </div>
            <span className="px-3 py-1 bg-amber-600 text-white font-bold rounded-lg text-xs shrink-0">
              {pendingQueueSimulations.length} pendente(s)
            </span>
          </div>

          <div className="record-results-toolbar"><span>{pendingQueueSimulations.length} operações na fila · mais antigas primeiro</span><div className="record-view-switch"><button type="button" aria-pressed={presentation === 'cards'} onClick={() => setPresentation('cards')}>Cartões</button><button type="button" aria-pressed={presentation === 'list'} onClick={() => setPresentation('list')}>Lista</button></div></div>
          {presentation === 'cards' && <div className="operation-card-grid">{pendingQueueSimulations.map((sim, index) => {
            const partner = partners.find(item => item.id === sim.partnerId), elapsed = getElapsedTimeInfo(sim.createdAt, sim.matchedAt, sim.status, sim.offerExpiresAt);
            return <OperationCard key={sim.id} title={formatCpf(sim.cpf)} eyebrow={`POSIÇÃO ${index + 1} · ${operationLabel(sim.operationType || sim.simulationType)}`} status="Aguardando digitação" amountLabel="Valor da oferta" statusColor="#ffbc52" amount={sim.selectedCondition?.amount ? `R$ ${sim.selectedCondition.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : undefined} fields={[{ label: 'Parceiro', value: `${sim.partnerCodeSnapshot || partner?.login || '—'} · ${partner?.fullName || ''}` }, { label: 'Solicitada em', value: new Date(sim.createdAt).toLocaleString('pt-BR') }, { label: 'Tempo na fila', value: elapsed.text }, { label: 'Próximo passo', value: 'Digitação pela mesa' }]} onOpen={() => setDetailTarget(sim)} actions={canChangeStatusUI(activeUser, sim) ? <button type="button" className="operation-card-action" onClick={() => { setStatusModalTarget(sim); setSelectedTargetStatus('DIGITADA PELA MESA'); setSelectedAdeNumber(sim.matchedProposalNumber || ''); setRejectionReason(''); }}>Definir status</button> : undefined} />;
          })}{!pendingQueueSimulations.length && <div className="record-empty">Fila zerada. Nenhuma simulação aguardando digitação.</div>}</div>}
          {presentation === 'list' && <>
          <div className="p2-queue-table bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-xs">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-500 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-700">
                <tr>
                  <th className="px-4 py-3">POSIÇÃO</th>
                  <th className="px-4 py-3">CPF DO CLIENTE</th>
                  <th className="px-4 py-3">PARCEIRO</th>
                  <th className="px-4 py-3">RESPONSÁVEL</th>
                  <th className="px-4 py-3">DATA/HORA SOLICITAÇÃO</th>
                  <th className="px-4 py-3">TEMPO DECORRIDO</th>
                  <th className="px-4 py-3">PRAZO RESTANTE</th>
                  <th className="px-4 py-3 text-right">AÇÕES</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {pendingQueueSimulations.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-12 text-center text-slate-400">
                      <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-emerald-500 opacity-60" />
                      <p className="font-semibold text-sm text-slate-700 dark:text-slate-300">Fila zerada!</p>
                      <p className="text-xs">Não existem solicitações de simulação aguardando digitação no momento.</p>
                    </td>
                  </tr>
                ) : (
                  pendingQueueSimulations.map((sim, index) => {
                    const partner = partners.find(p => p.id === sim.partnerId);
                    const creator = users.find(u => u.id === sim.createdById);
                    const elapsed = getElapsedTimeInfo(sim.createdAt, sim.matchedAt, sim.status, sim.offerExpiresAt);

                    return (
                      <tr key={sim.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                        <td className="px-4 py-3 font-bold text-slate-400">#{index + 1}</td>
                        <td className="px-4 py-3 font-mono font-bold text-slate-900 dark:text-slate-100">
                          {formatCpf(sim.cpf)}
                        </td>
                        <td className="px-4 py-3">
                          <span className="font-mono font-bold bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md mr-1.5">
                            {partner?.login}
                          </span>
                          <span className="text-slate-500">{partner?.fullName}</span>
                        </td>
                        <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{creator?.name}</td>
                        <td className="px-4 py-3 text-slate-500">
                          {new Date(sim.createdAt).toLocaleString('pt-BR')}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold border ${elapsed.badgeClass}`}
                          >
                            <Clock className="h-3.5 w-3.5 shrink-0" />
                            {elapsed.text}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold border ${elapsed.badgeClass}`}
                          >
                            <Hourglass className="h-3.5 w-3.5 shrink-0" />
                            {elapsed.remainingText}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => {
                              setStatusModalTarget(sim);
                              setRejectionReason('');
                            }}
                            className="px-2.5 py-1 text-xs font-semibold text-rose-600 hover:text-rose-700 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-md border border-rose-200 dark:border-rose-900/60 cursor-pointer"
                          >
                            Inviabilizar
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          </>}
        </div>
      )}

      {/* TAB 3: DASHBOARD & ANÁLISES */}
      {activeTab === 'DASHBOARD_ANALISES' && (
        <div className="p2-simulation-analytics space-y-6 animate-in fade-in">
          <PartnerSimulationMonthlyReport simulations={simulations} partners={partners} />
          {/* Top Summary Banner */}
          <div className="p2-simulation-funnel bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 mb-3 flex items-center gap-2">
              <BarChart2 className="h-4 w-4 text-blue-600" />
              Funil de Conversão & Tempo Médio
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 rounded-xl bg-blue-50/50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/40">
                <div className="text-xs text-slate-500">Total de Simulações Enviadas</div>
                <div className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-1">{metrics.total}</div>
                <div className="text-[11px] text-blue-600 mt-1">100% das solicitações registradas</div>
              </div>

              <div className="p-4 rounded-xl bg-emerald-50/50 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-900/40">
                <div className="text-xs text-slate-500">Digitadas pela Mesa (Identificadas)</div>
                <div className="text-2xl font-bold text-emerald-600 mt-1">{metrics.digitadas}</div>
                <div className="text-[11px] text-emerald-600 mt-1">{metrics.taxaConversao}% taxa de conversão</div>
              </div>

              <div className="p-4 rounded-xl bg-indigo-50/50 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900/40">
                <div className="text-xs text-slate-500">Tempo Médio até Digitação</div>
                <div className="text-2xl font-bold text-indigo-600 mt-1">{averageMatchTime}</div>
                <div className="text-[11px] text-indigo-600 mt-1">Tempo entre solicitação e ADE digitada</div>
              </div>
            </div>
          </div>

          {/* Análise por Parceiro */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 mb-4 flex items-center gap-2">
              <Building2 className="h-4 w-4 text-blue-600" />
              Análise de Simulações por Parceiro
            </h3>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-500 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-700">
                  <tr>
                    <th className="px-4 py-3">PARCEIRO</th>
                    <th className="px-4 py-3 text-center">CADASTRADAS</th>
                    <th className="px-4 py-3 text-center">AGUARDANDO</th>
                    <th className="px-4 py-3 text-center text-emerald-600">DIGITADAS</th>
                    <th className="px-4 py-3 text-center text-rose-600">NÃO PASSÍVEIS</th>
                    <th className="px-4 py-3 text-center text-slate-600 dark:text-slate-400">PERDIDAS</th>
                    <th className="px-4 py-3 text-right">TAXA CONVERSÃO (%)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {partnerStats.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-6 text-center text-slate-400">
                        Nenhum dado por parceiro registrado.
                      </td>
                    </tr>
                  ) : (
                    partnerStats.map(stat => {
                      const conv = stat.total > 0 ? ((stat.digitadas / stat.total) * 100).toFixed(1) : '0.0';
                      return (
                        <tr key={stat.partner.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                          <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">
                            <span className="font-mono font-bold bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md mr-2">
                              {stat.partner.login}
                            </span>
                            <span>{stat.partner.fullName}</span>
                          </td>
                          <td className="px-4 py-3 text-center font-bold">{stat.total}</td>
                          <td className="px-4 py-3 text-center text-amber-600 font-medium">{stat.enviadas}</td>
                          <td className="px-4 py-3 text-center text-emerald-600 font-bold">{stat.digitadas}</td>
                          <td className="px-4 py-3 text-center text-rose-600 font-medium">{stat.naoPassivel}</td>
                          <td className="px-4 py-3 text-center text-slate-600 font-semibold">{stat.perdidas}</td>
                          <td className="px-4 py-3 text-right font-bold text-indigo-600">{conv}%</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Análise por Responsável */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 mb-4 flex items-center gap-2">
              <Users className="h-4 w-4 text-blue-600" />
              Análise de Simulações por Responsável (Usuário Criador)
            </h3>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-500 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-700">
                  <tr>
                    <th className="px-4 py-3">RESPONSÁVEL</th>
                    <th className="px-4 py-3">PERFIL / ROLE</th>
                    <th className="px-4 py-3 text-center">CADASTRADAS</th>
                    <th className="px-4 py-3 text-center text-emerald-600">DIGITADAS</th>
                    <th className="px-4 py-3 text-center text-rose-600">NÃO PASSÍVEIS</th>
                    <th className="px-4 py-3 text-center text-slate-600 dark:text-slate-400">PERDIDAS</th>
                    <th className="px-4 py-3 text-right">TAXA CONVERSÃO (%)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {userStats.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-6 text-center text-slate-400">
                        Nenhum dado por usuário registrado.
                      </td>
                    </tr>
                  ) : (
                    userStats.map(stat => {
                      const conv = stat.total > 0 ? ((stat.digitadas / stat.total) * 100).toFixed(1) : '0.0';
                      return (
                        <tr key={stat.user.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                          <td className="px-4 py-3 font-semibold text-slate-900 dark:text-slate-100">
                            {stat.user.name}
                          </td>
                          <td className="px-4 py-3 text-slate-500">{stat.user.role}</td>
                          <td className="px-4 py-3 text-center font-bold">{stat.total}</td>
                          <td className="px-4 py-3 text-center text-emerald-600 font-bold">{stat.digitadas}</td>
                          <td className="px-4 py-3 text-center text-rose-600 font-medium">{stat.naoPassivel}</td>
                          <td className="px-4 py-3 text-center text-slate-600 font-semibold">{stat.perdidas}</td>
                          <td className="px-4 py-3 text-right font-bold text-indigo-600">{conv}%</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Nova Simulação (com Combobox de Parceiro e Alerta de Duplicidade) */}
      {isNewModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs animate-in fade-in">
          <div className="relative w-full max-w-lg rounded-xl bg-white dark:bg-slate-900 shadow-2xl border border-slate-200 dark:border-slate-800 p-6">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="h-8 w-8 rounded-lg bg-blue-600 text-white flex items-center justify-center">
                  <Calculator className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                    Nova Solicitação de Simulação
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Informe o CPF do cliente e pesquise o parceiro solicitante
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsNewModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
              >
                <XCircle className="h-5 w-5" />
              </button>
            </div>

            {/* AVISO DE DUPLICIDADE (SE HOUVER) */}
            {duplicateWarning ? (
              <div className="mt-5 space-y-4">
                <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200 text-xs space-y-2">
                  <div className="flex items-center gap-2 font-bold text-sm text-amber-800 dark:text-amber-300">
                    <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" />
                    Solicitação Pendente em Duplicidade Detectada
                  </div>
                  <p>
                    Já existe uma solicitação de simulação para este CPF e parceiro aguardando digitação.
                  </p>
                  <div className="p-2.5 rounded-lg bg-white/80 dark:bg-slate-900/80 border border-amber-200/60 font-mono text-[11px] space-y-1">
                    <div>CPF: <strong>{formatCpf(duplicateWarning.cleanCpf)}</strong></div>
                    <div>Parceiro: <strong>{selectedPartner?.login} — {selectedPartner?.fullName}</strong></div>
                    <div>Cadastrado em: <strong>{new Date(duplicateWarning.pendingSim.createdAt).toLocaleString('pt-BR')}</strong></div>
                  </div>
                  <p className="text-[11px] text-amber-700 dark:text-amber-400">
                    Deseja cancelar ou continuar registrando uma nova solicitação mesmo assim?
                  </p>
                </div>

                <div className="flex items-center justify-end gap-2.5 pt-2">
                  <button
                    type="button"
                    onClick={() => setDuplicateWarning(null)}
                    className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold rounded-lg hover:bg-slate-200 cursor-pointer"
                  >
                    CANCELAR
                  </button>
                  <button
                    type="button"
                    onClick={() => executeCreateSimulation(duplicateWarning.cleanCpf, duplicateWarning.partnerId, initialStatus, initialRejectionReason)}
                    disabled={isCreatingSimulation}
                    className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold rounded-lg shadow-sm cursor-pointer transition-all"
                  >
                    {isCreatingSimulation ? 'REGISTRANDO...' : 'CONTINUAR'}
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmitSimulation} className="mt-5 space-y-4">
                {modalError && (
                  <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    <span>{modalError}</span>
                  </div>
                )}

                {/* 1. CPF DO CLIENTE */}
                <div>
                  <label className="block text-xs font-bold text-slate-800 dark:text-slate-200 mb-1">
                    CPF DO CLIENTE <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    autoFocus
                    value={newCpf}
                    onChange={handleCpfChange}
                    placeholder="000.000.000-00"
                    className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-mono text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="mt-1 text-[11px] text-slate-400">
                    O CPF é normalizado e validado automaticamente.
                  </p>
                </div>

                {/* 2. PARCEIRO — AUTOCOMPLETE COMBOBOX */}
                <div ref={comboboxRef} className="relative">
                  <label className="block text-xs font-bold text-slate-800 dark:text-slate-200 mb-1">
                    PARCEIRO <span className="text-rose-500">*</span>
                  </label>

                  {selectedPartner ? (
                    <div className="flex items-center justify-between p-2.5 bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-800 rounded-lg">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-xs bg-blue-600 text-white px-2 py-0.5 rounded-md">
                          {selectedPartner.login}
                        </span>
                        <span className="text-xs font-medium text-slate-900 dark:text-slate-100">
                          {selectedPartner.fullName}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedPartner(null);
                          setPartnerQuery('');
                          setIsPartnerDropdownOpen(true);
                        }}
                        className="text-slate-400 hover:text-rose-600 p-1 cursor-pointer"
                        title="Limpar seleção de parceiro"
                      >
                        <XCircle className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <div>
                      <div className="relative">
                        <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                        <input
                          type="text"
                          value={partnerQuery}
                          onChange={e => {
                            setPartnerQuery(e.target.value);
                            setIsPartnerDropdownOpen(true);
                            setModalError(null);
                          }}
                          onFocus={() => setIsPartnerDropdownOpen(true)}
                          placeholder="Digite o código, login ou nome do parceiro..."
                          className="w-full pl-9 pr-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                        />
                      </div>

                      {isPartnerDropdownOpen && (
                        <div className="absolute z-50 left-0 right-0 mt-1 max-h-56 overflow-y-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl divide-y divide-slate-100 dark:divide-slate-800">
                          {filteredPartnerOptions.length === 0 ? (
                            <div className="p-3 text-xs text-slate-400 text-center">
                              Nenhum parceiro encontrado.
                            </div>
                          ) : (
                            filteredPartnerOptions.map(p => (
                              <button
                                type="button"
                                key={p.id}
                                onClick={() => {
                                  setSelectedPartner(p);
                                  setIsPartnerDropdownOpen(false);
                                  setModalError(null);
                                }}
                                className="w-full text-left p-2.5 hover:bg-blue-50 dark:hover:bg-slate-800 flex items-center justify-between cursor-pointer transition-colors"
                              >
                                <div className="flex items-center gap-2">
                                  <span className="font-mono font-bold text-[11px] bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded-xs text-slate-800 dark:text-slate-200">
                                    {p.login}
                                  </span>
                                  <span className="text-xs text-slate-800 dark:text-slate-200 font-medium">
                                    {p.fullName}
                                  </span>
                                </div>
                                <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
                              </button>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  )}
                  <p className="mt-1 text-[11px] text-slate-400">
                    Pesquise por código (ex: 16740), login (ex: KAUAI@16740) ou nome do parceiro.
                  </p>
                </div>

                {/* CONVÊNIO E PRODUTO */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-800 dark:text-slate-200 mb-1">
                      CONVÊNIO (OPCIONAL)
                    </label>
                    <select
                      value={selectedConvenioId}
                      onChange={e => {
                        const newConv = e.target.value;
                        setSelectedConvenioId(newConv);
                        if (newConv) {
                          const compat = StorageService.getProductsForConvenio(newConv).filter(p => p.active);
                          if (compat.length > 0 && !compat.some(p => p.id === selectedProductId)) {
                            setSelectedProductId(compat[0].id);
                          }
                        }
                      }}
                      className="w-full text-xs font-medium bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg p-2.5 text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                    >
                      <option value="">(Todos / Geral)</option>
                      {conveniosList.map(c => (
                        <option key={c.id} value={c.id}>
                          {c.name} {c.code ? `(${c.code})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-800 dark:text-slate-200 mb-1">
                      PRODUTO (OPCIONAL)
                    </label>
                    <select
                      value={selectedProductId}
                      onChange={e => setSelectedProductId(e.target.value)}
                      className="w-full text-xs font-medium bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg p-2.5 text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                    >
                      <option value="">(Nenhum selecionado)</option>
                      {(selectedConvenioId
                        ? StorageService.getProductsForConvenio(selectedConvenioId).filter(p => p.active)
                        : productsList
                      ).map(p => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* 3. STATUS DA SIMULAÇÃO */}
                <div>
                  <label className="block text-xs font-bold text-slate-800 dark:text-slate-200 mb-1">
                    STATUS DA SIMULAÇÃO <span className="text-rose-500">*</span>
                  </label>
                  {canSetInitialStatus ? <div className="grid grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      onClick={() => setInitialStatus('SIMULAÇÃO ENVIADA')}
                      className={`p-2.5 rounded-lg border text-left flex items-center gap-2 cursor-pointer transition-all ${
                        initialStatus === 'SIMULAÇÃO ENVIADA'
                          ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200 font-bold shadow-xs'
                          : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-100'
                      }`}
                    >
                      <div className={`h-3 w-3 rounded-full ${initialStatus === 'SIMULAÇÃO ENVIADA' ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                      <div>
                        <div className="text-xs font-bold">SIMULAÇÃO ENVIADA</div>
                        <div className="text-[10px] text-slate-500 dark:text-slate-400 font-normal">Aguardando digitação pela mesa</div>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setInitialStatus('NÃO PASSÍVEL DE CONTRATAÇÃO')}
                      className={`p-2.5 rounded-lg border text-left flex items-center gap-2 cursor-pointer transition-all ${
                        initialStatus === 'NÃO PASSÍVEL DE CONTRATAÇÃO'
                          ? 'border-rose-500 bg-rose-50 dark:bg-rose-950/40 text-rose-900 dark:text-rose-200 font-bold shadow-xs'
                          : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-100'
                      }`}
                    >
                      <div className={`h-3 w-3 rounded-full ${initialStatus === 'NÃO PASSÍVEL DE CONTRATAÇÃO' ? 'bg-rose-500' : 'bg-slate-300'}`} />
                      <div>
                        <div className="text-xs font-bold">INVIÁVEL / NÃO PASSÍVEL</div>
                        <div className="text-[10px] text-slate-500 dark:text-slate-400 font-normal">Sem margem / política reprovada</div>
                      </div>
                    </button>
                  </div> : <p className="text-xs text-slate-500 dark:text-slate-400">SIMULAÇÃO ENVIADA — aguardando digitação pela mesa</p>}
                </div>

                {/* MOTIVO DE INVIABILIDADE (Se selecionado) */}
                {canSetInitialStatus && initialStatus === 'NÃO PASSÍVEL DE CONTRATAÇÃO' && (
                  <div className="animate-in fade-in slide-in-from-top-1 duration-150">
                    <label className="block text-xs font-bold text-slate-800 dark:text-slate-200 mb-1">
                      MOTIVO DA INVIABILIDADE (OPCIONAL)
                    </label>
                    <input
                      type="text"
                      value={initialRejectionReason}
                      onChange={e => setInitialRejectionReason(e.target.value)}
                      placeholder="Ex: Cliente sem margem disponível / Idade fora da política"
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-rose-500"
                    />
                  </div>
                )}

                <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2.5">
                  <button
                    type="button"
                    onClick={() => setIsNewModalOpen(false)}
                    className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isCreatingSimulation}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed text-white text-xs font-semibold rounded-lg shadow-sm transition-all cursor-pointer"
                  >
                    {isCreatingSimulation ? 'Registrando...' : 'Registrar Simulação'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Modal: Seletor de Status da Simulação */}
      {statusModalTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs animate-in fade-in">
          <div className="relative w-full max-w-md rounded-xl bg-white dark:bg-slate-900 shadow-2xl border border-slate-200 dark:border-slate-800 p-6">
            <div className="flex items-center gap-3 text-blue-600 mb-3">
              <div className="h-10 w-10 rounded-full bg-blue-100 dark:bg-blue-950/60 flex items-center justify-center">
                <Calculator className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  Definir Status da Simulação
                </h3>
                <p className="text-xs text-slate-500">
                  CPF: <strong className="font-mono">{formatCpf(statusModalTarget.cpf)}</strong>
                </p>
              </div>
            </div>

            <div className="space-y-4 my-4">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1.5 uppercase tracking-wider">
                  Selecione o Novo Status
                </label>
                <div className="grid grid-cols-1 gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedTargetStatus('DIGITADA PELA MESA')}
                    className={`p-3 rounded-lg border text-left flex items-start justify-between transition-all cursor-pointer ${
                      selectedTargetStatus === 'DIGITADA PELA MESA'
                        ? 'border-emerald-500 bg-emerald-50/60 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200 ring-2 ring-emerald-500/20'
                        : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <div>
                      <div className="font-bold text-xs flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400">
                        <CheckCircle2 className="h-4 w-4" />
                        DIGITADA PELA MESA (Enviada com Sucesso)
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                        Proposta gerada e vinculada à simulação.
                      </div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSelectedTargetStatus('NÃO PASSÍVEL DE CONTRATAÇÃO')}
                    className={`p-3 rounded-lg border text-left flex items-start justify-between transition-all cursor-pointer ${
                      selectedTargetStatus === 'NÃO PASSÍVEL DE CONTRATAÇÃO'
                        ? 'border-rose-500 bg-rose-50/60 dark:bg-rose-950/40 text-rose-900 dark:text-rose-200 ring-2 ring-rose-500/20'
                        : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <div>
                      <div className="font-bold text-xs flex items-center gap-1.5 text-rose-700 dark:text-rose-400">
                        <XCircle className="h-4 w-4" />
                        NÃO PASSÍVEL DE CONTRATAÇÃO (Inviável)
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                        Sem margem, reprovado em política ou inviável.
                      </div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSelectedTargetStatus('SIMULAÇÃO ENVIADA')}
                    className={`p-3 rounded-lg border text-left flex items-start justify-between transition-all cursor-pointer ${
                      selectedTargetStatus === 'SIMULAÇÃO ENVIADA'
                        ? 'border-blue-500 bg-blue-50/60 dark:bg-blue-950/40 text-blue-900 dark:text-blue-200 ring-2 ring-blue-500/20'
                        : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <div>
                      <div className="font-bold text-xs flex items-center gap-1.5 text-blue-700 dark:text-blue-400">
                        <Clock className="h-4 w-4" />
                        SIMULAÇÃO ENVIADA (Pendente)
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                        Aguardando retorno da mesa de digitação.
                      </div>
                    </div>
                  </button>
                </div>
              </div>

              {selectedTargetStatus === 'DIGITADA PELA MESA' && (
                <div className="p-3 bg-emerald-50/50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60 rounded-lg space-y-2">
                  <label className="block text-[11px] font-bold text-emerald-800 dark:text-emerald-300">
                    Número da ADE / Proposta Vinculada (Opcional)
                  </label>
                  <input
                    type="text"
                    value={selectedAdeNumber}
                    onChange={e => setSelectedAdeNumber(e.target.value)}
                    placeholder="Ex: 833085808"
                    className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-emerald-300 dark:border-emerald-700 rounded-lg text-xs font-mono font-bold text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-emerald-500"
                  />
                  <p className="text-[10px] text-emerald-700 dark:text-emerald-400">
                    Se a ADE corresponder a uma proposta deste cliente, o sistema fará o vínculo automaticamente.
                  </p>
                </div>
              )}

              {selectedTargetStatus === 'NÃO PASSÍVEL DE CONTRATAÇÃO' && (
                <div className="p-3 bg-rose-50/50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800/60 rounded-lg space-y-2">
                  <label className="block text-[11px] font-bold text-rose-800 dark:text-rose-300">
                    Motivo da Inviabilidade
                  </label>
                  <textarea
                    value={rejectionReason}
                    onChange={e => setRejectionReason(e.target.value)}
                    placeholder="Ex: Cliente sem margem consignável disponível no momento..."
                    rows={2}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-rose-300 dark:border-rose-700 rounded-lg text-xs text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-rose-500"
                  />
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setStatusModalTarget(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmStatusChange}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg shadow-sm transition-all cursor-pointer"
              >
                Salvar Status
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Excluir Solicitação de Simulação (Individual) */}
      {deleteModalTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs animate-in fade-in">
          <div className="relative w-full max-w-md rounded-xl bg-white dark:bg-slate-900 shadow-2xl border border-slate-200 dark:border-slate-800 p-6">
            <div className="flex items-center gap-3 text-rose-600 mb-3">
              <div className="h-10 w-10 rounded-full bg-rose-100 dark:bg-rose-950/60 flex items-center justify-center">
                <ShieldAlert className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  Excluir Solicitação
                </h3>
                <p className="text-xs text-slate-500">
                  Ação irreversível com registro em auditoria
                </p>
              </div>
            </div>

            {deleteError && (
              <div className="mb-3 p-3 rounded-lg bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>{deleteError}</span>
              </div>
            )}

            <p className="text-xs text-slate-600 dark:text-slate-400 mt-2">
              Tem certeza que deseja excluir permanentemente a solicitação de simulação do CPF{' '}
              <strong>{formatCpf(deleteModalTarget.cpf)}</strong>?
            </p>

            <div className="mt-4">
              <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Motivo da Exclusão (Opcional)
              </label>
              <textarea
                value={deleteReason}
                onChange={e => setDeleteReason(e.target.value)}
                placeholder="Ex: Cadastro em duplicidade / solicitação incorreta..."
                rows={2}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-rose-500"
              />
            </div>

            <div className="mt-5 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setDeleteModalTarget(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold rounded-lg shadow-sm transition-all cursor-pointer"
              >
                Confirmar Exclusão
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Exclusão em Massa (Bulk Delete) */}
      {isBulkDeleteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs animate-in fade-in">
          <div className="relative w-full max-w-md rounded-xl bg-white dark:bg-slate-900 shadow-2xl border border-slate-200 dark:border-slate-800 p-6">
            <div className="flex items-center gap-3 text-rose-600 mb-3">
              <div className="h-10 w-10 rounded-full bg-rose-100 dark:bg-rose-950/60 flex items-center justify-center">
                <ShieldAlert className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  Exclusão em Massa ({selectedIds.length})
                </h3>
                <p className="text-xs text-slate-500">
                  Remoção permanente de múltiplas solicitações
                </p>
              </div>
            </div>

            {bulkDeleteError && (
              <div className="mb-3 p-3 rounded-lg bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>{bulkDeleteError}</span>
              </div>
            )}

            <p className="text-xs text-slate-600 dark:text-slate-400 mt-2">
              Confirma a exclusão em massa de <strong>{selectedIds.length}</strong> solicitação(ões) de simulação selecionada(s)?
            </p>

            <div className="mt-4">
              <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Motivo da Exclusão em Massa (Opcional)
              </label>
              <textarea
                value={bulkDeleteReason}
                onChange={e => setBulkDeleteReason(e.target.value)}
                placeholder="Ex: Limpeza de solicitações de simulação antigas / duplicadas..."
                rows={2}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-rose-500"
              />
            </div>

            <div className="mt-5 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setIsBulkDeleteModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmBulkDelete}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold rounded-lg shadow-sm transition-all cursor-pointer"
              >
                Confirmar Exclusão em Massa
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Detalhes da Solicitação */}
      {detailTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-2 sm:p-4 backdrop-blur-xs animate-in fade-in">
          <div role="dialog" aria-modal="true" aria-labelledby="simulation-detail-title" className="relative flex w-full max-w-4xl max-h-[calc(100dvh-2rem)] flex-col overflow-hidden rounded-xl bg-white dark:bg-slate-900 shadow-2xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5">
            <div className="flex shrink-0 items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="h-8 w-8 rounded-lg bg-blue-600 text-white flex items-center justify-center">
                  <Info className="h-4 w-4" />
                </div>
                <div>
                  <h3 id="simulation-detail-title" className="text-base font-bold text-slate-900 dark:text-slate-100">
                    Detalhes da Simulação
                  </h3>
                  <p className="break-all text-xs text-slate-500 font-mono">ID: {detailTarget.id}</p>
                </div>
              </div>
              <button
                onClick={() => setDetailTarget(null)}
                aria-label="Fechar detalhes da simulação"
                className="shrink-0 p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
              >
                <XCircle className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-3 min-h-0 overflow-y-auto overscroll-contain space-y-3 pr-1 text-xs [overflow-wrap:anywhere]">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-3 bg-slate-50 dark:bg-slate-800/60 rounded-lg border border-slate-200 dark:border-slate-700">
                <div>
                  <span className="text-slate-400 block text-[10px]">CPF DO CLIENTE</span>
                  <span className="font-mono font-bold text-sm">{formatCpf(detailTarget.cpf)}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">TIPO / FLUXO</span>
                  <span className="font-bold text-xs">
                    {['SPREADSHEET_INSS', 'DAYCOVAL_INSS'].includes(detailTarget.simulationType || '') ? <span className="text-blue-600">Planilha · {detailTarget.selectedCondition?.provider || 'Daycoval'}</span> : detailTarget.simulationType === 'PARTNER_AUTO' ? <span className="text-violet-600">Portal do parceiro</span> : detailTarget.simulationType === 'INSS_MULTI' ? <span className="text-violet-600">INSS · {({ NEW: 'Novo', PORT: 'Portabilidade', REFIN: 'Refinanciamento', PORT_REFIN: 'Portabilidade + Refinanciamento' } as Record<string, string>)[detailTarget.operationType || ''] || 'Simulação'}</span> : detailTarget.simulationType === 'FINANTO_INSS' ? (
                      <span className="text-violet-600 dark:text-violet-400">FINANTO INSS · Contrato novo</span>
                    ) : detailTarget.simulationType === 'HAPPY_INSS' ? (
                      <span className="text-emerald-600 dark:text-emerald-400">Happy INSS</span>
                    ) : detailTarget.simulationType === 'HAPPY_CLT' ? (
                      <span className="text-indigo-600 dark:text-indigo-400">Happy CLT</span>
                    ) : (
                      <span className="text-slate-600 dark:text-slate-400">Manual</span>
                    )}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">PARCEIRO</span>
                  <span className="font-mono font-bold text-xs">
                    {detailTarget.partnerCodeSnapshot || partners.find(p => p.id === detailTarget.partnerId)?.login}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">RESPONSÁVEL</span>
                  <span className="font-semibold">{detailTarget.portalAccessName || users.find(u => u.id === detailTarget.createdById)?.name || 'Não informado'}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">DATA SOLICITAÇÃO</span>
                  <span>{new Date(detailTarget.createdAt).toLocaleString('pt-BR')}</span>
                </div>
                {detailTarget.operationType && (
                  <div>
                    <span className="text-slate-400 block text-[10px]">OPERAÇÃO</span>
                    <span className="font-semibold">{detailTarget.operationType}</span>
                  </div>
                )}
              </div>

              {/* Happy Metadata if applicable */}
              {(detailTarget.happyClientId || detailTarget.happySimulationId || detailTarget.happyBeneficioNumero || detailTarget.happyJourneyStatus) && (
                <div className="p-3 bg-indigo-50/50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800/60 rounded-lg space-y-2">
                  <h5 className="font-bold text-[11px] text-indigo-900 dark:text-indigo-200 flex items-center gap-1.5">
                    <Check className="h-3.5 w-3.5 text-indigo-600" />
                    Dados Happy Consignado
                  </h5>
                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    {detailTarget.happyBeneficioNumero && (
                      <div>
                        <span className="text-slate-500 block text-[10px]">Nº BENEFÍCIO</span>
                        <span className="font-mono font-bold">{detailTarget.happyBeneficioNumero}</span>
                      </div>
                    )}
                    {detailTarget.happyJourneyStatus && (
                      <div>
                        <span className="text-slate-500 block text-[10px]">SITUAÇÃO / STATUS</span>
                        <span className="font-bold text-indigo-700 dark:text-indigo-300">{detailTarget.happyJourneyStatus}</span>
                      </div>
                    )}
                    {detailTarget.happyClientId && (
                      <div>
                        <span className="text-slate-500 block text-[10px]">CLIENT ID</span>
                        <span className="font-mono text-[10px] truncate block" title={detailTarget.happyClientId}>{detailTarget.happyClientId}</span>
                      </div>
                    )}
                    {detailTarget.happySimulationId && (
                      <div>
                        <span className="text-slate-500 block text-[10px]">SIMULATION ID</span>
                        <span className="font-mono text-[10px] truncate block" title={detailTarget.happySimulationId}>{detailTarget.happySimulationId}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {['PARTNER_AUTO', 'DAYCOVAL_INSS', 'SPREADSHEET_INSS'].includes(detailTarget.simulationType || '') && <section className="rounded-xl border p-4 text-sm dark:border-slate-700">
                {((detailTarget.customerData as any)?.daycoval || (detailTarget.customerData as any)?.spreadsheet) && <div className="mb-3"><h4 className="font-bold">{detailTarget.selectedCondition?.provider || "Daycoval"} · INSS por planilha</h4><p>Versão: {((detailTarget.customerData as any).spreadsheet || (detailTarget.customerData as any).daycoval).version.fileName}</p><p>Data da simulação: {(detailTarget.customerData as any).simulationDate?.split('-').reverse().join('/')}</p><details className="mt-2"><summary className="cursor-pointer">Contratos utilizados no cálculo</summary>{((detailTarget.customerData as any).contracts || []).map((contract: any, index: number) => <p key={index} className="mt-1">Contrato {index + 1} · saldo R$ {Number(contract.balance).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} · parcela R$ {Number(contract.installment).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} · restantes {contract.remaining}</p>)}</details></div>}
                <h4 className="font-bold">Consulta do parceiro · {detailTarget.partnerCodeSnapshot}</h4>
                <p>Prazo: {detailTarget.offerExpiresAt ? new Date(detailTarget.offerExpiresAt).toLocaleString('pt-BR') : '—'}</p>
                {detailTarget.matchedAfterDeadline && <p className="text-amber-600">Digitada após o prazo de 5 dias úteis.</p>}
                <p className="mt-2">Cliente: {detailTarget.customerData?.name || 'Não informado'} · CPF: {formatCpf(detailTarget.cpf)}</p>
                {(detailTarget.customerData as any)?.originalContract && <p>Contrato de origem: {(detailTarget.customerData as any).originalContract} · banco {(detailTarget.customerData as any).originalBank} · saldo R$ {Number((detailTarget.customerData as any).debt).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>}
                <details className="mt-3"><summary className="cursor-pointer font-semibold">Todas as ofertas retornadas</summary><div className="mt-2 space-y-2">{((detailTarget.customerData as any)?.offers || []).map((offer: any, index: number) => <article key={index} className="rounded-lg border p-2 dark:border-slate-700"><strong>{offer.name || offer.table || offer.institution}</strong><p>{offer.provider} · {offer.institution}</p><p>Liberado: R$ {Number(offer.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} · parcela: {offer.installment ? `R$ ${Number(offer.installment).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : 'Não informada'} · {offer.term || '—'} meses · taxa {offer.rate ?? '—'}%</p></article>)}</div></details>
              </section>}
              {detailTarget.selectedCondition && <section className="space-y-3 rounded-xl border border-violet-200 p-4 dark:border-violet-800">
                <h4 className="font-bold">{detailTarget.simulationType === 'PARTNER_AUTO' ? 'Oferta de referência (maior valor liberado)' : 'Condição selecionada'}</h4>
                <p className="text-sm">{detailTarget.selectedCondition.tableName} · {detailTarget.selectedCondition.provider} · tabela {detailTarget.selectedCondition.tableId}</p>
                <dl className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                  <div><dt className="text-slate-500">Valor liberado / contrato</dt><dd>R$ {detailTarget.selectedCondition.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</dd></div>
                  <div><dt className="text-slate-500">Parcela</dt><dd>R$ {detailTarget.selectedCondition.installment?.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) || 'Não informada'}</dd></div>
                  <div><dt className="text-slate-500">Prazo / taxa mensal</dt><dd>{detailTarget.selectedCondition.term} meses · {detailTarget.selectedCondition.rate != null ? `${detailTarget.selectedCondition.rate}%` : 'Não informada'}</dd></div>
                  <div><dt className="text-slate-500">Benefício / espécie</dt><dd>{detailTarget.customerData?.benefitNumber} · {detailTarget.customerData?.benefitType}</dd></div>
                  <div><dt className="text-slate-500">Cliente</dt><dd>{detailTarget.customerData?.name || 'Não informado'}</dd></div>
                  <div><dt className="text-slate-500">Nascimento</dt><dd>{detailTarget.customerData?.birthDate?.split('-').reverse().join('/')}</dd></div>
                </dl>
                {detailTarget.customerData && ['originContract', 'refinancing', 'address', 'document', 'creditBankAccount'].map(key => {
                  const value = detailTarget.customerData?.[key as 'address'];
                  const labels: Record<string, string> = { originContract: 'Contrato de origem', refinancing: 'Refinanciamento adicional', rate: 'Taxa mensal', additionalInstallment: 'Parcela adicional', key: 'Referência do contrato', address: 'Endereço', document: 'Documento', creditBankAccount: 'Conta para crédito', lenderCode: 'Banco de origem', contractNumber: 'Contrato', term: 'Prazo original', installmentsRemaining: 'Parcelas restantes', installmentValue: 'Parcela atual', dueBalanceValue: 'Saldo devedor', street: 'Logradouro', number: 'Número', complement: 'Complemento', district: 'Bairro', city: 'Cidade', state: 'UF', zipCode: 'CEP', type: 'Tipo', issuingDate: 'Emissão', issuingEntity: 'Órgão emissor', issuingState: 'UF emissora', bank: 'Banco', branch: 'Agência', digit: 'Dígito' };
                  return value && Object.values(value).some(Boolean) ? <div key={key}><h5 className="font-semibold">{labels[key]}</h5><dl className="grid grid-cols-2 gap-2 text-sm">{Object.entries(value).filter(([, text]) => text).map(([field, text]) => <div key={field}><dt className="text-xs text-slate-500">{labels[field] || field}</dt><dd>{text}</dd></div>)}</dl></div> : null;
                })}
                {detailTarget.customerData?.phone && <p className="text-sm">Telefone: {detailTarget.customerData.phone} · E-mail: {detailTarget.customerData.email || 'Não informado'} · Renda: {detailTarget.customerData.income || 'Não informada'}</p>}
              </section>}

              {detailTarget.simulationType === 'FINANTO_INSS' && (
                <div className="space-y-2 rounded-lg border border-violet-200 bg-violet-50/50 p-3 dark:border-violet-800/60 dark:bg-violet-950/30">
                  <h5 className="flex items-center gap-1.5 text-[11px] font-bold text-violet-900 dark:text-violet-200"><Building2 className="h-3.5 w-3.5" />Dados FINANTO / JoinBank</h5>
                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div><span className="block text-[10px] text-slate-500">ID DA SIMULAÇÃO</span><span className="block truncate font-mono" title={detailTarget.finantoSimulationId}>{detailTarget.finantoSimulationId || '—'}</span></div>
                    <div><span className="block text-[10px] text-slate-500">ETAPA NO FINANTO</span><span className="font-semibold text-violet-700 dark:text-violet-300">{detailTarget.finantoJourneyStatus || '—'}</span></div>
                    {detailTarget.finantoSelectedCondition && <>
                      <div><span className="block text-[10px] text-slate-500">CRÉDITO</span><span className="font-semibold">R$ {Number(detailTarget.finantoSelectedCondition.loanValue || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span></div>
                      <div><span className="block text-[10px] text-slate-500">PARCELA · PRAZO</span><span className="font-semibold">R$ {Number(detailTarget.finantoSelectedCondition.installmentValue || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} · {detailTarget.finantoSelectedCondition.term} meses</span></div>
                    </>}
                  </div>
                </div>
              )}

              {/* Timeline Flow */}
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 space-y-3">
                <h4 className="font-bold text-slate-800 dark:text-slate-200">Linha do Tempo da Simulação</h4>

                <div className="space-y-3 relative before:absolute before:left-3 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200 dark:before:bg-slate-700">
                  {/* Step 1 */}
                  <div className="relative pl-7">
                    <div className="absolute left-1.5 top-0.5 h-3.5 w-3.5 rounded-full bg-blue-600 border-2 border-white dark:border-slate-900" />
                    <div className="font-bold text-slate-900 dark:text-slate-100">SIMULAÇÃO ENVIADA</div>
                    <div className="text-[11px] text-slate-500">
                      Cadastrado em {new Date(detailTarget.createdAt).toLocaleString('pt-BR')} por{' '}
                      {detailTarget.portalAccessName || users.find(u => u.id === detailTarget.createdById)?.name || 'Não informado'}
                    </div>
                  </div>

                  {/* Step 2 */}
                  <div className="relative pl-7">
                    {detailTarget.status === 'DIGITADA PELA MESA' ? (
                      <>
                        <div className="absolute left-1.5 top-0.5 h-3.5 w-3.5 rounded-full bg-emerald-500 border-2 border-white dark:border-slate-900" />
                        <div className="font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                          DIGITADA PELA MESA
                          <span className="px-1.5 py-0.2 text-[9px] bg-emerald-100 text-emerald-800 font-bold rounded-xs">
                            AUTOMÁTICO PELO SISTEMA
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-600 dark:text-slate-300 mt-1 space-y-0.5">
                          <div>
                            ADE Gerada: <strong>{detailTarget.matchedProposalNumber}</strong>
                          </div>
                          <div>
                            Digitador Responsável: <strong>{detailTarget.matchedDigitizerName}</strong>
                          </div>
                          <div>
                            Data da Vínculação:{' '}
                            <strong>
                              {detailTarget.matchedAt ? new Date(detailTarget.matchedAt).toLocaleString('pt-BR') : '-'}
                            </strong>
                          </div>
                        </div>
                      </>
                    ) : detailTarget.status === 'NÃO PASSÍVEL DE CONTRATAÇÃO' ? (
                      <>
                        <div className="absolute left-1.5 top-0.5 h-3.5 w-3.5 rounded-full bg-rose-500 border-2 border-white dark:border-slate-900" />
                        <div className="font-bold text-rose-600 dark:text-rose-400 flex items-center gap-1.5">
                          NÃO PASSÍVEL DE CONTRATAÇÃO
                          <span className="px-1.5 py-0.2 text-[9px] bg-rose-100 text-rose-800 font-bold rounded-xs">
                            ALTERAÇÃO MANUAL
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          Atualizado em {new Date(detailTarget.updatedAt).toLocaleString('pt-BR')}
                        </div>
                      </>
                    ) : detailTarget.status === 'PERDIDA (NÃO DIGITADA)' ? (
                      <>
                        <div className="absolute left-1.5 top-0.5 h-3.5 w-3.5 rounded-full bg-slate-500 border-2 border-white dark:border-slate-900" />
                        <div className="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                          PERDIDA (NÃO DIGITADA)
                          <span className="px-1.5 py-0.2 text-[9px] bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 font-bold rounded-xs">
                            {['PARTNER_AUTO', 'DAYCOVAL_INSS', 'SPREADSHEET_INSS'].includes(detailTarget.simulationType || '') ? 'EXPIRAÇÃO EM 5 DIAS ÚTEIS' : 'EXPIRAÇÃO AUTOMÁTICA 72H'}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          Prazo máximo de {['PARTNER_AUTO', 'DAYCOVAL_INSS', 'SPREADSHEET_INSS'].includes(detailTarget.simulationType || '') ? '5 dias úteis' : '72 horas'} excedido sem digitação da proposta. Expirado em {new Date(detailTarget.offerLostAt || detailTarget.updatedAt).toLocaleString('pt-BR')}
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="absolute left-1.5 top-0.5 h-3.5 w-3.5 rounded-full bg-slate-300 dark:bg-slate-600 border-2 border-white dark:border-slate-900" />
                        <div className="font-semibold text-slate-400">Aguardando Identificação da Mesa...</div>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end">
                <button
                  type="button"
                  onClick={() => setDetailTarget(null)}
                  className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold rounded-lg hover:bg-slate-200 cursor-pointer"
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Importação de Simulações em Lote */}
      <SimulationImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onImportCompleted={() => loadData()}
      />

      {/* Modal Seletor de Fluxo de Simulação */}
      <SimulationFlowSelectorModal
        isOpen={isFlowSelectorOpen}
        onClose={() => setIsFlowSelectorOpen(false)}
        happySimulationAccessEnabled={happySimulationAccessEnabled}
        finantoEnabled={finantoEnabled}
        nossaFintechEnabled={nossaFintechEnabled}
        onSelectFlow={(flow) => {
          setIsFlowSelectorOpen(false);
          if (flow === 'PORT_REFIN_PLANILHAS') { setActiveTab('PORT_REFIN_PLANILHAS'); return; }
          if (flow === 'CLT_MULTI' || flow === 'FGTS_MULTI') {
            setMultiProduct(flow === 'CLT_MULTI' ? 'CLT' : 'FGTS');
            return;
          }
          if (flow === 'MANUAL') {
            handleOpenManualModal();
          } else if (flow === 'HAPPY_INSS') {
            setFinantoOperationCode('1'); setIsFinantoInssModalOpen(true);
          } else if (flow === 'HAPPY_CLT') {
            setMultiProduct('CLT');
          } else if (flow === 'FINANTO_INSS' || flow === 'FINANTO_INSS_PORTABILIDADE' || flow === 'FINANTO_INSS_REFIN' || flow === 'FINANTO_INSS_PORTABILIDADE_REFIN') {
            setInssInitialDraft(undefined);
            setFinantoOperationCode(flow === 'FINANTO_INSS' ? '1' : flow === 'FINANTO_INSS_PORTABILIDADE' ? '2' : flow === 'FINANTO_INSS_REFIN' ? '3' : '4');
            setIsFinantoInssModalOpen(true);
          } else if (flow === 'NOSSA_FINTECH_PORTABILIDADE_REFIN') {
            setIsNossaFintechPortRefinOpen(true);
          }
        }}
      />

      {multiProduct && <ProductSimulationModal partners={partners} onSuccess={async () => { await loadData(); }} key={multiProduct} product={multiProduct} isOpen onClose={() => setMultiProduct(null)} onHappyClt={happySimulationAccessEnabled ? () => { setMultiProduct(null); setIsHappyCltModalOpen(true); } : undefined} />}

      {/* Modal Simulação Happy INSS */}
      <HappyInssSimulationModal
        isOpen={isHappyInssModalOpen}
        onClose={() => setIsHappyInssModalOpen(false)}
        partners={partners}
        onSuccess={async () => {
          await loadData();
        }}
      />

      {/* Modal Simulação Happy CLT (Consignado Privado) */}
      <HappyCltSimulationModal
        isOpen={isHappyCltModalOpen}
        onClose={() => setIsHappyCltModalOpen(false)}
        partners={partners}
        onSuccess={async () => {
          await loadData();
        }}
      />

      <FinantoInssSimulationModal
        happyEnabled={happySimulationAccessEnabled}
        isOpen={isFinantoInssModalOpen}
        initialDraft={inssInitialDraft}
        operationCode={finantoOperationCode}
        onClose={() => setIsFinantoInssModalOpen(false)}
        partners={partners}
        onSuccess={async () => { await loadData(); }}
      />

      <NossaFintechPortRefinSimulationModal
        happyEnabled={happySimulationAccessEnabled}
        isOpen={isNossaFintechPortRefinOpen}
        partners={partners}
        onSuccess={async () => { await loadData(); }}
        onContinue={draft => { setIsNossaFintechPortRefinOpen(false); setInssInitialDraft(draft); setFinantoOperationCode('4'); setIsFinantoInssModalOpen(true); }}
        onClose={() => setIsNossaFintechPortRefinOpen(false)}
      />
    </div>
  );
};

export const SimulationView: React.FC<SimulationViewProps> = (props) => {
  const activeUser = StorageService.getActiveUser();

  if (activeUser?.role === 'DIGITADOR') {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center px-4">
        <div className="h-16 w-16 bg-rose-100 dark:bg-rose-950/30 text-rose-600 rounded-full flex items-center justify-center mb-4">
          <ShieldAlert className="h-8 w-8" />
        </div>
        <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-2">Acesso Restrito</h2>
        <p className="text-slate-500 dark:text-slate-400 max-w-md">
          Seu perfil de <strong>DIGITADOR</strong> não possui permissão para visualizar a Central de Simulações.
        </p>
      </div>
    );
  }

  return <SimulationWorkspace {...props} />;
};
