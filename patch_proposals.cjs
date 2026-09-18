const fs = require('fs');
let content = fs.readFileSync('server.ts', 'utf8');

const postSearchStr = `      if (!targetClientId) {
        return res.status(400).json({ error: 'Cliente é obrigatório para cadastrar proposta.' });
      }`;

const postReplaceStr = `      if (!targetClientId) {
        return res.status(400).json({ error: 'Cliente é obrigatório para cadastrar proposta.' });
      }

      if (partnerId) {
        const validPartner = await prisma.partner.findFirst({
          where: { id: partnerId, tenantId }
        });
        if (!validPartner) {
          return res.status(400).json({ error: 'O parceiro selecionado é inválido ou não pertence a este tenant.' });
        }
      }`;

content = content.replace(postSearchStr, postReplaceStr);

const putSearchStr = `      const { statusId, proposalNumber, bankId, promoterId, partnerId, productId, type, releasedValue, contractValue, installmentValue, installmentsCount } = req.body;

      const proposal = await prisma.proposal.findUnique({
        where: { id, tenantId },
        include: { status: true },
      });

      if (!proposal) {
        return res.status(404).json({ error: 'Proposta não encontrada.' });
      }`;

const putReplaceStr = `      const { statusId, proposalNumber, bankId, promoterId, partnerId, productId, type, releasedValue, contractValue, installmentValue, installmentsCount } = req.body;

      const proposal = await prisma.proposal.findUnique({
        where: { id, tenantId },
        include: { status: true },
      });

      if (!proposal) {
        return res.status(404).json({ error: 'Proposta não encontrada.' });
      }

      if (partnerId && partnerId !== proposal.partnerId) {
        const validPartner = await prisma.partner.findFirst({
          where: { id: partnerId, tenantId }
        });
        if (!validPartner) {
          return res.status(400).json({ error: 'O parceiro selecionado é inválido ou não pertence a este tenant.' });
        }
      }`;

content = content.replace(putSearchStr, putReplaceStr);

fs.writeFileSync('server.ts', content);
