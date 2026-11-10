# Colocar o Arvenne Separação no ar — passo a passo

Para quem não programa. Faça na ordem. Cada parte termina com algo que você consegue conferir.
Tempo total: cerca de 1 hora, a maior parte esperando telas carregarem.

Os painéis (GitHub, Supabase, Shopify, Cloudflare) mudam de lugar de vez em quando. Se uma tela não
bater com o texto, procure o item pelo nome; se não achar, peça ajuda ao Claude.

## Parte 1 — GitHub (guardar o código)

1. Entre em https://github.com/new com a conta `gmroocha`.
2. Nome do repositório: `arvenne-separacao`. Marque **Private**.
3. **Não marque** "Add a README", ".gitignore" nem "license". O repositório precisa nascer vazio.
4. Clique em **Create repository**.
5. Avise o Claude que criou. Ele envia o código desta máquina. (Se preferir fazer sozinho, na pasta do
   projeto: `git remote add origin git@github.com:gmroocha/arvenne-separacao.git` e depois
   `git push -u origin main`.)

Conferir: o repositório no GitHub mostra as pastas `src` e `supabase`.

## Parte 2 — Supabase (banco, login e fotos)

1. Entre em https://supabase.com, **Sign in with GitHub**, e clique em **New project**.
2. Nome: `arvenne-separacao`. Senha do banco: crie uma forte e **guarde no gerenciador de senhas**.
   Região: **South America (São Paulo)**. Plano: **Free**.
3. Espere uns 2 minutos até o projeto ficar pronto.
4. Menu **SQL Editor** → **New query**. No VS Code, abra o arquivo
   `supabase/migrations/20261110120000_inicio.sql` (clique nele na lista de pastas à esquerda), aperte
   `Ctrl+A` e `Ctrl+C` para copiar **o conteúdo** e cole na consulta do Supabase. Não cole o nome do
   arquivo: isso dá "syntax error at or near supabase". Clique em **Run**. Deve aparecer "Success".
5. Menu **Authentication** → **Sign In / Providers**: **desligue** "Allow new users to sign up".
   Isso impede que qualquer pessoa crie conta no app.
6. Menu **Authentication** → **Users** → **Add user** → **Create new user**: e-mail e senha de cada
   pessoa da equipe. Marque **Auto Confirm User**.
7. Menu **Project Settings** → **General**: o **Project ID** é o código do projeto (letras e números).
   A Project URL é `https://` + esse código + `.supabase.co`.
8. Menu **Project Settings** → **API Keys**: copie a **Publishable key** (começa com `sb_publishable_`).
   Ela faz o papel da antiga chave `anon` e pode ser pública. **Nunca** copie nem use a **Secret key**
   (`sb_secret_...`) aqui.

Conferir: em **Table Editor** aparecem as tabelas `pedidos`, `pedido_itens`, `pecas_clube` e
`pedido_eventos`.

## Parte 3 — Testar no seu computador (sem Shopify ainda)

1. Na pasta do projeto, crie o arquivo `.env.local` com duas linhas:
   ```
   VITE_SUPABASE_URL=a Project URL que você copiou
   VITE_SUPABASE_ANON_KEY=a chave anon que você copiou
   ```
2. No terminal: `npm run dev`. Abra o endereço que aparecer (em geral http://localhost:5173).
3. Entre com um usuário criado na Parte 2.
4. Cadastre uma peça no **Clube** com foto, crie um **Novo pedido** com ela e teste os botões
   Achei, Falta e Defeito.

Conferir: o pedido aparece na lista, e peça em falta muda o pedido para "Aguardando cliente".
A busca de peças **do site** só funciona depois da Parte 5.

## Parte 4 — Cloudflare Pages (colocar o app na internet)

1. Crie uma conta grátis em https://dash.cloudflare.com.
2. Menu **Workers & Pages** → **Create application** → aba **Pages** → **Import an existing Git
   repository**.
3. Conecte o GitHub e autorize **só** o repositório `arvenne-separacao`.
4. Configure assim:
   - Framework preset: **None**
   - Build command: `npm run build`
   - Build output directory: `dist`
   - Variáveis de ambiente (as três):
     `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (os mesmos da Parte 3) e `NODE_VERSION` com valor `22`.
5. **Save and Deploy**. Em 1 ou 2 minutos você ganha um endereço como `arvenne-separacao.pages.dev`.
6. Volte ao Supabase: **Authentication** → **URL Configuration** → coloque esse endereço em **Site URL**.

Conferir: abrir o endereço no celular, entrar e ver a lista de pedidos.

## Parte 5 — Shopify (pedidos do site chegando sozinhos)

Pode ficar para outro dia: o app já funciona sem isso, só os pedidos da loja não entram.

1. No Dev Dashboard da Shopify (https://dev.shopify.com), crie um app chamado **Arvenne Separação**.
2. Permissões: `read_orders` e `read_products`. Peça também o acesso a **dados protegidos de cliente**
   (nome, telefone, e-mail), senão os pedidos chegam sem o nome da cliente.
3. Instale o app na loja e copie o **Client ID** e o **Client secret**.
4. No Supabase: **Project Settings** → **Edge Functions** → **Secrets**. Crie estes cinco:
   | Nome | Valor |
   | --- | --- |
   | `SHOPIFY_STORE_DOMAIN` | o endereço da loja, no formato `nome-da-loja.myshopify.com` |
   | `SHOPIFY_CLIENT_ID` | o Client ID |
   | `SHOPIFY_CLIENT_SECRET` | o Client secret |
   | `SHOPIFY_IMPORTAR_DESDE` | a data de hoje, `2026-11-10`. Pedidos mais antigos não entram. |
   | `CRON_SECRET` | um texto longo e aleatório. Peça ao Claude para gerar. |
5. No terminal, na pasta do projeto:
   ```
   npx supabase login
   npx supabase link --project-ref CODIGO
   npx supabase functions deploy shopify-sync shopify-produtos --use-api
   ```
   `CODIGO` é a parte do meio da Project URL (`https://CODIGO.supabase.co`). O `link` pede a senha do
   banco da Parte 2. O `login` abre o navegador.
6. No Supabase: **Database** → **Extensions**: ative `pg_cron` e `pg_net`. Depois, no **SQL Editor**,
   rode o bloco abaixo trocando `CODIGO` e `SEU_CRON_SECRET`:
   ```sql
   select cron.schedule('shopify-sync', '*/5 * * * *', $$
     select net.http_post(
       url := 'https://CODIGO.supabase.co/functions/v1/shopify-sync',
       headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', 'SEU_CRON_SECRET'),
       body := '{}'::jsonb
     )
   $$);
   ```

Conferir: no app, botão **Sincronizar** traz os pedidos pagos da loja, com foto. Rodar de novo não
duplica nada.

## Cuidados

- A chave `service_role` e o `CRON_SECRET` ficam só no Supabase. Não vão para o GitHub, nem para o
  Cloudflare, nem para o `.env.local`.
- Supabase grátis pausa o projeto depois de 7 dias sem uso. Com uso diário isso não acontece.
- O plano grátis não faz backup diário. Veja "Cópia de segurança" em `docs/ROADMAP.md`.
