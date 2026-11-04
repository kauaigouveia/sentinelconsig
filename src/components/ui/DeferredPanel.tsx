import React,{useRef,Suspense} from 'react';
/** Import on first use, then keep mounted so closing/reopening preserves existing lifecycle. */
export function DeferredPanel({active,children}:{active:boolean;children:React.ReactNode}){const visited=useRef(false);if(active)visited.current=true;return visited.current?<Suspense fallback={active?<p role="status" className="p-3 text-[var(--text-secondary)]">Carregando ferramenta…</p>:null}>{children}</Suspense>:null;}
