const fs = require('fs');
let content = fs.readFileSync('src/components/saas/PlatformMasterCentral.tsx', 'utf8');

const hookInsertPoint = `const [supportEmail, setSupportEmail] = useState('');`;

const handleFunc = `
  const handlePlatformLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>, targetTenantId: string) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setFormError('Formato inválido. Use PNG, JPG ou WebP.');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setFormError('A imagem do logo deve ter no máximo 2MB.');
      return;
    }
    setIsSubmitting(true);
    const reader = new FileReader();
    reader.onload = async evt => {
      if (evt.target?.result) {
        try {
          const res = await fetch('/api/upload/logo', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              fileBase64: evt.target.result as string,
              mimeType: file.type,
              fileName: file.name,
              targetTenantId
            })
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Falha ao enviar arquivo');
          setLogoUrl(data.logoUrl);
          setFormError(null);
        } catch (err: any) {
          setFormError(err.message);
        } finally {
          setIsSubmitting(false);
        }
      }
    };
    reader.readAsDataURL(file);
  };
`;

content = content.replace(hookInsertPoint, hookInsertPoint + handleFunc);

const uiOld = `<div className="space-y-1">
                    <label className="font-semibold text-slate-700 dark:text-slate-300">URL do Logotipo</label>
                    <input
                      type="url"
                      value={logoUrl}
                      onChange={(e) => setLogoUrl(e.target.value)}
                      placeholder="https://..."
                      className="w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-1.5 text-xs text-slate-900 dark:text-slate-100 focus:outline-hidden"
                    />
                  </div>`;

const uiNew = `<div className="space-y-1">
                    <label className="font-semibold text-slate-700 dark:text-slate-300">Logo (URL ou Arquivo)</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={logoUrl}
                        onChange={(e) => setLogoUrl(e.target.value)}
                        placeholder="https://..."
                        className="w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-1.5 text-xs text-slate-900 dark:text-slate-100 focus:outline-hidden"
                      />
                      <label className="px-2 py-1.5 bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 rounded text-xs font-bold flex items-center justify-center cursor-pointer transition-colors shrink-0">
                        Upload
                        <input
                          type="file"
                          accept="image/png, image/jpeg, image/webp"
                          onChange={(e) => selectedTenant && handlePlatformLogoUpload(e, selectedTenant.id)}
                          className="hidden"
                          disabled={isSubmitting}
                        />
                      </label>
                    </div>
                  </div>`;

content = content.replace(uiOld, uiNew);
fs.writeFileSync('src/components/saas/PlatformMasterCentral.tsx', content);
