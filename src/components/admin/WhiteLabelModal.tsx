import React, { useState } from 'react';
import {
  Shield,
  Palette,
  Upload,
  Download,
  Building2,
  Phone,
  Mail,
  CheckCircle2,
  X,
  RotateCcw,
  Sparkles,
  Globe,
} from 'lucide-react';
import { StorageService } from '../../services/storageService';
import { WhiteLabelConfig } from '../../types';
import { DomainManagement } from './DomainManagement';

interface WhiteLabelModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const WhiteLabelModal: React.FC<WhiteLabelModalProps> = ({ isOpen, onClose }) => {
  const currentWl = StorageService.getWhiteLabel();
  const [activeTab, setActiveTab] = useState<'branding' | 'domains'>('branding');

  const [companyName, setCompanyName] = useState(currentWl.companyName || 'SENTINEL CONSIG');
  const [tradeName, setTradeName] = useState(currentWl.tradeName || 'Plataforma de Gestão de Crédito Consignado');
  const [cnpj, setCnpj] = useState(currentWl.cnpj || '');
  const [logoUrl, setLogoUrl] = useState(currentWl.logoUrl || '/branding/sentinel-consig-logo-transparent.png');
  const [primaryColor, setPrimaryColor] = useState(currentWl.primaryColor || '#2563eb');
  const [supportEmail, setSupportEmail] = useState(currentWl.supportEmail || 'suporte@sentinelconsig.com.br');
  const [supportPhone, setSupportPhone] = useState(currentWl.supportPhone || '');
  const [footerText, setFooterText] = useState(currentWl.footerText || 'SENTINEL CONSIG © 2026 - Central de Produção de Consignado');

  const [savedSuccess, setSavedSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleLogoFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    // Only accept PNG, JPG/JPEG, WebP
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setErrorMsg('Formato inválido. Use PNG, JPG ou WebP.');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setErrorMsg('A imagem do logo deve ter no máximo 2MB.');
      return;
    }
    
