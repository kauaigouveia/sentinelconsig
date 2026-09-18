const fs = require('fs');
let content = fs.readFileSync('src/services/storageService.ts', 'utf8');

const oldPartnerMap = `      // 6. Fetch Partners
      const dbPartners = await safeFetch('/api/partners');
      if (Array.isArray(dbPartners)) {
        const formattedPartners = dbPartners.map((p: any) => ({
          id: p.id,
          fullName: p.name,
          login: p.code,
          promoterId: p.promoterId || '',
          active: p.status === 'ATIVO',
          createdAt: p.createdAt,
          updatedAt: p.updatedAt,
        }));
        localStorage.setItem(STORAGE_KEYS.PARTNERS, JSON.stringify(formattedPartners));
      }`;

const newPartnerMap = `      // 6. Fetch Partners
      const dbPartners = await safeFetch('/api/partners');
      if (Array.isArray(dbPartners)) {
        const formattedPartners = dbPartners.map((p: any) => ({
          id: p.id,
          fullName: p.fullName || p.name || 'Parceiro sem Nome',
          login: p.login || p.code || '',
          promoterId: p.promoterId || '',
          active: p.active !== undefined ? p.active : p.status === 'ATIVO',
          createdAt: p.createdAt,
          updatedAt: p.updatedAt,
        }));
        localStorage.setItem(STORAGE_KEYS.PARTNERS, JSON.stringify(formattedPartners));
      }`;

content = content.replace(oldPartnerMap, newPartnerMap);
fs.writeFileSync('src/services/storageService.ts', content);
