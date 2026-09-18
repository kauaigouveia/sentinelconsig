import fs from 'fs';

let appTsx = fs.readFileSync('src/App.tsx', 'utf-8');

appTsx = appTsx.replace(
  " StorageService.getCurrentTenant().name}",
  " branding?.companyName || StorageService.getCurrentTenant().name}"
);

fs.writeFileSync('src/App.tsx', appTsx);
console.log('App.tsx updated');
