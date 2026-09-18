const fs = require('fs');
let content = fs.readFileSync('src/components/production/NewProductionModal.tsx', 'utf8');

content = content.replace(
  `<th className="px-3 py-2.5">Produto *</th>
                    <th className="px-3 py-2.5">Banco *</th>
                    <th className="px-3 py-2.5">Promotora Habilitada *</th>`,
  `<th className="px-3 py-2.5 min-w-[150px]">Produto *</th>
                    <th className="px-3 py-2.5 min-w-[150px]">Banco *</th>
                    <th className="px-3 py-2.5 min-w-[150px]">Promotora Habilitada *</th>`
);

content = content.replace(
  `<div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">`,
  `<div className="overflow-x-auto rounded-xl border border-slate-200 bg-white min-h-[300px]">`
);

fs.writeFileSync('src/components/production/NewProductionModal.tsx', content);
