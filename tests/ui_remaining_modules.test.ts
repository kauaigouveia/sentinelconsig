import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { inspectModule } from '../scripts/ui-module-manifest.mjs';
const baseline=JSON.parse(readFileSync('docs/ui-redesign/remaining-modules-baseline.json','utf8'));
describe('Paridade estática dos módulos e formulários restantes',()=>{
  it.each(baseline.modules)('$path mantém seus controles e bindings', (module:any)=>{
    const current=inspectModule(module.path);
    for(const control of module.controls) expect(current.controls.some(item=>item.tag===control.tag && control.attrs.every((attr:string)=>item.attrs.includes(attr)))).toBe(true);
  });
  it.each(baseline.modules)('$path mantém suas expressões operacionais', (module:any)=>{
    const current=inspectModule(module.path);
    for(const [name,values] of Object.entries(module.expressions)) expect(current.expressions[name]).toEqual(values);
  });
});
