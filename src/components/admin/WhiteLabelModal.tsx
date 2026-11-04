import {configurationColorValues} from '../../data/configurationColorValues';
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
  const [logoUrl, setLogoUrl] = useState(currentWl.logoUrl || '/branding/sentinel-symbol-v5.png');
  const [primaryColor, setPrimaryColor] = useState(currentWl.primaryColor || configurationColorValues.color_2563eb);
  const [supportEmail, setSupportEmail] = useState(currentWl.supportEmail || 'suporte@sentinelconsig.com.br');
  const [supportPhone, setSupportPhone] = useState(currentWl.supportPhone || '');
  const [footerText, setFooterText] = useState(currentWl.footerText || 'SENTINEL CONSIG © 2026 - Central de Produção de Consignado');

  const [savedSuccess, setSavedSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

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
              targetTenantId: (currentWl as any).tenantId || StorageService.getCurrentTenantId()
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
          setPrimaryColor(parsed.primaryColor || configurationColorValues.color_2563eb);
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
    setLogoUrl('/branding/sentinel-symbol-v5.png');
    setPrimaryColor(configurationColorValues.color_2563eb);
    setSupportEmail('suporte@sentinelconsig.com.br');
    setSupportPhone('');
    setFooterText('SENTINEL CONSIG © 2026 - Central de Produção de Consignado');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--scrim)] p-4 backdrop-blur-xs animate-in fade-in">
      <div className="relative w-full max-w-2xl rounded-2xl bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)]  border border-[var(--field-border)] dark:border-[var(--field-border)] p-6 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-[var(--field-border)] dark:border-[var(--field-border)]">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-[var(--info-bg)] dark:bg-[var(--info-bg)] flex items-center justify-center text-[var(--link)] dark:text-[var(--link)]">
              <Palette className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)] flex items-center gap-2">
                <span>Personalização White-Label</span>
                <span className="px-2 py-0.5 text-[10px] font-extrabold uppercase bg-[var(--info-bg)] dark:bg-[var(--info-bg)] text-[var(--link)] dark:text-[var(--link)] rounded-full">
                  Multi-Promotora
                </span>
              </h2>
              <p className="text-xs text-[var(--text-secondary)]">
                Configure a identidade da promotora para vender ou licenciar o sistema de forma independente.
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

        {savedSuccess && (
          <div className="my-3 p-3 bg-[var(--success-bg)] dark:bg-[var(--success-bg)] border border-[var(--success-border)] dark:border-[var(--success-border)] rounded-lg flex items-center gap-2 text-[var(--success-text)] dark:text-[var(--success-text)] text-xs font-semibold animate-in fade-in">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-[var(--success-text)]" />
            Configurações White-Label salvas! O sistema agora é personalizado para {companyName}.
          </div>
        )}

        {errorMsg && (
          <div className="my-3 p-3 bg-[var(--danger-bg)] dark:bg-[var(--danger-bg)] border border-[var(--danger-border)] dark:border-[var(--danger-border)] rounded-lg text-[var(--danger-text)] dark:text-[var(--danger-text)] text-xs font-semibold">
            {errorMsg}
          </div>
        )}

        {/* Tabs Navigation */}
        <div className="flex border-b border-[var(--field-border)] dark:border-[var(--field-border)] mb-4 mt-2">
          <button
            type="button"
            onClick={() => setActiveTab('branding')}
            className={`flex items-center gap-2 px-4 py-2 border-b-2 text-xs font-bold transition-all ${
              activeTab === 'branding'
                ? 'border-[var(--field-border)] text-[var(--link)] dark:text-[var(--link)]'
                : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-secondary)] dark:hover:text-[var(--text-primary)]'
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
                ? 'border-[var(--field-border)] text-[var(--link)] dark:text-[var(--link)]'
                : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-secondary)] dark:hover:text-[var(--text-primary)]'
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
              <label className="block text-xs font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)] mb-1">
                Nome do Sistema / Empresa *
              </label>
              <div className="relative">
                <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-secondary)]" />
                <input
                  type="text"
                  value={companyName}
                  onChange={e => setCompanyName(e.target.value)}
                  placeholder="Ex: ALPHA CRÉDITO"
                  className="w-full pl-9 pr-3 py-2 bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface-elevated)] border border-[var(--field-border)] dark:border-[var(--field-border)] rounded-lg text-xs font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)] focus:ring-2 focus:ring-[var(--focus)]"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)] mb-1">
                Subtítulo / Nome Fantasia
              </label>
              <input
                type="text"
                value={tradeName}
                onChange={e => setTradeName(e.target.value)}
                placeholder="Ex: Promotora de Consignado Inteligente"
                className="w-full px-3 py-2 bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface-elevated)] border border-[var(--field-border)] dark:border-[var(--field-border)] rounded-lg text-xs text-[var(--text-secondary)] dark:text-[var(--text-primary)] focus:ring-2 focus:ring-[var(--focus)]"
              />
            </div>
          </div>

          {/* CNPJ & Logo URL */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)] mb-1">
                CNPJ da Promotora
              </label>
              <input
                type="text"
                value={cnpj}
                onChange={e => setCnpj(e.target.value)}
                placeholder="00.000.000/0001-00"
                className="w-full px-3 py-2 bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface-elevated)] border border-[var(--field-border)] dark:border-[var(--field-border)] rounded-lg text-xs font-mono text-[var(--text-secondary)] dark:text-[var(--text-primary)] focus:ring-2 focus:ring-[var(--focus)]"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)] mb-1">
                Logo do Cliente (URL ou Arquivo do Computador)
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={logoUrl}
                  onChange={e => setLogoUrl(e.target.value)}
                  placeholder="https://exemplo.com/logo.png"
                  className="w-full px-3 py-2 bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface-elevated)] border border-[var(--field-border)] dark:border-[var(--field-border)] rounded-lg text-xs text-[var(--text-secondary)] dark:text-[var(--text-primary)] focus:ring-2 focus:ring-[var(--focus)]"
                />
                <label className="px-3 py-2 bg-[var(--info-bg)] dark:bg-[var(--info-bg)] hover:bg-[var(--info-bg)] dark:hover:bg-[var(--info-bg)] text-[var(--link)] dark:text-[var(--link)] border border-[var(--field-border)] dark:border-[var(--field-border)] rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer shrink-0 transition-colors shadow-2xs">
                  <Upload className="h-3.5 w-3.5 text-[var(--link)] dark:text-[var(--link)]" />
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
              <label className="block text-xs font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)] mb-1">
                Cor Primária da Marca
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={primaryColor}
                  onChange={e => setPrimaryColor(e.target.value)}
                  className="h-9 w-12 rounded border border-[var(--field-border)] dark:border-[var(--field-border)] cursor-pointer p-0.5 bg-[var(--bg-surface)] dark:bg-[var(--bg-surface-elevated)]"
                />
                <input
                  type="text"
                  value={primaryColor}
                  onChange={e => setPrimaryColor(e.target.value)}
                  className="w-full px-3 py-2 bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface-elevated)] border border-[var(--field-border)] dark:border-[var(--field-border)] rounded-lg text-xs font-mono uppercase text-[var(--text-secondary)] dark:text-[var(--text-primary)]"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)] mb-1">
                E-mail de Suporte
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--text-secondary)]" />
                <input
                  type="email"
                  value={supportEmail}
                  onChange={e => setSupportEmail(e.target.value)}
                  placeholder="suporte@promotora.com.br"
                  className="w-full pl-8 pr-3 py-2 bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface-elevated)] border border-[var(--field-border)] dark:border-[var(--field-border)] rounded-lg text-xs text-[var(--text-secondary)] dark:text-[var(--text-primary)]"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)] mb-1">
                Telefone de Suporte
              </label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--text-secondary)]" />
                <input
                  type="text"
                  value={supportPhone}
                  onChange={e => setSupportPhone(e.target.value)}
                  placeholder="(11) 99999-0000"
                  className="w-full pl-8 pr-3 py-2 bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface-elevated)] border border-[var(--field-border)] dark:border-[var(--field-border)] rounded-lg text-xs text-[var(--text-secondary)] dark:text-[var(--text-primary)]"
                />
              </div>
            </div>
          </div>

          {/* Footer text */}
          <div>
            <label className="block text-xs font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)] mb-1">
              Texto de Rodapé da Aplicação
            </label>
            <input
              type="text"
              value={footerText}
              onChange={e => setFooterText(e.target.value)}
              placeholder="Ex: Alpha Crédito © 2026 - Todos os direitos reservados."
              className="w-full px-3 py-2 bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface-elevated)] border border-[var(--field-border)] dark:border-[var(--field-border)] rounded-lg text-xs text-[var(--text-secondary)] dark:text-[var(--text-primary)]"
            />
          </div>

          {/* Preview Box */}
          <div className="p-4 bg-[var(--bg-surface-elevated)] dark:bg-[var(--bg-surface-elevated)] rounded-xl border border-[var(--field-border)] dark:border-[var(--field-border)] space-y-2">
            <div className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-secondary)] dark:text-[var(--text-secondary)] flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-[var(--link)]" />
              <span>Pré-visualização do Topo (Header)</span>
            </div>
            <div className="p-3 bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] rounded-lg border border-[var(--field-border)] dark:border-[var(--field-border)] flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                {logoUrl ? (
                  <img src={logoUrl} alt="Logo" className="h-8 w-8 object-contain" />
                ) : (
                  <div className="h-8 w-8 rounded-lg bg-[var(--info-bg)] text-[var(--text-primary)] flex items-center justify-center font-bold text-xs">
                    {companyName.slice(0, 2).toUpperCase()}
                  </div>
                )}
                <div>
                  <span className="text-xs font-black tracking-wider text-[var(--text-secondary)] dark:text-[var(--text-primary)] block">
                    {companyName || 'NOME DA PROMOTORA'}
                  </span>
                  <span className="text-[9px] font-extrabold text-[var(--link)] dark:text-[var(--link)] tracking-widest uppercase block">
                    {tradeName || 'SISTEMA DE CRÉDITO'}
                  </span>
                </div>
              </div>
              <span className="text-[10px] text-[var(--text-secondary)] font-mono">
                {cnpj || 'CNPJ NÃO INFORMADO'}
              </span>
            </div>
          </div>

          {/* Import / Export JSON section */}
          <div className="p-3 bg-[var(--info-bg)] dark:bg-[var(--info-bg)] border border-[var(--field-border)] dark:border-[var(--field-border)] rounded-xl flex items-center justify-between gap-3">
            <div>
              <div className="text-xs font-bold text-[var(--link)] dark:text-[var(--link)]">
                Licenciamento & Pacote de Marca (.JSON)
              </div>
              <div className="text-[11px] text-[var(--link)] dark:text-[var(--link)]">
                Exporte o perfil de marca para entregar o sistema pré-configurado para outra promotora.
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <label className="px-3 py-1.5 bg-[var(--bg-surface)] dark:bg-[var(--bg-surface-elevated)] hover:bg-[var(--bg-canvas)] dark:hover:bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] dark:text-[var(--text-primary)] border border-[var(--field-border)] dark:border-[var(--field-border)] rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-xs">
                <Upload className="h-3.5 w-3.5 text-[var(--link)]" />
                <span>Importar</span>
                <input type="file" accept=".json" onChange={handleImportJson} className="hidden" />
              </label>

              <button
                type="button"
                onClick={handleExportJson}
                className="px-3 py-1.5 bg-[var(--bg-surface)] dark:bg-[var(--bg-surface-elevated)] hover:bg-[var(--bg-canvas)] dark:hover:bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] dark:text-[var(--text-primary)] border border-[var(--field-border)] dark:border-[var(--field-border)] rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                <Download className="h-3.5 w-3.5 text-[var(--success-text)]" />
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
          <div className="pt-3 border-t border-[var(--field-border)] dark:border-[var(--field-border)] flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={handleResetDefault}
              className="px-3 py-2 text-[var(--text-secondary)] hover:text-[var(--text-secondary)] dark:text-[var(--text-secondary)] dark:hover:text-[var(--text-primary)] text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Restaurar Padrão</span>
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-[var(--bg-surface-elevated)] hover:bg-[var(--bg-surface-elevated)] dark:bg-[var(--bg-surface-elevated)] dark:hover:bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] dark:text-[var(--text-primary)] text-xs font-semibold rounded-lg cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSave}
                className="px-5 py-2 bg-[var(--action)] hover:bg-[var(--action-hover)] text-[var(--action-ink)] text-xs font-bold rounded-lg  cursor-pointer transition-all flex items-center gap-1.5"
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
