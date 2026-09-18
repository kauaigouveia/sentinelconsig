const fs = require('fs');
let content = fs.readFileSync('src/components/production/NewProductionModal.tsx', 'utf8');

content = content.replace(
  `w-full max-w-5xl rounded-xl bg-white dark:bg-slate-900 shadow-2xl flex flex-col max-h-[92vh] border border-slate-200 dark:border-slate-800`,
  `w-full max-w-[95vw] lg:max-w-7xl rounded-xl bg-white dark:bg-slate-900 shadow-2xl flex flex-col max-h-[95vh] border border-slate-200 dark:border-slate-800`
);

fs.writeFileSync('src/components/production/NewProductionModal.tsx', content);
