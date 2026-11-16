import React from 'react';
import { ArrowRight, Command } from 'lucide-react';
import { BrandLogo } from '../common/BrandLogo';
import { GROUPS, visibleNavigation } from '../redesign/navigation';
import type { Role } from '../../types';

export function WorkbenchBrand({ name = 'Sentinel Consig', logo, onHome }: {name?: string; logo?: string | null; onHome: () => void}) {
  return <button type="button" className="wb-brand" onClick={onHome} aria-label={`Início — ${name}`}>
    {logo && !logo.startsWith('/branding/sentinel-') ? <img src={logo} alt={name}/> : <BrandLogo width={136} height={42}/>}
  </button>;
}

export function WorkbenchNavigation({ path, role, permissions = [], navigate }: {path: string; role?: Role; permissions?: string[]; navigate: (path: string) => void}) {
  const items = visibleNavigation(role, permissions);
  const normalized = path === '/dashboard' ? '/' : path;
  const current = [...items].sort((a,b) => b.path.length - a.path.length).find(item => item.path === normalized || item.path !== '/' && normalized.startsWith(item.path + '/'));
  const activeGroup = current?.group || items[0]?.group;
  const groups = GROUPS.filter(group => items.some(item => item.group === group));
  const local = items.filter(item => item.group === activeGroup);
  const link = (event: React.MouseEvent<HTMLAnchorElement>, target: string) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault(); navigate(target);
  };
  return <div className="wb-navigation">
    <nav className="wb-areas" aria-label="Áreas do sistema">
      {groups.map(group => {
        const destination = items.find(item => item.group === group)!;
        return <a key={group} href={destination.path} aria-current={activeGroup === group ? 'true' : undefined} onClick={event => link(event,destination.path)}>{group === 'Início' ? 'Meu dia' : group}</a>;
      })}
      <span className="wb-navigation-hint"><Command size={13}/> Ctrl K para encontrar qualquer tela</span>
    </nav>
    {local.length > 1 && <nav className="wb-local-navigation" aria-label={`Ferramentas de ${activeGroup}`}>
      <span>{activeGroup}<ArrowRight size={12}/></span>
      {local.map(item => <a key={item.path} href={item.path} aria-current={current?.path === item.path ? 'page' : undefined} onClick={event => link(event,item.path)}>{item.path === '/' ? 'Visão do dia' : item.title}</a>)}
    </nav>}
  </div>;
}
