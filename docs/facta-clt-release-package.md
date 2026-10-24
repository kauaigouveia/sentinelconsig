# Pacote independente FACTA CLT

Branch codex/facta-clt-release. Base origin/main da2ed71706ecc38909e2085c8ca83f6287c4fecb, conferida por fetch em 24/10/2026. Primeiro commit: fc0291fc1a51c33a7af352bed624d02d4cf05bc9, equivalente em conteúdo ao 4bbdf5f da branch original codex/facta-clt-employment-fix, preservada.

## Separação

fc0291fc não depende do fluxo V8: inclui matrícula nas rotas, tipo de entrada, revalidação FACTA e seleção nos dois formulários. Foi extraído de f4ed5b26 somente o import CurrencyInput e a linha de renderização do valor monetário CLT no Portal. Conteúdo idêntico ao aprovado, desconsiderando CRLF/LF. O input number anterior não aceita os formatos brasileiros 1423,98 e 1.423,98; o componente existente mantém 1423.98 no payload. Outros produtos conservam os campos anteriores. Nenhum dispatcher, seletor ou resultado V8 foi extraído.

Os testes novos facta_clt_partner_release.test.tsx cobrem três formatos de moeda, matrícula com zeros, etapas do Portal e ausência de seletores V8 no payload. clt_entry_final_review.test.tsx foi reaproveitado de 193e7c8 para verificar callbacks CLT/FGTS pelos nomes acessíveis; sem dependência V8.

## Validação

51 testes direcionados aprovados e regressão com 116 aprovados/12 falhas preexistentes: **167 aprovados e 12 falhas antigas**, sem sobreposição. Um worker, dados sintéticos e APIs/banco simulados. Testes HTTP usam callbacks reais sem importar o bootstrap. Nenhuma chamada bancária real.

A main foi novamente testada em cópia isolada nesta etapa: 50 aprovados e as mesmas 12 falhas, com nomes e primeira linha de erro idênticos. Onze são fixtures FACTA INSS/portabilidade sem banco de origem; três também têm taxa fora da faixa vigente. A última procura IDs antigos dos cartões CLT/FGTS; o teste acessível atual passa. Nenhuma nova falha foi observada. Não foram alterados testes históricos para ocultar falhas.

TypeScript, build completo e diff-check aprovados. O build executa prisma generate, Vite e esbuild; não executa migration/seed nem conecta ao banco operacional. DATABASE_URL do processo foi substituída por um destino sintético em 127.0.0.1:9. Schema/migrations sem diferenças contra origin/main.

## Arquivos

- server.ts
- server/services/factaSimulationService.ts
- server/services/productSimulationService.ts
- src/components/partner-portal/PartnerSimulationsView.tsx
- src/components/simulation/CltCustomerDataCard.tsx
- src/components/simulation/ProductSimulationModal.tsx
- tests/facta_clt_employment.test.ts
- tests/facta_clt_route.test.ts
- tests/facta_clt_selection_ui.test.tsx
- tests/facta_clt_partner_release.test.tsx
- tests/clt_entry_final_review.test.tsx
- docs/facta-clt-employment-fix.md
- docs/facta-clt-release-package.md

## Parecer

Preparado para revisão e integração somente após autorização. Sem código novo de V8, arquivos do rodapé ou alterações de banco. As 12 falhas históricas permanecem dívida de testes; mocks não certificam sucesso da conta FACTA. Não houve merge, push ou deploy. Reversão futura restrita aos commits deste pacote, sem banco.
