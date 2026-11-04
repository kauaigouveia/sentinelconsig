import React, { useState, useEffect, useMemo } from 'react';
import {
  ArrowDown,
  ArrowRight,
  CheckCircle2,
  Plus,
  Trash2,
  Zap,
  Sliders,
  Play,
  Save,
  X,
  AlertCircle,
  HelpCircle,
  Layers,
  Sparkles,
  ShieldAlert,
  Info,
} from 'lucide-react';
import { AutomationTestModal } from './AutomationTestModal';

export interface ConditionRule {
  field: string;
  operator: string;
  value?: any;
}

export interface ConditionGroup {
  matchType: 'ALL' | 'ANY';
  rules: ConditionRule[];
}

export interface AutomationAction {
  type: string;
  params: Record<string, any>;
}

export interface AutomationData {
  id?: string;
  name: string;
  description?: string;
  event: string;
  conditions: ConditionGroup;
  actions: AutomationAction[];
  active: boolean;
}

interface AutomationVisualBuilderProps {
  initialData?: Partial<AutomationData>;
  catalog: {
    triggers: Array<{
      id: string;
      label: string;
      category: string;
      description: string;
      sampleFields: Array<{ field: string; label: string; type: string }>;
    }>;
    actions: Array<{
      type: string;
      label: string;
      category: string;
      description: string;
      fields: Array<{
        name: string;
        label: string;
        type: string;
        required?: boolean;
        options?: string[];
        defaultValue?: any;
      }>;
    }>;
    operators: Array<{
      id: string;
      label: string;
      compatibleWith: string[];
    }>;
  };
  onSave: (data: AutomationData) => Promise<void>;
  onCancel: () => void;
}

