const fs = require('fs');
let content = fs.readFileSync('src/components/admin/WhiteLabelModal.tsx', 'utf8');

const oldHandle = `const handleLogoFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setErrorMsg('A imagem do logo deve ter no máximo 2MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = evt => {
      if (evt.target?.result) {
        setLogoUrl(evt.target.result as string);
        setErrorMsg(null);
      }
    };
    reader.readAsDataURL(file);
  };`;

const newHandle = `const handleLogoFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
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
  };`;

content = content.replace(oldHandle, newHandle);
fs.writeFileSync('src/components/admin/WhiteLabelModal.tsx', content);
