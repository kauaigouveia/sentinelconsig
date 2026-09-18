const fs = require('fs');
let content = fs.readFileSync('src/services/storageService.ts', 'utf8');

content = content.replace(
  `extractPartnerCode(p.login) === identifier ||`,
  ``
);

content = content.replace(
  `const proposalPartnerCode = proposalPartner ? extractPartnerCode(proposalPartner.login) : '';`,
  `const proposalPartnerCode = proposalPartner?.login || '';`
);

content = content.replace(
  `const simPartnerCode = simPartner ? extractPartnerCode(simPartner.login) : '';`,
  `const simPartnerCode = simPartner?.login || '';`
);

content = content.replace(
  `requiresPortabilityRelation: false,
          active: pr.active,
          createdAt: pr.createdAt,
          updatedAt: pr.updatedAt,
        }));
        localStorage.setItem(STORAGE_KEYS.PRODUCTS`,
  `requiresPortabilityRelation: pr.type === 'PORTABILIDADE' && (pr.name.includes('REFIN') || pr.name.includes('PORT')),
          active: pr.active,
          createdAt: pr.createdAt,
          updatedAt: pr.updatedAt,
        }));
        localStorage.setItem(STORAGE_KEYS.PRODUCTS`
);

fs.writeFileSync('src/services/storageService.ts', content);
