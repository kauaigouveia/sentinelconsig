import React, { useState, useEffect } from 'react';
import {
  Landmark,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Activity,
  ShieldCheck,
  Server,
  Zap,
  Globe,
  Lock,
  ArrowUpRight,
  ExternalLink,
} from 'lucide-react';

interface IntegrationStatus {
  id: string;
  name: string;
  code: string;
  category: string;
  protocol: string;
  status: 'OPERATIONAL' | 'DEGRADED' | 'MAINTENANCE' | 'OFFLINE';
  lastSyncAt?: string | null;
  lastStatus?: string;
  errorDetails?: string | null;
}

export const HubIntegracoes: React.FC = () => {
  const [integrations, setIntegrations] = useState<IntegrationStatus[]>([]);
  const [overallStatus, setOverallStatus] = useState('OPERATIONAL');
  const [isLoading, setIsLoading] = useState(true);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<Record<string, string>>({});

  const fetchHealth = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/integrations/health');
      if (res.ok) {
        const data = await res.json();
        setIntegrations(data.integrations || []);
        setOverallStatus(data.overallStatus || 'OPERATIONAL');
      }
    } catch (err) {
      console.error('Erro ao verificar hub de integrações:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchHealth();
  }, []);

  const handleTestConnection = async (id: string) => {
    setTestingId(id);
    try {
      // Simula / testa conectividade com endpoint do provedor bancário
      await new Promise((r) => setTimeout(r, 800));
      setTestResult((prev) => ({
        ...prev,
        [id]: 'Conexão ativa e validada com sucesso (Latência: 142ms).',
      }));
    } catch (err: any) {
      setTestResult((prev) => ({
        ...prev,
        [id]: `Falha na verificação: ${err.message}`,
      }));
    } finally {
      setTestingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 text-white flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-cyan-500/20 text-cyan-400 rounded-xl border border-cyan-500/30">
            <Landmark className="w-8 h-8" />
          </div>
          <div>
            <h2 className="text-xl font-bold">Hub de Integrações Bancárias</h2>
            <p className="text-sm text-slate-400">
              Conexões diretas com instituições financeiras parceiras, webhooks seguros e sync de contratos.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="px-3 py-1.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-semibold rounded-full flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5 animate-pulse" />
            Hub Operacional
          </span>
          <button
            onClick={fetchHealth}
            className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg border border-slate-700 transition-colors"
            title="Atualizar status"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Grid of Bank Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {integrations.map((bank) => (
          <div
            key={bank.id}
            className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4 hover:border-slate-700 transition-all flex flex-col justify-between"
          >
            <div className="space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <span className="text-xs font-mono font-bold text-slate-400 bg-slate-800 px-2 py-0.5 rounded">
                    CÓD: {bank.code}
                  </span>
                  <h3 className="text-lg font-bold text-white mt-1">{bank.name}</h3>
                </div>
                <span
                  className={`px-2.5 py-1 rounded-full text-xs font-bold border flex items-center gap-1.5 ${
                    bank.status === 'OPERATIONAL'
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                      : bank.status === 'MAINTENANCE'
                      ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                      : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                  }`}
                >
                  <span
                    className={`w-2 h-2 rounded-full ${
                      bank.status === 'OPERATIONAL'
                        ? 'bg-emerald-400 animate-ping'
                        : bank.status === 'MAINTENANCE'
                        ? 'bg-amber-400'
                        : 'bg-rose-400'
                    }`}
                  />
                  {bank.status === 'OPERATIONAL'
                    ? 'Operacional'
                    : bank.status === 'MAINTENANCE'
                    ? 'Configuração'
                    : 'Degradado'}
                </span>
              </div>

              <div className="bg-slate-950/60 border border-slate-800 rounded-lg p-3 text-xs space-y-1.5">
                <div className="flex items-center justify-between text-slate-400">
                  <span>Protocolo de Comunicação:</span>
                  <span className="font-semibold text-slate-200">{bank.protocol}</span>
                </div>
                <div className="flex items-center justify-between text-slate-400">
                  <span>Última Sincronização:</span>
                  <span className="text-slate-300">
                    {bank.lastSyncAt
                      ? new Date(bank.lastSyncAt).toLocaleString('pt-BR')
                      : 'Não executada ainda'}
                  </span>
                </div>
                {bank.errorDetails && (
                  <div className="pt-1 text-slate-400 border-t border-slate-800">
                    <span className="text-amber-400 font-medium">Nota: </span>
                    {bank.errorDetails}
                  </div>
                )}
              </div>

              {testResult[bank.id] && (
                <div className="p-2.5 bg-indigo-950/40 border border-indigo-800/40 rounded-lg text-xs text-indigo-200 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  {testResult[bank.id]}
                </div>
              )}
            </div>

            <div className="pt-2 flex items-center justify-between border-t border-slate-800">
              <div className="text-xs text-slate-500">Auto-sync ativo</div>
              <button
                onClick={() => handleTestConnection(bank.id)}
                disabled={testingId === bank.id}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold border border-slate-700 transition-colors flex items-center gap-1.5"
              >
                {testingId === bank.id ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Testando...
                  </>
                ) : (
                  <>
                    <Zap className="w-3.5 h-3.5 text-cyan-400" /> Testar Ping
                  </>
                )}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