export const AutomationVisualBuilder: React.FC<AutomationVisualBuilderProps> = ({
  initialData,
  catalog,
  onSave,
  onCancel,
}) => {
  const [name, setName] = useState(initialData?.name || '');
  const [description, setDescription] = useState(initialData?.description || '');
  const [active, setActive] = useState(initialData?.active !== undefined ? initialData.active : true);
  const [event, setEvent] = useState(initialData?.event || 'PROPOSAL_STATUS_CHANGED');

  // Conditions
  const [matchType, setMatchType] = useState<'ALL' | 'ANY'>(
    initialData?.conditions?.matchType || 'ALL'
  );
  const [rules, setRules] = useState<ConditionRule[]>(
    initialData?.conditions?.rules || []
  );

  // Actions
  const [actions, setActions] = useState<AutomationAction[]>(
    initialData?.actions && initialData.actions.length > 0
      ? initialData.actions
      : [{ type: 'CREATE_NOTIFICATION', params: { title: 'Aviso de Automação', message: '' } }]
  );

  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showTestModal, setShowTestModal] = useState(false);

  // Gatilho atualmente selecionado
  const selectedTrigger = useMemo(() => {
    return catalog.triggers.find((t) => t.id === event) || catalog.triggers[0];
  }, [catalog.triggers, event]);

  // Agrupamento de gatilhos por categoria
  const groupedTriggers = useMemo(() => {
    const groups: Record<string, typeof catalog.triggers> = {};
    catalog.triggers.forEach((t) => {
      if (!groups[t.category]) groups[t.category] = [];
      groups[t.category].push(t);
    });
    return groups;
  }, [catalog.triggers]);

  // Adicionar Condição
  const handleAddCondition = () => {
    const defaultField = selectedTrigger?.sampleFields?.[0]?.field || 'status';
    setRules([...rules, { field: defaultField, operator: 'EQUALS', value: '' }]);
  };

  // Remover Condição
  const handleRemoveCondition = (index: number) => {
    setRules(rules.filter((_, i) => i !== index));
  };

  // Atualizar Condição
  const handleUpdateCondition = (index: number, key: keyof ConditionRule, val: any) => {
    const updated = [...rules];
    updated[index] = { ...updated[index], [key]: val };
    setRules(updated);
  };

  // Adicionar Ação
  const handleAddAction = () => {
    const defaultAct = catalog.actions[0];
    const initialParams: Record<string, any> = {};
    defaultAct.fields.forEach((f) => {
      if (f.defaultValue !== undefined) initialParams[f.name] = f.defaultValue;
    });
    setActions([...actions, { type: defaultAct.type, params: initialParams }]);
  };

  // Remover Ação
  const handleRemoveAction = (index: number) => {
    setActions(actions.filter((_, i) => i !== index));
  };

  // Atualizar Tipo de Ação
  const handleActionTypeChange = (index: number, newType: string) => {
    const actDef = catalog.actions.find((a) => a.type === newType);
    const newParams: Record<string, any> = {};
    if (actDef) {
      actDef.fields.forEach((f) => {
        if (f.defaultValue !== undefined) newParams[f.name] = f.defaultValue;
      });
    }
    const updated = [...actions];
    updated[index] = { type: newType, params: newParams };
    setActions(updated);
  };

  // Atualizar Parâmetro da Ação
  const handleActionParamChange = (actionIndex: number, paramKey: string, value: any) => {
    const updated = [...actions];
    updated[actionIndex] = {
      ...updated[actionIndex],
      params: {
        ...updated[actionIndex].params,
        [paramKey]: value,
      },
    };
    setActions(updated);
  };

  // Resumo em Linguagem Natural Dinâmico
  const naturalLanguagePreview = useMemo(() => {
    const triggerLabel = selectedTrigger?.label || event;

    let conditionText = '';
    if (rules.length > 0) {
      const glue = matchType === 'ANY' ? ' OU ' : ' E ';
      const parts = rules.map((r) => {
        const op = catalog.operators.find((o) => o.id === r.operator)?.label || r.operator;
        if (r.operator === 'IS_EMPTY' || r.operator === 'IS_NOT_EMPTY') {
          return `[${r.field}] ${op}`;
        }
        return `[${r.field}] ${op} "${r.value ?? ''}"`;
      });
      conditionText = `SE ${parts.join(glue)}`;
    } else {
      conditionText = 'SE nenhuma condição restritiva for exigida (sempre executar)';
    }

    let actionText = '';
    if (actions.length > 0) {
      const parts = actions.map((act) => {
        const actDef = catalog.actions.find((a) => a.type === act.type);
        const name = actDef?.label || act.type;
        const mainParam = act.params?.title || act.params?.message || act.params?.notes || '';
        return mainParam ? `${name} ("${mainParam}")` : name;
      });
      actionText = `ENTÃO ${parts.join(' E ')}`;
    } else {
      actionText = 'ENTÃO não executar nenhuma ação';
    }

    return `QUANDO "${triggerLabel}" ocorrer, ${conditionText}, ${actionText}.`;
  }, [selectedTrigger, event, rules, matchType, actions, catalog.operators, catalog.actions]);

  // Salvar Regra com validação
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!name.trim()) {
      setErrorMessage('Informe um nome descritivo para a automação.');
      return;
    }

    if (actions.length === 0) {
      setErrorMessage('Adicione pelo menos uma ação a ser executada pela automação.');
      return;
    }

    setIsSaving(true);
    try {
      await onSave({
        id: initialData?.id,
        name: name.trim(),
        description: description.trim() || undefined,
        event,
        conditions: {
          matchType,
          rules,
        },
        actions,
        active,
      });
    } catch (err: any) {
      setErrorMessage(err.message || 'Erro ao salvar automação.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="bg-[var(--bg-surface)] border border-[var(--field-border)] rounded-2xl p-6  space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[var(--field-border)] pb-5">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-[var(--info-bg)] text-[var(--link)] rounded-xl border border-[var(--field-border)]">
              <Sliders className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-[var(--text-primary)]">
                {initialData?.id ? 'Editar Fluxo de Automação' : 'Novo Fluxo Operacional'}
              </h2>
              <p className="text-xs text-[var(--text-secondary)]">
                Configure regras lógicas orientadas a eventos: QUANDO → SE → ENTÃO.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setShowTestModal(true)}
              className="px-4 py-2 bg-[var(--bg-surface-elevated)] hover:bg-[var(--bg-surface-elevated)] text-[var(--link)] border border-[var(--field-border)] rounded-xl text-xs font-semibold flex items-center gap-2 transition-colors shadow-sm"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              Testar Regra
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 bg-[var(--bg-surface-elevated)] hover:bg-[var(--bg-surface-elevated)] text-[var(--text-primary)] rounded-xl text-xs font-semibold transition-colors"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="px-5 py-2 bg-[var(--action)] hover:bg-[var(--action-hover)] text-[var(--action-ink)] rounded-xl text-xs font-semibold   transition-all flex items-center gap-2 disabled:opacity-90"
            >
              <Save className="w-3.5 h-3.5" />
              {isSaving ? 'Salvando...' : 'Salvar Automação'}
            </button>
          </div>
        </div>

        {/* Basic Fields */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2 space-y-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-primary)] mb-1.5">
                Nome da Automação <span className="text-[var(--danger-text)]">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Escalar SLA Crítico para Supervisão"
                className="w-full bg-[var(--bg-canvas)] border border-[var(--field-border)] rounded-xl px-4 py-2.5 text-[var(--text-primary)] text-sm focus:outline-none focus:border-[var(--field-border)] transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)] mb-1.5">
                Descrição Operacional
              </label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Ex: Notifica a gerência e ajusta a prioridade quando o tempo de SLA estourar"
                className="w-full bg-[var(--bg-canvas)] border border-[var(--field-border)] rounded-xl px-4 py-2 text-[var(--text-primary)] text-sm focus:outline-none focus:border-[var(--field-border)] transition-colors"
              />
            </div>
          </div>

          <div className="bg-[var(--bg-canvas)] border border-[var(--field-border)] rounded-xl p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-primary)]">
                  Status da Regra
                </span>
                <p className="text-[11px] text-[var(--text-secondary)] mt-0.5">
                  Regras pausadas não executam ações mesmo quando o gatilho ocorre.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActive(!active)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${
                  active
                    ? 'bg-[var(--success-bg)] text-[var(--success-text)] border-[var(--success-border)]'
                    : 'bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] border-[var(--field-border)]'
                }`}
              >
                {active ? 'ATIVO' : 'PAUSADO'}
              </button>
            </div>
            <div className="text-[11px] text-[var(--text-secondary)] pt-3 border-t border-[var(--field-border)]">
              Idempotência e proteção contra recursão ativas por padrão.
            </div>
          </div>
        </div>

        {errorMessage && (
          <div className="p-4 bg-[var(--danger-bg)] border border-[var(--danger-border)] rounded-xl text-[var(--danger-text)] text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-[var(--danger-text)]" />
            {errorMessage}
          </div>
        )}
      </div>

      {/* ==================================================== */}
      {/* 1. QUANDO (TRIGGER / GATILHO)                         */}
      {/* ==================================================== */}
      <div className="bg-[var(--bg-surface)] border border-[var(--field-border)] rounded-2xl p-6  relative">
        <div className="flex items-center justify-between gap-4 mb-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-[var(--info-bg)] border border-[var(--field-border)] flex items-center justify-center text-[var(--link)] font-extrabold text-sm">
              1
            </div>
            <div>
              <h3 className="text-base font-bold text-[var(--text-primary)] flex items-center gap-2">
                QUANDO (Gatilho de Disparo)
              </h3>
              <p className="text-xs text-[var(--text-secondary)]">
                O evento da esteira que inicia a avaliação do fluxo.
              </p>
            </div>
          </div>
          <span className="text-xs font-mono text-[var(--link)] bg-[var(--info-bg)] border border-[var(--field-border)] px-3 py-1 rounded-lg">
            {selectedTrigger?.category}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2">
            <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)] mb-1.5">
              Selecione o Evento de Domínio
            </label>
            <select
              value={event}
              onChange={(e) => setEvent(e.target.value)}
              className="w-full bg-[var(--bg-canvas)] border border-[var(--field-border)] rounded-xl px-4 py-3 text-[var(--text-primary)] text-sm font-semibold focus:outline-none focus:border-[var(--field-border)] transition-colors"
            >
              {Object.entries(groupedTriggers).map(([category, items]) => (
                <optgroup key={category} label={category} className="bg-[var(--bg-surface)] text-[var(--text-primary)]">
                  {items.map((t) => (
                    <option key={t.id} value={t.id} className="text-[var(--text-primary)] py-1">
                      {t.label} ({t.id})
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            {selectedTrigger && (
              <p className="text-xs text-[var(--text-secondary)] mt-2 flex items-center gap-1.5">
                <Info className="w-3.5 h-3.5 text-[var(--link)] shrink-0" />
                {selectedTrigger.description}
              </p>
            )}
          </div>

          {/* Quick field hints */}
          <div className="bg-[var(--bg-canvas)] border border-[var(--field-border)] rounded-xl p-3.5 space-y-2">
            <div className="text-[11px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
              Campos Disponíveis no Evento
            </div>
            <div className="flex flex-wrap gap-1.5">
              {selectedTrigger?.sampleFields?.map((f) => (
                <button
                  key={f.field}
                  type="button"
                  onClick={() => {
                    setRules([...rules, { field: f.field, operator: 'EQUALS', value: '' }]);
                  }}
                  className="px-2 py-1 bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-elevated)] text-[var(--text-primary)] rounded text-[11px] font-mono border border-[var(--field-border)] transition-colors flex items-center gap-1"
                  title={`Clique para adicionar condição com ${f.field}`}
                >
                  <Plus className="w-2.5 h-2.5 text-[var(--link)]" />
                  {f.field}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Visual Connector Arrow */}
        <div className="flex justify-center -mb-9 mt-4">
          <div className="w-8 h-8 rounded-full bg-[var(--bg-surface-elevated)] border border-[var(--field-border)] flex items-center justify-center text-[var(--text-secondary)] z-10 shadow">
            <ArrowDown className="w-4 h-4" />
          </div>
        </div>
      </div>

      {/* ==================================================== */}
      {/* 2. SE (CONDITIONS / FILTROS)                          */}
      {/* ==================================================== */}
      <div className="bg-[var(--bg-surface)] border border-[var(--field-border)] rounded-2xl p-6  relative">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-[var(--warning-bg)] border border-[var(--warning-border)] flex items-center justify-center text-[var(--warning-text)] font-extrabold text-sm">
              2
            </div>
            <div>
              <h3 className="text-base font-bold text-[var(--text-primary)]">SE (Condições de Execução)</h3>
              <p className="text-xs text-[var(--text-secondary)]">
                Filtre os cenários exatos para os quais a automação deve rodar.
              </p>
            </div>
          </div>

          {/* AND / OR Switch */}
          <div className="flex items-center gap-2 bg-[var(--bg-canvas)] p-1 rounded-xl border border-[var(--field-border)]">
            <span className="text-xs font-semibold text-[var(--text-secondary)] px-2">Critério:</span>
            <button
              type="button"
              onClick={() => setMatchType('ALL')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors ${
                matchType === 'ALL'
                  ? 'bg-[var(--action)] text-[var(--text-primary)] shadow'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              TODAS (E / AND)
            </button>
            <button
              type="button"
              onClick={() => setMatchType('ANY')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors ${
                matchType === 'ANY'
                  ? 'bg-[var(--warning-bg)] text-[var(--text-primary)] shadow'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              QUALQUER (OU / OR)
            </button>
          </div>
        </div>

        {/* Condition Rows */}
        <div className="space-y-3">
          {rules.length === 0 ? (
            <div className="p-8 text-center text-[var(--text-secondary)] border border-dashed border-[var(--field-border)] rounded-xl bg-[var(--bg-canvas)]">
              <Sliders className="w-8 h-8 mx-auto text-[var(--text-secondary)] mb-2" />
              <div className="text-sm font-semibold text-[var(--text-primary)]">Sem condições restritivas</div>
              <p className="text-xs text-[var(--text-secondary)] mt-1 max-w-sm mx-auto">
                A automação disparará sempre que o evento ocorrer. Adicione condições para restringir por banco, prioridade, valores, etc.
              </p>
            </div>
          ) : (
            rules.map((rule, idx) => (
              <div
                key={idx}
                className="bg-[var(--bg-canvas)] border border-[var(--field-border)] rounded-xl p-3.5 flex flex-col sm:flex-row items-stretch sm:items-center gap-3 transition-colors hover:border-[var(--field-border)]"
              >
                <div className="w-8 shrink-0 text-xs font-mono font-bold text-[var(--text-secondary)] text-center">
                  #{idx + 1}
                </div>

                {/* Field input / select */}
                <div className="flex-1 min-w-[140px]">
                  <input
                    type="text"
                    value={rule.field}
                    onChange={(e) => handleUpdateCondition(idx, 'field', e.target.value)}
                    placeholder="campo (ex: priority)"
                    className="w-full bg-[var(--bg-surface)] border border-[var(--field-border)] rounded-lg px-3 py-2 text-[var(--text-primary)] text-xs font-mono focus:outline-none focus:border-[var(--field-border)]"
                  />
                </div>

                {/* Operator select */}
                <div className="w-48 shrink-0">
                  <select
                    value={rule.operator}
                    onChange={(e) => handleUpdateCondition(idx, 'operator', e.target.value)}
                    className="w-full bg-[var(--bg-surface)] border border-[var(--field-border)] rounded-lg px-3 py-2 text-[var(--link)] text-xs font-semibold focus:outline-none focus:border-[var(--field-border)]"
                  >
                    {catalog.operators.map((op) => (
                      <option key={op.id} value={op.id}>
                        {op.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Value input (hidden for isEmpty) */}
                {rule.operator !== 'IS_EMPTY' && rule.operator !== 'IS_NOT_EMPTY' ? (
                  <div className="flex-1 min-w-[140px]">
                    <input
                      type="text"
                      value={rule.value ?? ''}
                      onChange={(e) => handleUpdateCondition(idx, 'value', e.target.value)}
                      placeholder="valor esperado (ex: CRITICAL)"
                      className="w-full bg-[var(--bg-surface)] border border-[var(--field-border)] rounded-lg px-3 py-2 text-[var(--text-primary)] text-xs focus:outline-none focus:border-[var(--field-border)]"
                    />
                  </div>
                ) : (
                  <div className="flex-1 text-xs text-[var(--text-secondary)] italic px-2">
                    (Sem valor para este operador)
                  </div>
                )}

                {/* Delete button */}
                <button
                  type="button"
                  onClick={() => handleRemoveCondition(idx)}
                  className="p-2 text-[var(--text-secondary)] hover:text-[var(--danger-text)] hover:bg-[var(--bg-surface)] rounded-lg transition-colors shrink-0"
                  title="Remover condição"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))
          )}

          <div className="pt-2">
            <button
              type="button"
              onClick={handleAddCondition}
              className="px-4 py-2 bg-[var(--bg-surface-elevated)] hover:bg-[var(--bg-surface-elevated)] text-[var(--text-primary)] rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5 border border-[var(--field-border)]"
            >
              <Plus className="w-3.5 h-3.5 text-[var(--warning-text)]" />
              Adicionar Condição
            </button>
          </div>
        </div>

        {/* Visual Connector Arrow */}
        <div className="flex justify-center -mb-9 mt-4">
          <div className="w-8 h-8 rounded-full bg-[var(--bg-surface-elevated)] border border-[var(--field-border)] flex items-center justify-center text-[var(--text-secondary)] z-10 shadow">
            <ArrowDown className="w-4 h-4" />
          </div>
        </div>
      </div>

      {/* ==================================================== */}
      {/* 3. ENTÃO (ACTIONS / AÇÕES)                           */}
      {/* ==================================================== */}
      <div className="bg-[var(--bg-surface)] border border-[var(--field-border)] rounded-2xl p-6  relative">
        <div className="flex items-center justify-between gap-4 mb-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-[var(--success-bg)] border border-[var(--success-border)] flex items-center justify-center text-[var(--success-text)] font-extrabold text-sm">
              3
            </div>
            <div>
              <h3 className="text-base font-bold text-[var(--text-primary)]">ENTÃO (Ações Operacionais)</h3>
              <p className="text-xs text-[var(--text-secondary)]">
                Ações executadas sequencialmente quando todas as condições forem válidas.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
            <ShieldAlert className="w-4 h-4 text-[var(--success-text)]" />
            <span className="hidden sm:inline">Apenas ações autorizadas e seguras</span>
          </div>
        </div>

        {/* Action Cards */}
        <div className="space-y-4">
          {actions.map((act, actIdx) => {
            const actDef = catalog.actions.find((a) => a.type === act.type) || catalog.actions[0];

            return (
              <div
                key={actIdx}
                className="bg-[var(--bg-canvas)] border border-[var(--field-border)] rounded-xl p-4 space-y-3 transition-colors hover:border-[var(--field-border)]"
              >
                <div className="flex items-center justify-between gap-3 border-b border-[var(--field-border)] pb-3">
                  <div className="flex items-center gap-2 flex-1">
                    <span className="w-6 h-6 rounded-lg bg-[var(--bg-surface)] border border-[var(--field-border)] flex items-center justify-center text-xs font-bold text-[var(--link)]">
                      {actIdx + 1}
                    </span>
                    <select
                      value={act.type}
                      onChange={(e) => handleActionTypeChange(actIdx, e.target.value)}
                      className="bg-[var(--bg-surface)] border border-[var(--field-border)] rounded-lg px-3 py-1.5 text-[var(--success-text)] font-bold text-xs focus:outline-none focus:border-[var(--field-border)]"
                    >
                      {catalog.actions.map((a) => (
                        <option key={a.type} value={a.type}>
                          {a.label} ({a.category})
                        </option>
                      ))}
                    </select>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleRemoveAction(actIdx)}
                    disabled={actions.length === 1}
                    className="p-1.5 text-[var(--text-secondary)] hover:text-[var(--danger-text)] hover:bg-[var(--bg-surface)] rounded-lg transition-colors disabled:opacity-90"
                    title="Remover ação"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                {/* Parameters form for this action */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                  {actDef.fields.map((f) => {
                    const val = act.params?.[f.name] ?? f.defaultValue ?? '';

                    if (f.type === 'select') {
                      return (
                        <div key={f.name}>
                          <label className="block text-[11px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-1">
                            {f.label}
                          </label>
                          <select
                            value={val}
                            onChange={(e) => handleActionParamChange(actIdx, f.name, e.target.value)}
                            className="w-full bg-[var(--bg-surface)] border border-[var(--field-border)] rounded-lg px-3 py-2 text-[var(--text-primary)] text-xs focus:outline-none focus:border-[var(--field-border)]"
                          >
                            {f.options?.map((opt) => (
                              <option key={opt} value={opt}>
                                {opt}
                              </option>
                            ))}
                          </select>
                        </div>
                      );
                    }

                    if (f.type === 'textarea') {
                      return (
                        <div key={f.name} className="md:col-span-2">
                          <label className="block text-[11px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-1">
                            {f.label}
                          </label>
                          <textarea
                            rows={2}
                            value={val}
                            onChange={(e) => handleActionParamChange(actIdx, f.name, e.target.value)}
                            className="w-full bg-[var(--bg-surface)] border border-[var(--field-border)] rounded-lg p-2.5 text-[var(--text-primary)] text-xs focus:outline-none focus:border-[var(--field-border)]"
                          />
                        </div>
                      );
                    }

                    return (
                      <div key={f.name}>
                        <label className="block text-[11px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-1">
                          {f.label}
                        </label>
                        <input
                          type="text"
                          value={val}
                          onChange={(e) => handleActionParamChange(actIdx, f.name, e.target.value)}
                          className="w-full bg-[var(--bg-surface)] border border-[var(--field-border)] rounded-lg px-3 py-2 text-[var(--text-primary)] text-xs focus:outline-none focus:border-[var(--field-border)]"
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          <div className="pt-2">
            <button
              type="button"
              onClick={handleAddAction}
              className="px-4 py-2 bg-[var(--bg-surface-elevated)] hover:bg-[var(--bg-surface-elevated)] text-[var(--text-primary)] rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5 border border-[var(--field-border)]"
            >
              <Plus className="w-3.5 h-3.5 text-[var(--success-text)]" />
              Adicionar Nova Ação
            </button>
          </div>
        </div>
      </div>

      {/* ==================================================== */}
      {/* HUMAN LANGUAGE PREVIEW BANNER                        */}
      {/* ==================================================== */}
      <div className="bg-[var(--bg-surface)] border border-[var(--field-border)] rounded-2xl p-5  flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-[var(--link)] text-xs font-bold uppercase tracking-wider">
            <Sparkles className="w-4 h-4" />
            Visão em Linguagem Natural
          </div>
          <p className="text-sm text-[var(--text-primary)] font-medium italic">
            "{naturalLanguagePreview}"
          </p>
        </div>

        <div className="shrink-0 flex items-center gap-3">
          <button
            type="button"
            onClick={() => setShowTestModal(true)}
            className="px-4 py-2 bg-[var(--bg-surface-elevated)] hover:bg-[var(--bg-surface-elevated)] text-[var(--link)] border border-[var(--field-border)] rounded-xl text-xs font-semibold flex items-center gap-2 transition-colors shadow-sm"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            Simular Regra
          </button>
        </div>
      </div>

      {/* Test Modal */}
      {showTestModal && (
        <AutomationTestModal
          automation={{
            name,
            event,
            conditions: { matchType, rules },
            actions,
          }}
          onClose={() => setShowTestModal(false)}
        />
      )}
    </div>
  );
};
