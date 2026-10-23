import React from 'react';

interface ConversationDetails {
  partnerName?: string;
  partnerCode?: string;
  channel?: string;
  department?: string;
  proposalNumber?: string;
  assignedUserName?: string;
  status?: string;
  rating?: number;
  ratingComment?: string;
  simulationData?: {
    convenio?: string;
    cpf?: string;
    phone?: string;
    admissionDate?: string;
    payslipMessageId?: string;
  };
}

/** Data comes only from the existing permission-scoped conversation endpoint. */
export function SupportConversationDetails({ conversation }: { conversation: ConversationDetails }) {
  const simulation = conversation.department === 'SIMULATION' ? conversation.simulationData : undefined;
  return (
    <details className="support-details">
      <summary>Detalhes da conversa</summary>
      <div className="support-details-content">
        <dl>
          <div><dt>Parceiro</dt><dd>{conversation.partnerName} {conversation.partnerCode}</dd></div>
          <div><dt>Canal</dt><dd>{conversation.channel || 'Portal'}</dd></div>
          <div><dt>Fila</dt><dd>{conversation.department === 'SIMULATION' ? 'Simulação' : 'Atendimento ao parceiro'}</dd></div>
          <div><dt>Proposta</dt><dd>{conversation.proposalNumber || 'Sem proposta vinculada'}</dd></div>
          <div><dt>Responsável</dt><dd>{conversation.assignedUserName || 'Não atribuído'}</dd></div>
        </dl>
        {simulation && <section className="mt-3 space-y-1">
          <strong>Dados para simulação: {simulation.convenio || 'Aguardando escolha'}</strong>
          <p>CPF: {simulation.cpf || 'Aguardando'}</p>
          {simulation.phone && <p>Telefone: {simulation.phone}</p>}
          {simulation.admissionDate && <p>Admissão: {simulation.admissionDate}</p>}
          {simulation.payslipMessageId && <a className="underline" href={`/api/support/messages/${encodeURIComponent(simulation.payslipMessageId)}/attachment`}>Baixar contracheque</a>}
        </section>}
        {!!conversation.rating && <section className="mt-3">
          <strong>Avaliação do parceiro: {'★'.repeat(conversation.rating)} ({conversation.rating}/5)</strong>
          {conversation.ratingComment && <p className="whitespace-pre-wrap break-words">{conversation.ratingComment}</p>}
        </section>}
      </div>
    </details>
  );
}
