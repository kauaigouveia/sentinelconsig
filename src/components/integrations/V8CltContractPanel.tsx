import React from 'react';

export function V8CltContractPanel(_props: { promoterId: string; canReview: boolean }) {
  return <details className="rounded-xl border p-4"><summary className="cursor-pointer font-semibold">Fluxo CLT V8</summary><p className="my-3 text-sm">Consulta → autorização pela API V8 → acompanhamento até SUCCESS → configurações vigentes → simulação.</p><p className="text-xs">Valores em reais, taxa mensal fracionária na resposta e POST financeiro direto. A autorização registra a operação da API, sem criar assinatura ou declarar aceite humano no Sentinel. Não há aprovação administrativa por consulta, SMS ou link externo exigido nesta jornada.</p></details>;
}