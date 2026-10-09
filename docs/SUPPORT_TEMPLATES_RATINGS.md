# Mensagens modelo e avaliação do atendimento

## Atendente

Na Central de Atendimento, abra **Minhas mensagens modelo** para cadastrar, editar ou excluir respostas. Cada atendente vê seus próprios modelos, dentro da empresa em que está autenticado. É necessária a permissão `support.reply`.

Selecione uma conversa e clique em **Usar modelo**. O texto será acrescentado ao rascunho da resposta, que aceita múltiplas linhas. Revise e clique em **Responder** para enviar; selecionar o modelo não envia uma mensagem automaticamente.

## Parceiro

Ao concluir o atendimento (RESOLVED ou CLOSED), o portal exibe **Como foi seu atendimento?**, com nota de uma a cinco estrelas e comentário opcional. Cada conversa aceita uma avaliação. A nota fica salva no banco, junto com data e acesso do parceiro que avaliou, e é mostrada ao parceiro e ao atendente na conversa.

Somente acessos autenticados do parceiro dono do atendimento podem avaliar. A empresa também é conferida no servidor. Reabrir uma conversa não apaga a avaliação recebida.

## Implantação

A migração `20261009200000_support_templates_ratings` cria a tabela de modelos e os campos de avaliação. O comando `vercel-build` aplica as migrações antes de compilar. Após o deploy, confirmar o fluxo com um atendimento concluído e um acesso real do parceiro; compilação local não substitui essa confirmação.
