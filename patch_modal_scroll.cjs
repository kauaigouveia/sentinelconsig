const fs = require('fs');
let content = fs.readFileSync('src/components/production/NewProductionModal.tsx', 'utf8');

content = content.replace(
  `w-full max-w-[95vw] lg:max-w-7xl rounded-xl bg-white dark:bg-slate-900 shadow-2xl flex flex-col max-h-[95vh] border border-slate-200 dark:border-slate-800`,
  `w-full max-w-[98vw] lg:max-w-7xl rounded-xl bg-white dark:bg-slate-900 shadow-2xl flex flex-col max-h-[98vh] border border-slate-200 dark:border-slate-800`
);

content = content.replace(
  `flex-1 overflow-y-auto p-6 space-y-6`,
  `flex-1 overflow-y-auto p-4 sm:p-6 space-y-6`
);

content = content.replace(
  `<div className="overflow-x-auto rounded-xl border border-slate-200 bg-white min-h-[300px]">`,
  `<div className="w-full overflow-x-auto rounded-xl border border-slate-200 bg-white min-h-[300px]">`
);

fs.writeFileSync('src/components/production/NewProductionModal.tsx', content);