    setIsSubmitting(true);
    const reader = new FileReader();
    reader.onload = async evt => {
      if (evt.target?.result) {
        const fileBase64 = evt.target.result as string;
        try {
          const res = await fetch('/api/upload/logo', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              fileBase64,
              mimeType: file.type,
              fileName: file.name,
              targetTenantId: currentWl.tenantId
            })
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Falha ao enviar arquivo');
          
          setLogoUrl(data.logoUrl);
          setErrorMsg(null);
        } catch (err: any) {
          setErrorMsg(err.message);
        } finally {
          setIsSubmitting(false);
        }
      }
    };
    reader.readAsDataURL(file);
  };

  if (!isOpen) return null;

  const handleSave = async () => {
    if (!companyName.trim()) {
      setErrorMsg('Informe o nome principal da promotora / empresa.');
      return;
    }

    try {
      const updated: WhiteLabelConfig = {
        companyName: companyName.trim(),
        tradeName: tradeName.trim() || undefined,
        cnpj: cnpj.trim() || undefined,
        logoUrl: logoUrl.trim() || undefined,
        primaryColor,
        supportEmail: supportEmail.trim() || undefined,
        supportPhone: supportPhone.trim() || undefined,
        footerText: footerText.trim() || undefined,
      };

      StorageService.updateWhiteLabel(updated);

      // Persist to PostgreSQL backend
      await fetch('/api/whitelabel', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyName: companyName.trim(),
          tradeName: tradeName.trim() || null,
          cnpj: cnpj.trim() || null,
          logoUrl: logoUrl.trim() || null,
          primaryColor,
          secondaryColor: primaryColor,
          accentColor: primaryColor,
          supportEmail: supportEmail.trim() || null,
          supportPhone: supportPhone.trim() || null,
          footerText: footerText.trim() || null,
        }),
      }).catch(err => console.warn('[WHITELABEL] Erro ao sincronizar com backend:', err));

      setSavedSuccess(true);
      setErrorMsg(null);

      window.dispatchEvent(new Event('whiteLabelUpdated'));
      window.dispatchEvent(new Event('storage'));

      setTimeout(() => {
        setSavedSuccess(false);
        onClose();
      }, 1000);
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao salvar configurações White-Label.');
    }
  };

  const handleExportJson = () => {
    const data = StorageService.getWhiteLabel();
    const jsonStr = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `whitelabel_config_${data.companyName.toLowerCase().replace(/\s+/g, '_')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = evt => {
      try {
        const parsed = JSON.parse(evt.target?.result as string);
        if (parsed.companyName) {
          setCompanyName(parsed.companyName || '');
          setTradeName(parsed.tradeName || '');
          setCnpj(parsed.cnpj || '');
          setLogoUrl(parsed.logoUrl || '');
          setPrimaryColor(parsed.primaryColor || '#2563eb');
          setSupportEmail(parsed.supportEmail || '');
          setSupportPhone(parsed.supportPhone || '');
          setFooterText(parsed.footerText || '');
          setErrorMsg(null);
        } else {
          setErrorMsg('Arquivo JSON inválido para configuração White-Label.');
        }
      } catch (err) {
        setErrorMsg('Erro ao ler arquivo JSON.');
      }
    };
    reader.readAsText(file);
  };

  const handleResetDefault = () => {
    setCompanyName('SENTINEL CONSIG');
    setTradeName('Plataforma de Gestão de Crédito Consignado');
    setCnpj('');
    setLogoUrl('/branding/sentinel-consig-logo-transparent.png');
    setPrimaryColor('#2563eb');
    setSupportEmail('suporte@sentinelconsig.com.br');
    setSupportPhone('');
    setFooterText('SENTINEL CONSIG © 2026 - Central de Produção de Consignado');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs animate-in fade-in">
      <div className="relative w-full max-w-2xl rounded-2xl bg-white dark:bg-slate-900 shadow-2xl border border-slate-200 dark:border-slate-800 p-6 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-blue-100 dark:bg-blue-950/60 flex items-center justify-center text-blue-600 dark:text-blue-400">
              <Palette className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <span>Personalização White-Label</span>
                <span className="px-2 py-0.5 text-[10px] font-extrabold uppercase bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded-full">
                  Multi-Promotora
                </span>
              </h2>
              <p className="text-xs text-slate-500">
                Configure a identidade da promotora para vender ou licenciar o sistema de forma independente.
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

        {savedSuccess && (
          <div className="my-3 p-3 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 rounded-lg flex items-center gap-2 text-emerald-800 dark:text-emerald-200 text-xs font-semibold animate-in fade-in">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
            Configurações White-Label salvas! O sistema agora é personalizado para {companyName}.
          </div>
        )}

        {errorMsg && (
          <div className="my-3 p-3 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 rounded-lg text-rose-800 dark:text-rose-200 text-xs font-semibold">
            {errorMsg}
          </div>
        )}

        {/* Tabs Navigation */}
        <div className="flex border-b border-slate-100 dark:border-slate-800 mb-4 mt-2">
          <button
            type="button"
            onClick={() => setActiveTab('branding')}
            className={`flex items-center gap-2 px-4 py-2 border-b-2 text-xs font-bold transition-all ${
              activeTab === 'branding'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            <Palette className="h-4 w-4" />
            Identidade Visual
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('domains')}
            className={`flex items-center gap-2 px-4 py-2 border-b-2 text-xs font-bold transition-all ${
              activeTab === 'domains'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            <Globe className="h-4 w-4" />
            Domínios Customizados
          </button>
        </div>

        {activeTab === 'branding' && (
          <div className="space-y-4 my-4">
          {/* Company Name & Trade Name */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Nome do Sistema / Empresa *
              </label>
              <div className="relative">
                <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  value={companyName}
                  onChange={e => setCompanyName(e.target.value)}
                  placeholder="Ex: ALPHA CRÉDITO"
                  className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-bold text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Subtítulo / Nome Fantasia
              </label>
              <input
                type="text"
                value={tradeName}
                onChange={e => setTradeName(e.target.value)}
                placeholder="Ex: Promotora de Consignado Inteligente"
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* CNPJ & Logo URL */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                CNPJ da Promotora
              </label>
              <input
                type="text"
                value={cnpj}
                onChange={e => setCnpj(e.target.value)}
                placeholder="00.000.000/0001-00"
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-mono text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Logo do Cliente (URL ou Arquivo do Computador)
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={logoUrl}
                  onChange={e => setLogoUrl(e.target.value)}
                  placeholder="https://exemplo.com/logo.png"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500"
                />
                <label className="px-3 py-2 bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 dark:hover:bg-blue-900/80 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer shrink-0 transition-colors shadow-2xs">
                  <Upload className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                  <span>Enviar Logo</span>
                  <input
                    type="file"
                    accept="image/png, image/jpeg, image/webp"
                    onChange={handleLogoFileUpload}
                    className="hidden"
                  />
                </label>
              </div>
            </div>
          </div>

          {/* Color & Contacts */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Cor Primária da Marca
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={primaryColor}
                  onChange={e => setPrimaryColor(e.target.value)}
                  className="h-9 w-12 rounded border border-slate-200 dark:border-slate-700 cursor-pointer p-0.5 bg-white dark:bg-slate-800"
                />
                <input
                  type="text"
                  value={primaryColor}
                  onChange={e => setPrimaryColor(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-mono uppercase text-slate-900 dark:text-slate-100"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                E-mail de Suporte
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                <input
                  type="email"
                  value={supportEmail}
                  onChange={e => setSupportEmail(e.target.value)}
                  placeholder="suporte@promotora.com.br"
                  className="w-full pl-8 pr-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-900 dark:text-slate-100"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Telefone de Suporte
              </label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                <input
                  type="text"
                  value={supportPhone}
                  onChange={e => setSupportPhone(e.target.value)}
                  placeholder="(11) 99999-0000"
                  className="w-full pl-8 pr-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-900 dark:text-slate-100"
                />
              </div>
            </div>
          </div>

          {/* Footer text */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              Texto de Rodapé da Aplicação
            </label>
            <input
              type="text"
              value={footerText}
              onChange={e => setFooterText(e.target.value)}
              placeholder="Ex: Alpha Crédito © 2026 - Todos os direitos reservados."
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-900 dark:text-slate-100"
            />
          </div>

          {/* Preview Box */}
          <div className="p-4 bg-slate-100 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2">
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-blue-500" />
              <span>Pré-visualização do Topo (Header)</span>
            </div>
            <div className="p-3 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                {logoUrl ? (
                  <img src={logoUrl} alt="Logo" className="h-8 w-8 object-contain" />
                ) : (
                  <div className="h-8 w-8 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold text-xs">
                    {companyName.slice(0, 2).toUpperCase()}
                  </div>
                )}
                <div>
                  <span className="text-xs font-black tracking-wider text-slate-900 dark:text-white block">
                    {companyName || 'NOME DA PROMOTORA'}
                  </span>
                  <span className="text-[9px] font-extrabold text-blue-600 dark:text-blue-400 tracking-widest uppercase block">
                    {tradeName || 'SISTEMA DE CRÉDITO'}
                  </span>
                </div>
              </div>
              <span className="text-[10px] text-slate-400 font-mono">
                {cnpj || 'CNPJ NÃO INFORMADO'}
              </span>
            </div>
          </div>

          {/* Import / Export JSON section */}
          <div className="p-3 bg-blue-50/60 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/60 rounded-xl flex items-center justify-between gap-3">
            <div>
              <div className="text-xs font-bold text-blue-900 dark:text-blue-200">
                Licenciamento & Pacote de Marca (.JSON)
              </div>
              <div className="text-[11px] text-blue-700 dark:text-blue-300">
                Exporte o perfil de marca para entregar o sistema pré-configurado para outra promotora.
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <label className="px-3 py-1.5 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-600 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-xs">
                <Upload className="h-3.5 w-3.5 text-blue-600" />
                <span>Importar</span>
                <input type="file" accept=".json" onChange={handleImportJson} className="hidden" />
              </label>

              <button
                type="button"
                onClick={handleExportJson}
                className="px-3 py-1.5 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-600 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                <Download className="h-3.5 w-3.5 text-emerald-600" />
                <span>Exportar</span>
              </button>
            </div>
          </div>
        </div>
      )}

        {activeTab === 'domains' && (
          <div className="my-4 animate-in fade-in duration-200">
            <DomainManagement />
          </div>
        )}

        {/* Footer Actions */}
        {activeTab === 'branding' && (
          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={handleResetDefault}
              className="px-3 py-2 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Restaurar Padrão</span>
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold rounded-lg cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSave}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg shadow-sm cursor-pointer transition-all flex items-center gap-1.5"
              >
                <CheckCircle2 className="h-4 w-4" />
                <span>Aplicar White-Label</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
