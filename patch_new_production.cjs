const fs = require('fs');
let content = fs.readFileSync('src/components/production/NewProductionModal.tsx', 'utf8');

const oldEffect = `  useEffect(() => {
    if (isOpen) {
      const p = StorageService.getProducts().filter(x => x.active);
      const b = StorageService.getBanks().filter(x => x.active);
      const pr = StorageService.getPromoters().filter(x => x.active);
      const pt = StorageService.getPartners().filter(x => x.active);

      setProducts(p);
      setBanks(b);
      setPromoters(pr);
      setPartners(pt);

      if (pt.length > 0 && !selectedPartnerId) {
        setSelectedPartnerId(pt[0].id);
      }`;

const newEffect = `  useEffect(() => {
    if (isOpen) {
      const p = StorageService.getProducts().filter(x => x.active);
      const b = StorageService.getBanks().filter(x => x.active);
      const pr = StorageService.getPromoters().filter(x => x.active);
      
      setProducts(p);
      setBanks(b);
      setPromoters(pr);

      // Fetch fresh partners from API
      fetch('/api/partners')
        .then(res => res.json())
        .then(data => {
           if (Array.isArray(data)) {
             const activePartners = data.filter(pt => pt.active !== false && pt.status !== 'INATIVO');
             setPartners(activePartners);
             if (activePartners.length > 0 && !selectedPartnerId) {
               setSelectedPartnerId(activePartners[0].id);
             }
           }
        })
        .catch(err => {
           console.error('[NewProductionModal] Failed to load partners:', err);
           // Fallback to local storage if API fails
           const pt = StorageService.getPartners().filter(x => x.active);
           setPartners(pt);
           if (pt.length > 0 && !selectedPartnerId) {
             setSelectedPartnerId(pt[0].id);
           }
        });`;

content = content.replace(oldEffect, newEffect);
fs.writeFileSync('src/components/production/NewProductionModal.tsx', content);
