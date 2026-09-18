const fs = require('fs');
let content = fs.readFileSync('src/components/production/NewProductionModal.tsx', 'utf8');

const oldFunc = `  const handleAddRow = () => {
    const defaultProduct = products[0];
    const defaultBank = banks[0];
    const allowed = StorageService.getPromotersForBank(defaultBank.id);
    const defaultPromoter = allowed[0] || promoters[0];`;

const newFunc = `  const handleAddRow = () => {
    const defaultProduct = products[0] || { id: '' };
    const defaultBank = banks[0] || { id: '' };
    const allowed = defaultBank.id ? StorageService.getPromotersForBank(defaultBank.id) : [];
    const defaultPromoter = allowed[0] || promoters[0] || { id: '' };`;

content = content.replace(oldFunc, newFunc);
fs.writeFileSync('src/components/production/NewProductionModal.tsx', content);
