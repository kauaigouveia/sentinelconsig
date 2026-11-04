import React, { useState, useEffect, useRef } from 'react';
import {
  Database,
  ShieldCheck,
  Download,
  Upload,
  RotateCcw,
  Clock,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Play,
  X,
  FileJson,
  Layers,
  Sparkles,
  Calendar,
  Lock,
} from 'lucide-react';
import { BackupService } from '../../services/backupService';
import { StorageService } from '../../services/storageService';
import { DatabaseBackupSnapshot, BackupScheduleConfig } from '../../types';
import { UniversalConfirmationModal } from '../common/UniversalConfirmationModal';
import { formatDate } from '../../lib/utils';

interface BackupManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDatabaseRestored?: () => void;
}

export const BackupManagementModal: React.FC<BackupManagementModalProps> = ({
  isOpen,
  onClose,
  onDatabaseRestored,
}) => {
  const [snapshots, setSnapshots] = useState<DatabaseBackupSnapshot[]>([]);
  const [schedule, setSchedule] = useState<BackupScheduleConfig>(BackupService.getScheduleConfig());
  const [activeTab, setActiveTab] = useState<'SNAPSHOTS' | 'CONFIG' | 'UPLOAD'>('SNAPSHOTS');
  const [feedbackMessage, setFeedbackMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Restore Confirmation Modal state
  const [restoreModalConfig, setRestoreModalConfig] = useState<{
    isOpen: boolean;
    dataDump?: Record<string, any>;
    snapshotName?: string;
  }>({
    isOpen: false,
  });

  // Delete Snapshot Confirmation
  const [deleteModalConfig, setDeleteModalConfig] = useState<{
    isOpen: boolean;
    snapshotId?: string;
    snapshotName?: string;
  }>({
    isOpen: false,
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadData = async () => {
    const snaps = await BackupService.getSnapshots();
    setSnapshots(snaps);
    setSchedule(BackupService.getScheduleConfig());
  };

  useEffect(() => {
    if (isOpen) {
      loadData();
      setFeedbackMessage(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const showFeedback = (text: string, type: 'success' | 'error') => {
    setFeedbackMessage({ text, type });
    setTimeout(() => setFeedbackMessage(null), 5000);
  };

  const handleManualBackup = async () => {
    try {
      const res = await fetch('/api/admin/backups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: 'Backup manual disparado pelo painel', type: 'MANUAL' }),
        credentials: 'include',
      });
      if (res.ok) {
        await loadData();
        showFeedback('Backup manual gerado e armazenado com sucesso no servidor!', 'success');
      } else {
        const errData = await res.json();
        showFeedback(`Erro ao gerar backup: ${errData.error || 'Falha no servidor'}`, 'error');
      }
    } catch (e: any) {
      showFeedback(`Erro ao gerar backup: ${e?.message || 'Falha de conexão'}`, 'error');
    }
  };

  const handleRunCronCheck = async () => {
    const res = await BackupService.checkAndExecuteScheduledBackup();
    await loadData();
    showFeedback(res.message, res.executed ? 'success' : 'success');
  };

  const handleUpdateSchedule = (changes: Partial<BackupScheduleConfig>) => {
    const updated = BackupService.updateScheduleConfig(changes);
    setSchedule(updated);
    showFeedback('Configurações de agendamento automático salvas com sucesso.', 'success');
  };

  const handleConfirmRestore = async () => {
    if (!restoreModalConfig.dataDump) return;

    const res = BackupService.restoreDatabaseFromDump(restoreModalConfig.dataDump);
    if (res.success) {
      showFeedback('Banco de dados restaurado com sucesso! A página será atualizada.', 'success');
      setTimeout(() => {
        if (onDatabaseRestored) {
          onDatabaseRestored();
        } else {
          window.location.reload();
        }
      }, 1200);
    } else {
      showFeedback(`Falha ao restaurar: ${res.error}`, 'error');
    }
  };

  const handleConfirmDelete = () => {
    if (!deleteModalConfig.snapshotId) return;
    BackupService.deleteSnapshot(deleteModalConfig.snapshotId);
    loadData();
    showFeedback('Snapshot de backup excluído com sucesso.', 'success');
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = event => {
      try {
        const content = event.target?.result as string;
        const parsed = JSON.parse(content);

        // Open restore modal
        setRestoreModalConfig({
          isOpen: true,
          dataDump: parsed,
          snapshotName: `Arquivo importado: ${file.name}`,
        });
      } catch (err: any) {
        showFeedback('Arquivo inválido ou JSON corrompido.', 'error');
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--scrim)] p-4 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="relative w-full max-w-4xl rounded-2xl bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)]  border border-[var(--field-border)] dark:border-[var(--field-border)] flex flex-col max-h-[90vh] overflow-hidden transition-colors">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface-elevated)]">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-[var(--info-bg)] text-[var(--text-primary)] flex items-center justify-center shadow-xs">
              <Database className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)] flex items-center gap-2">
                <span>Backup & Segurança do Banco de Dados</span>
                <span className="rounded-full bg-[var(--success-bg)] dark:bg-[var(--success-bg)] text-[var(--success-text)] dark:text-[var(--success-text)] border border-[var(--success-border)] dark:border-[var(--success-border)] text-[10px] font-extrabold px-2 py-0.5">
                  ROTINA ATIVA
                </span>
              </h3>
              <p className="text-xs text-[var(--text-secondary)] dark:text-[var(--text-secondary)]">
                Exportações automáticas periódicas, snapshots de segurança e restauração completa
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-[var(--text-secondary)] hover:text-[var(--text-secondary)] dark:hover:text-[var(--text-primary)] rounded-lg hover:bg-[var(--bg-surface-elevated)] dark:hover:bg-[var(--bg-surface-elevated)] transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Feedback Alert Toast */}
        {feedbackMessage && (
          <div
            className={`px-4 py-2.5 text-xs font-semibold flex items-center gap-2 transition-all ${
              feedbackMessage.type === 'success'
                ? 'bg-[var(--success-bg)] dark:bg-[var(--success-bg)] text-[var(--success-text)] dark:text-[var(--success-text)] border-b border-[var(--success-border)] dark:border-[var(--success-border)]'
                : 'bg-[var(--danger-bg)] dark:bg-[var(--danger-bg)] text-[var(--danger-text)] dark:text-[var(--danger-text)] border-b border-[var(--danger-border)] dark:border-[var(--danger-border)]'
            }`}
          >
            {feedbackMessage.type === 'success' ? (
              <CheckCircle2 className="h-4 w-4 text-[var(--success-text)] dark:text-[var(--success-text)] shrink-0" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-[var(--danger-text)] dark:text-[var(--danger-text)] shrink-0" />
            )}
            <span>{feedbackMessage.text}</span>
          </div>
        )}

        {/* Quick KPI Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface-elevated)] border-b border-[var(--field-border)] dark:border-[var(--field-border)] text-xs">
          <div className="rounded-xl bg-[var(--bg-surface)] dark:bg-[var(--bg-surface-elevated)] p-3 border border-[var(--field-border)] dark:border-[var(--field-border)] shadow-2xs">
            <span className="text-[var(--text-secondary)] dark:text-[var(--text-secondary)] block font-medium">Status da Rotina</span>
            <div className="flex items-center gap-1.5 mt-1 font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
              <span
                className={`h-2 w-2 rounded-full ${
                  schedule.enabled ? 'bg-[var(--success-bg)] animate-pulse' : 'bg-[var(--bg-surface-elevated)]'
                }`}
              />
              <span>{schedule.enabled ? 'Agendado Automático' : 'Desativado'}</span>
            </div>
          </div>

          <div className="rounded-xl bg-[var(--bg-surface)] dark:bg-[var(--bg-surface-elevated)] p-3 border border-[var(--field-border)] dark:border-[var(--field-border)] shadow-2xs">
            <span className="text-[var(--text-secondary)] dark:text-[var(--text-secondary)] block font-medium">Frequência</span>
            <span className="font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)] block mt-1">
              A cada {schedule.intervalHours}h
            </span>
          </div>

          <div className="rounded-xl bg-[var(--bg-surface)] dark:bg-[var(--bg-surface-elevated)] p-3 border border-[var(--field-border)] dark:border-[var(--field-border)] shadow-2xs">
            <span className="text-[var(--text-secondary)] dark:text-[var(--text-secondary)] block font-medium">Último Backup</span>
            <span className="font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)] block mt-1">
              {schedule.lastRunAt ? formatDate(schedule.lastRunAt) : 'Nenhum ainda'}
            </span>
          </div>

          <div className="rounded-xl bg-[var(--bg-surface)] dark:bg-[var(--bg-surface-elevated)] p-3 border border-[var(--field-border)] dark:border-[var(--field-border)] shadow-2xs">
            <span className="text-[var(--text-secondary)] dark:text-[var(--text-secondary)] block font-medium">Snapshots Salvos</span>
            <span className="font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)] block mt-1">
              {snapshots.length} de {schedule.maxSnapshotsToKeep || 15}
            </span>
          </div>
        </div>

        {/* Tabs & Actions */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 pt-3 pb-2 border-b border-[var(--field-border)] dark:border-[var(--field-border)]">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('SNAPSHOTS')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${
                activeTab === 'SNAPSHOTS'
                  ? 'bg-[var(--action)] text-[var(--text-primary)] shadow-xs'
                  : 'text-[var(--text-secondary)] dark:text-[var(--text-secondary)] hover:bg-[var(--bg-surface-elevated)] dark:hover:bg-[var(--bg-surface-elevated)]'
              }`}
            >
              Snapshots de Histórico ({snapshots.length})
            </button>
            <button
              onClick={() => setActiveTab('CONFIG')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${
                activeTab === 'CONFIG'
                  ? 'bg-[var(--action)] text-[var(--text-primary)] shadow-xs'
                  : 'text-[var(--text-secondary)] dark:text-[var(--text-secondary)] hover:bg-[var(--bg-surface-elevated)] dark:hover:bg-[var(--bg-surface-elevated)]'
              }`}
            >
              Agendamento & Retenção
            </button>
            <button
              onClick={() => setActiveTab('UPLOAD')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${
                activeTab === 'UPLOAD'
                  ? 'bg-[var(--action)] text-[var(--text-primary)] shadow-xs'
                  : 'text-[var(--text-secondary)] dark:text-[var(--text-secondary)] hover:bg-[var(--bg-surface-elevated)] dark:hover:bg-[var(--bg-surface-elevated)]'
              }`}
            >
              Restaurar de Arquivo
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleRunCronCheck}
              className="flex items-center gap-1.5 rounded-lg border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface-elevated)] px-3 py-1.5 text-xs font-semibold text-[var(--text-secondary)] dark:text-[var(--text-primary)] hover:bg-[var(--bg-canvas)] dark:hover:bg-[var(--bg-surface-elevated)] transition-colors cursor-pointer"
              title="Verificar e executar agendador de backup"
            >
              <Play className="h-3.5 w-3.5 text-[var(--success-text)] dark:text-[var(--success-text)]" />
              <span>Executar Rotina</span>
            </button>

            <button
              onClick={handleManualBackup}
              className="flex items-center gap-1.5 rounded-lg bg-[var(--success-bg)] hover:bg-[var(--success-bg)] px-3 py-1.5 text-xs font-bold text-[var(--success-text)]  transition-colors"
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span>Fazer Backup Agora</span>
            </button>
          </div>
        </div>

        {/* Body Content */}
        <div className="flex-1 overflow-y-auto p-4 min-h-[300px]">
          {activeTab === 'SNAPSHOTS' && (
            <div className="space-y-3">
              {snapshots.length === 0 ? (
                <div className="py-16 text-center text-[var(--text-secondary)] dark:text-[var(--text-secondary)] space-y-2">
                  <Database className="h-10 w-10 mx-auto text-[var(--text-primary)] dark:text-[var(--text-secondary)]" />
                  <p className="text-xs font-semibold">Nenhum snapshot de backup registrado ainda.</p>
                  <p className="text-[11px]">
                    Clique em "Fazer Backup Agora" para criar seu primeiro ponto de restauração.
                  </p>
                </div>
              ) : (
                <div className="overflow-hidden rounded-xl border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface-elevated)] shadow-2xs">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface-elevated)] text-[11px] font-bold uppercase tracking-wider text-[var(--text-secondary)] dark:text-[var(--text-secondary)] border-b border-[var(--field-border)] dark:border-[var(--field-border)]">
                      <tr>
                        <th className="px-3.5 py-3">Tipo / Data</th>
                        <th className="px-3.5 py-3">Nome do Arquivo</th>
                        <th className="px-3.5 py-3">Tamanho</th>
                        <th className="px-3.5 py-3">Estatísticas</th>
                        <th className="px-3.5 py-3">Criado Por</th>
                        <th className="px-3.5 py-3 text-center">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--field-border)] dark:divide-[var(--field-border)] font-medium">
                      {snapshots.map(snap => (
                        <tr
                          key={snap.id}
                          className="hover:bg-[var(--bg-canvas)] dark:hover:bg-[var(--bg-surface-elevated)] transition-colors"
                        >
                          <td className="px-3.5 py-3">
                            <div className="flex items-center gap-2">
                              <span
                                className={`rounded px-1.5 py-0.5 text-[9px] font-extrabold uppercase border ${
                                  snap.type === 'AUTOMATICO_CRON'
                                    ? 'bg-[var(--info-bg)] dark:bg-[var(--info-bg)] text-[var(--link)] dark:text-[var(--link)] border-[var(--field-border)] dark:border-[var(--field-border)]'
                                    : 'bg-[var(--info-bg)] dark:bg-[var(--info-bg)] text-[var(--link)] dark:text-[var(--link)] border-[var(--field-border)] dark:border-[var(--field-border)]'
                                }`}
                              >
                                {snap.type === 'AUTOMATICO_CRON' ? 'Rotina Automática' : 'Manual'}
                              </span>
                              <span className="text-[var(--text-secondary)] dark:text-[var(--text-primary)] font-bold">
                                {formatDate(snap.createdAt)}
                              </span>
                            </div>
                          </td>

                          <td className="px-3.5 py-3 font-mono text-[11px] text-[var(--text-secondary)] dark:text-[var(--text-primary)] truncate max-w-[180px]">
                            {snap.fileName}
                          </td>

                          <td className="px-3.5 py-3 text-[var(--text-secondary)] dark:text-[var(--text-primary)] font-mono">
                            {(snap.fileSizeBytes / 1024).toFixed(1)} KB
                          </td>

                          <td className="px-3.5 py-3">
                            <span className="text-[11px] text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
                              {snap.stats.proposalsCount} propostas, {snap.stats.clientsCount} clientes
                            </span>
                          </td>

                          <td className="px-3.5 py-3 text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
                            {snap.createdByUserName}
                          </td>

                          <td className="px-3.5 py-3 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                onClick={() => BackupService.downloadBackupAsFile(snap)}
                                className="p-1.5 rounded-lg border border-[var(--field-border)] dark:border-[var(--field-border)] text-[var(--text-secondary)] dark:text-[var(--text-primary)] hover:bg-[var(--bg-surface-elevated)] dark:hover:bg-[var(--bg-surface-elevated)] hover:text-[var(--link)]"
                                title="Baixar arquivo .json"
                              >
                                <Download className="h-3.5 w-3.5" />
                              </button>

                              <button
                                onClick={() =>
                                  setRestoreModalConfig({
                                    isOpen: true,
                                    dataDump: snap.dataDump,
                                    snapshotName: `Snapshot de ${formatDate(snap.createdAt)} (${snap.stats.proposalsCount} propostas)`,
                                  })
                                }
                                className="p-1.5 rounded-lg border border-[var(--warning-border)] dark:border-[var(--warning-border)] bg-[var(--warning-bg)] dark:bg-[var(--warning-bg)] text-[var(--warning-text)] dark:text-[var(--warning-text)] hover:bg-[var(--warning-bg)] dark:hover:bg-[var(--warning-bg)]"
                                title="Restaurar este backup"
                              >
                                <RotateCcw className="h-3.5 w-3.5" />
                              </button>

                              <button
                                onClick={() =>
                                  setDeleteModalConfig({
                                    isOpen: true,
                                    snapshotId: snap.id,
                                    snapshotName: snap.fileName,
                                  })
                                }
                                className="p-1.5 rounded-lg border border-[var(--field-border)] dark:border-[var(--field-border)] text-[var(--text-secondary)] hover:text-[var(--danger-text)] hover:bg-[var(--danger-bg)] dark:hover:bg-[var(--danger-bg)]"
                                title="Excluir snapshot"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {activeTab === 'CONFIG' && (
            <div className="max-w-xl mx-auto space-y-5 py-4">
              <div className="rounded-xl border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface-elevated)] p-5 space-y-4">
                <h4 className="text-sm font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
                  Parâmetros de Agendamento Automático
                </h4>

                <div className="space-y-3">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={schedule.enabled}
                      onChange={e => handleUpdateSchedule({ enabled: e.target.checked })}
                      className="h-4 w-4 rounded border-[var(--field-border)] text-[var(--link)] focus:ring-[var(--focus)]"
                    />
                    <span className="text-xs font-semibold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
                      Habilitar exportações periódicas de backup em segundo plano
                    </span>
                  </label>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                    <div>
                      <label className="block text-xs font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)] mb-1">
                        Frequência de Backup
                      </label>
                      <select
                        value={schedule.intervalHours}
                        onChange={e =>
                          handleUpdateSchedule({ intervalHours: parseFloat(e.target.value) })
                        }
                        className="w-full rounded-xl border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] px-3 py-2 text-xs font-semibold text-[var(--text-secondary)] dark:text-[var(--text-primary)]"
                      >
                        <option value={0.5}>A cada 30 minutos (Alta frequência)</option>
                        <option value={1}>A cada 1 hora</option>
                        <option value={3}>A cada 3 horas</option>
                        <option value={6}>A cada 6 horas (Recomendado)</option>
                        <option value={12}>A cada 12 horas</option>
                        <option value={24}>Diariamente (A cada 24h)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)] mb-1">
                        Limite de Retenção
                      </label>
                      <select
                        value={schedule.maxSnapshotsToKeep || 15}
                        onChange={e =>
                          handleUpdateSchedule({ maxSnapshotsToKeep: parseInt(e.target.value, 10) })
                        }
                        className="w-full rounded-xl border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] px-3 py-2 text-xs font-semibold text-[var(--text-secondary)] dark:text-[var(--text-primary)]"
                      >
                        <option value={5}>Manter últimos 5 backups</option>
                        <option value={10}>Manter últimos 10 backups</option>
                        <option value={15}>Manter últimos 15 backups (Padrão)</option>
                        <option value={30}>Manter últimos 30 backups</option>
                        <option value={50}>Manter últimos 50 backups</option>
                      </select>
                    </div>
                  </div>

                  <div className="pt-2">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={schedule.autoDownload}
                        onChange={e => handleUpdateSchedule({ autoDownload: e.target.checked })}
                        className="h-4 w-4 rounded border-[var(--field-border)] text-[var(--link)] focus:ring-[var(--focus)]"
                      />
                      <span className="text-xs text-[var(--text-secondary)] dark:text-[var(--text-secondary)]">
                        Baixar automaticamente arquivo .json no navegador ao executar backup
                      </span>
                    </label>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'UPLOAD' && (
            <div className="max-w-xl mx-auto space-y-4 py-4">
              <div className="rounded-2xl border-2 border-dashed border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface-elevated)] p-8 text-center space-y-3">
                <FileJson className="h-12 w-12 mx-auto text-[var(--link)]" />
                <h4 className="text-sm font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
                  Carregar Arquivo de Backup (.json)
                </h4>
                <p className="text-xs text-[var(--text-secondary)] dark:text-[var(--text-secondary)] max-w-sm mx-auto">
                  Selecione um arquivo de backup previamente exportado pelo sistema para inspecionar e
                  restaurar toda a base de dados.
                </p>

                <div className="pt-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".json"
                    onChange={handleFileUpload}
                    className="hidden"
                    id="backup-file-upload-input"
                  />
                  <label
                    htmlFor="backup-file-upload-input"
                    className="inline-flex items-center gap-2 rounded-xl bg-[var(--info-bg)] hover:bg-[var(--info-bg)] px-4 py-2.5 text-xs font-bold text-[var(--text-primary)]  cursor-pointer transition-colors"
                  >
                    <Upload className="h-4 w-4" />
                    <span>Selecionar Arquivo JSON</span>
                  </label>
                </div>
              </div>

              <div className="rounded-xl border border-[var(--warning-border)] dark:border-[var(--warning-border)] bg-[var(--warning-bg)] dark:bg-[var(--warning-bg)] p-3.5 text-xs text-[var(--warning-text)] dark:text-[var(--warning-text)] flex items-start gap-2.5">
                <ShieldCheck className="h-4 w-4 text-[var(--warning-text)] shrink-0 mt-0.5" />
                <p>
                  <strong>Segurança Garantida:</strong> Antes de qualquer restauração, o sistema cria
                  automaticamente um snapshot emergencial do estado atual, permitindo desfazer se
                  necessário.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface-elevated)] flex items-center justify-between">
          <button
            onClick={() => BackupService.downloadBackupAsFile()}
            className="flex items-center gap-1.5 rounded-xl border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface-elevated)] px-3.5 py-2 text-xs font-semibold text-[var(--text-secondary)] dark:text-[var(--text-primary)] hover:bg-[var(--bg-canvas)] dark:hover:bg-[var(--bg-surface-elevated)]"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Baixar Base Atual Completa</span>
          </button>

          <button
            onClick={onClose}
            className="rounded-xl bg-[var(--bg-surface)] dark:bg-[var(--bg-surface-elevated)] hover:bg-[var(--bg-surface-elevated)] px-4 py-2 text-xs font-bold text-[var(--text-primary)] dark:text-[var(--text-secondary)]"
          >
            Fechar
          </button>
        </div>
      </div>

      {/* Confirmation Modal for Database Restore */}
      {restoreModalConfig.isOpen && (
        <UniversalConfirmationModal
          isOpen={restoreModalConfig.isOpen}
          onClose={() => setRestoreModalConfig({ isOpen: false })}
          onConfirm={handleConfirmRestore}
          title="Confirmar Restauração Completa do Banco"
          message="Atenção: A restauração substituirá os registros atuais pelo conteúdo do snapshot selecionado."
          severity="danger"
          requiredConfirmationText="RESTAURAR"
          impactWarning="Um snapshot emergencial dos dados atuais será criado antes da substituição."
          itemDetails={[
            {
              label: 'Origem do Backup',
              value: restoreModalConfig.snapshotName || 'Arquivo',
              badge: 'RESTORE',
            },
          ]}
          confirmButtonText="Restaurar Banco de Dados"
        />
      )}

      {/* Confirmation Modal for Snapshot Deletion */}
      {deleteModalConfig.isOpen && (
        <UniversalConfirmationModal
          isOpen={deleteModalConfig.isOpen}
          onClose={() => setDeleteModalConfig({ isOpen: false })}
          onConfirm={handleConfirmDelete}
          title="Excluir Snapshot de Backup"
          message="Deseja remover este snapshot de backup do histórico de armazenamento local?"
          severity="danger"
          requiredConfirmationText="EXCLUIR"
          itemDetails={[
            {
              label: 'Arquivo',
              value: deleteModalConfig.snapshotName || 'Snapshot',
            },
          ]}
          confirmButtonText="Excluir Snapshot"
        />
      )}
    </div>
  );
};
