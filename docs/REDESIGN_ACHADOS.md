# Achados fora do escopo visual

Fase 0 — 03/11/2026. Nenhuma nova vulnerabilidade de backend foi confirmada ou corrigida nesta inspeção. O npm run dev inicia o backend operacional e não é apropriado para capturas sem isolamento. Foi usado somente Vite frontend com o harness visual já existente.

Limitação confirmada: o harness não valida autenticação, RBAC, isolamento de dados reais ou serviços bancários; seu MASTER é uma fixture de apresentação. Não expor o harness como alternativa de autenticação nem levar fixtures à produção.

Todas as alterações locais anteriores de backend, Prisma, infraestrutura e regras permanecem fora do patch de redesign. Os hashes da fase 0 permitem detectar alterações acidentais nesses arquivos; não significam auditoria integral de segurança.
