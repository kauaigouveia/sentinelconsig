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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="relative w-full max-w-4xl rounded-2xl bg-white dark:bg-slate-900 shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col max-h-[90vh] overflow-hidden transition-colors">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-xs">
              <Database className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <span>Backup & Segurança do Banco de Dados</span>
                <span className="rounded-full bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 text-[10px] font-extrabold px-2 py-0.5">
                  ROTINA ATIVA
                </span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Exportações automáticas periódicas, snapshots de segurança e restauração completa
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Feedback Alert Toast */}
        {feedbackMessage && (
          <div
            className={`px-4 py-2.5 text-xs font-semibold flex items-center gap-2 transition-all ${
              feedbackMessage.type === 'success'
                ? 'bg-emerald-50 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-200 border-b border-emerald-200 dark:border-emerald-800'
                : 'bg-rose-50 dark:bg-rose-950/80 text-rose-800 dark:text-rose-200 border-b border-rose-200 dark:border-rose-800'
            }`}
          >
            {feedbackMessage.type === 'success' ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-rose-600 dark:text-rose-400 shrink-0" />
            )}
            <span>{feedbackMessage.text}</span>
          </div>
        )}

        {/* Quick KPI Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 bg-slate-50/70 dark:bg-slate-800/40 border-b border-slate-100 dark:border-slate-800 text-xs">
          <div className="rounded-xl bg-white dark:bg-slate-800 p-3 border border-slate-200 dark:border-slate-700 shadow-2xs">
            <span className="text-slate-500 dark:text-slate-400 block font-medium">Status da Rotina</span>
            <div className="flex items-center gap-1.5 mt-1 font-bold text-slate-900 dark:text-slate-100">
              <span
                className={`h-2 w-2 rounded-full ${
                  schedule.enabled ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'
                }`}
              />
              <span>{schedule.enabled ? 'Agendado Automático' : 'Desativado'}</span>
            </div>
          </div>

          <div className="rounded-xl bg-white dark:bg-slate-800 p-3 border border-slate-200 dark:border-slate-700 shadow-2xs">
            <span className="text-slate-500 dark:text-slate-400 block font-medium">Frequência</span>
            <span className="font-bold text-slate-900 dark:text-slate-100 block mt-1">
              A cada {schedule.intervalHours}h
            </span>
          </div>

          <div className="rounded-xl bg-white dark:bg-slate-800 p-3 border border-slate-200 dark:border-slate-700 shadow-2xs">
            <span className="text-slate-500 dark:text-slate-400 block font-medium">Último Backup</span>
            <span className="font-bold text-slate-900 dark:text-slate-100 block mt-1">
              {schedule.lastRunAt ? formatDate(schedule.lastRunAt) : 'Nenhum ainda'}
            </span>
          </div>

          <div className="rounded-xl bg-white dark:bg-slate-800 p-3 border border-slate-200 dark:border-slate-700 shadow-2xs">
            <span className="text-slate-500 dark:text-slate-400 block font-medium">Snapshots Salvos</span>
            <span className="font-bold text-slate-900 dark:text-slate-100 block mt-1">
              {snapshots.length} de {schedule.maxSnapshotsToKeep || 15}
            </span>
          </div>
        </div>

        {/* Tabs & Actions */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 pt-3 pb-2 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('SNAPSHOTS')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${
                activeTab === 'SNAPSHOTS'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              Snapshots de Histórico ({snapshots.length})
            </button>
            <button
              onClick={() => setActiveTab('CONFIG')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${
                activeTab === 'CONFIG'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              Agendamento & Retenção
            </button>
            <button
              onClick={() => setActiveTab('UPLOAD')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${
                activeTab === 'UPLOAD'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              Restaurar de Arquivo
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleRunCronCheck}
              className="flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors cursor-pointer"
              title="Verificar e executar agendador de backup"
            >
              <Play className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>Executar Rotina</span>
            </button>

            <button
              onClick={handleManualBackup}
              className="flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 text-xs font-bold text-white shadow-xs transition-colors"
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
                <div className="py-16 text-center text-slate-400 dark:text-slate-500 space-y-2">
                  <Database className="h-10 w-10 mx-auto text-slate-300 dark:text-slate-600" />
                  <p className="text-xs font-semibold">Nenhum snapshot de backup registrado ainda.</p>
                  <p className="text-[11px]">
                    Clique em "Fazer Backup Agora" para criar seu primeiro ponto de restauração.
                  </p>
                </div>
              ) : (
                <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/70 shadow-2xs">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 dark:bg-slate-800 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">
                      <tr>
                        <th className="px-3.5 py-3">Tipo / Data</th>
                        <th className="px-3.5 py-3">Nome do Arquivo</th>
                        <th className="px-3.5 py-3">Tamanho</th>
                        <th className="px-3.5 py-3">Estatísticas</th>
                        <th className="px-3.5 py-3">Criado Por</th>
                        <th className="px-3.5 py-3 text-center">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium">
                      {snapshots.map(snap => (
                        <tr
                          key={snap.id}
                          className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors"
                        >
                          <td className="px-3.5 py-3">
                            <div className="flex items-center gap-2">
                              <span
                                className={`rounded px-1.5 py-0.5 text-[9px] font-extrabold uppercase border ${
                                  snap.type === 'AUTOMATICO_CRON'
                                    ? 'bg-blue-50 dark:bg-blue-950/70 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800'
                                    : 'bg-purple-50 dark:bg-purple-950/70 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800'
                                }`}
                              >
                                {snap.type === 'AUTOMATICO_CRON' ? 'Rotina Automática' : 'Manual'}
                              </span>
                              <span className="text-slate-900 dark:text-slate-100 font-bold">
                                {formatDate(snap.createdAt)}
                              </span>
                            </div>
                          </td>

                          <td className="px-3.5 py-3 font-mono text-[11px] text-slate-600 dark:text-slate-300 truncate max-w-[180px]">
                            {snap.fileName}
                          </td>

                          <td className="px-3.5 py-3 text-slate-700 dark:text-slate-300 font-mono">
                            {(snap.fileSizeBytes / 1024).toFixed(1)} KB
                          </td>

                          <td className="px-3.5 py-3">
                            <span className="text-[11px] text-slate-600 dark:text-slate-300">
                              {snap.stats.proposalsCount} propostas, {snap.stats.clientsCount} clientes
                            </span>
                          </td>

                          <td className="px-3.5 py-3 text-slate-600 dark:text-slate-300">
                            {snap.createdByUserName}
                          </td>

                          <td className="px-3.5 py-3 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                onClick={() => BackupService.downloadBackupAsFile(snap)}
                                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-blue-600"
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
                                className="p-1.5 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/50"
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
                                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950"
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
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800 p-5 space-y-4">
                <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  Parâmetros de Agendamento Automático
                </h4>

                <div className="space-y-3">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={schedule.enabled}
                      onChange={e => handleUpdateSchedule({ enabled: e.target.checked })}
                      className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                      Habilitar exportações periódicas de backup em segundo plano
                    </span>
                  </label>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                        Frequência de Backup
                      </label>
                      <select
                        value={schedule.intervalHours}
                        onChange={e =>
                          handleUpdateSchedule({ intervalHours: parseFloat(e.target.value) })
                        }
                        className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-900 dark:text-slate-100"
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
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                        Limite de Retenção
                      </label>
                      <select
                        value={schedule.maxSnapshotsToKeep || 15}
                        onChange={e =>
                          handleUpdateSchedule({ maxSnapshotsToKeep: parseInt(e.target.value, 10) })
                        }
                        className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-900 dark:text-slate-100"
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
                        className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-xs text-slate-600 dark:text-slate-400">
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
              <div className="rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-8 text-center space-y-3">
                <FileJson className="h-12 w-12 mx-auto text-blue-500" />
                <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  Carregar Arquivo de Backup (.json)
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
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
                    className="inline-flex items-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-700 px-4 py-2.5 text-xs font-bold text-white shadow-xs cursor-pointer transition-colors"
                  >
                    <Upload className="h-4 w-4" />
                    <span>Selecionar Arquivo JSON</span>
                  </label>
                </div>
              </div>

              <div className="rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/30 p-3.5 text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2.5">
                <ShieldCheck className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
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
        <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50 flex items-center justify-between">
          <button
            onClick={() => BackupService.downloadBackupAsFile()}
            className="flex items-center gap-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Baixar Base Atual Completa</span>
          </button>

          <button
            onClick={onClose}
            className="rounded-xl bg-slate-900 dark:bg-slate-100 hover:bg-slate-800 px-4 py-2 text-xs font-bold text-white dark:text-slate-900"
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
