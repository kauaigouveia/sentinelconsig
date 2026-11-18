import React, { useEffect, useRef, useState } from 'react';
import { TURNSTILE_PARTNER_ACTION } from '../../../server/services/partnerTurnstile';

type TurnstileApi = {
  render: (element: HTMLElement, options: Record<string, unknown>) => string;
  remove: (widgetId: string) => void;
};
declare global {
  interface Window { turnstile?: TurnstileApi }
}

type Props = {
  siteKey: string;
  onChange: (token: string | null) => void;
  resetIndex: number;
};

/** Explicit rendering for React SPA; emits only tokens, never secrets. */
export function PartnerTurnstile({ siteKey, onChange, resetIndex }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const onChangeRef = useRef(onChange);
  const [error, setError] = useState(false);

  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);

  useEffect(() => {
    let canceled = false;
    let widgetId: string | undefined;
    setError(false);
    onChangeRef.current(null);

    const renderWidget = () => {
      if (canceled || !window.turnstile || !container.current || widgetId) return;
      widgetId = window.turnstile.render(container.current, {
        sitekey: siteKey,
        action: TURNSTILE_PARTNER_ACTION,
        theme: 'auto',
        size: 'flexible',
        callback: (token: string) => { if (!canceled) { setError(false); onChangeRef.current(token); } },
        'error-callback': () => { if (!canceled) { setError(true); onChangeRef.current(null); } },
        'expired-callback': () => { if (!canceled) onChangeRef.current(null); },
        'timeout-callback': () => { if (!canceled) onChangeRef.current(null); },
      });
    };

    let script = document.querySelector<HTMLScriptElement>('script[data-sentinel-turnstile]');
    if (!script) {
      script = document.createElement('script');
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.async = true;
      script.defer = true;
      script.dataset.sentinelTurnstile = '1';
      document.head.appendChild(script);
    }
    script.addEventListener('load', renderWidget);
    const onScriptError = () => { if (!canceled) setError(true); };
    script.addEventListener('error', onScriptError);
    renderWidget();

    return () => {
      canceled = true;
      script?.removeEventListener('load', renderWidget);
      script?.removeEventListener('error', onScriptError);
      if (widgetId && window.turnstile) window.turnstile.remove(widgetId);
    };
  }, [siteKey, resetIndex]);

  return (
    <div className="space-y-2" aria-label="Validação anti-robô do parceiro">
      <div ref={container} />
      {error && <p role="alert" className="text-sm text-red-500">Não foi possível carregar a verificação. Atualize a página e tente novamente.</p>}
    </div>
  );
}
