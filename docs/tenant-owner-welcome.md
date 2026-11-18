# Boas-vindas do responsável (MASTER) quando uma empresa é criada

## Funcionamento

Em **Plataforma → Empresas → Nova empresa**, preencher os campos obrigatórios de **Nome do Administrador** e **E-mail do Administrador**. Após a criação transacional do Tenant, WhiteLabel e usuário inicial MASTER, o backend agenda o envio transacional via Resend.

- **Remetente**: Sentinel Consig <notificacoes@sentinelconsig.com.br>
- **Resposta**: suporte@sentinelconsig.com.br (Cloudflare Email Routing)
- **Assunto**: Bem-vindo ao Sentinel Consig — sua empresa está pronta!
- **Dados enviados**: nome da empresa, plano, nome do administrador, login, senha temporária única e URL do subdomínio (`https://{slug}.sentinelconsig.com.br/`).
- **Visual**: HTML responsivo com as cores oficiais #06141B, #11212D, #CCD0CF, #9BA8AB; cartão de acesso e CTA para login. Inclui texto puro como alternativa.
- **Senha**: gerada exclusivamente para este evento com `crypto.randomBytes(18)`, hash salvo por `hashPassword` (Argon2), `mustChangePassword: true`. A senha temporária não é gravada em texto puro nem retornada pela API de criação, e não aparece em logs.
- **Envio**: somente depois da transação de criação e da auditoria; `dispatchImportWorker` usa `waitUntil` na Vercel.
- **Idempotência**: header SHA-256 baseado em tenant e owner; evita e-mails duplicados em reenvios do mesmo evento.

## Correção de link de primeiro acesso (18/11/2026)

- O e-mail agora aponta para a **raiz HTTPS do subdomínio** (`https://{slug}.sentinelconsig.com.br/`); o formulário operacional é exibido automaticamente para visitantes sem sessão.
- A rota antiga `/login`, presente em e-mails anteriores, é reconhecida como alias de entrada e direciona usuários autenticados à página inicial; não exibe mais o 404.
- Credenciais e sessão seguem validadas no backend e a exigência de troca inicial de senha permanece inalterada.

## Condições importantes

- Um tenant criado por uma integração antiga sem administrador inicial **não terá destinatário e não gerará e-mail**.
- O modelo é disparado **apenas para novas empresas e seus primeiros responsáveis MASTER**, não para novos usuários comuns, renovação de plano ou mudança de nome.
- `RESEND_API_KEY` e `TRANSACTIONAL_EMAIL_ENABLED=true` devem existir na Vercel Production. O código não faz envio se a integração estiver desligada.
- A falha do Resend não desfaz a criação de tenant; o backend registra aviso sanitizado com ID do tenant e razão da falha, sem revelar o endereço nem a senha.
- Não existem alterações de schema, migrações, Cloudflare MX/SPF/DKIM, Vercel DNS, VPS Oracle ou permissões multiempresa nesta implementação.

## Atenção à segurança

Enviar mesmo senhas temporárias por e-mail é mais arriscado do que um link de ativação de uso único: o serviço de envio e a caixa do destinatário podem conservar o conteúdo. Esta implementação atende ao fluxo solicitado, com senha exclusiva e troca obrigatória no primeiro login; não deve ser usada para remeter senhas permanentes. Recomenda-se evoluir para link de definição de senha com token expiráveis quando a interface de ativação estiver disponível.

## Homologação

1. Conferir a branch em Preview e os testes `tests/tenant_welcome_email.test.ts`.
2. Publicar a PR com revisão e o build pronto.
3. Criar **uma empresa de teste** com dados sintéticos e um e-mail controlado; evitar cadastrar pessoas reais para o teste.
4. Confirmar mensagem recebida na caixa do owner e em Resend → Emails; verificar que o endereço direciona para o tenant correto.
5. Confirmar login e fluxo obrigatório de troca de senha, depois inativar/excluir o tenant de teste conforme políticas da plataforma.
6. Verificar que uma segunda criação com o mesmo e-mail é bloqueada por exclusividade, e que uma falha do Resend não interrompe criação.
