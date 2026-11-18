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

1. Na pasta do projeto, crie o arquivo `.env.local` com as duas primeiras linhas (as outras duas são opcionais):
   ```
   VITE_SUPABASE_URL=a Project URL que você copiou
   VITE_SUPABASE_ANON_KEY=a chave anon que você copiou
   VITE_URL_OLIST=o endereço do seu Olist (opcional: mostra o botão "Abrir Olist" no pedido)
   VITE_URL_BLING=o endereço do seu Bling (opcional: mostra o botão "Abrir Bling" no pedido)
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
2. Permissões: `read_orders`, `read_products` e `read_customers` (esta última é a busca de cliente na
   hora de montar a venda). Peça também o acesso a **dados protegidos de cliente**
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
   npx supabase functions deploy shopify-sync --use-api
   ```
   `CODIGO` é a parte do meio da Project URL (`https://CODIGO.supabase.co`). O `link` pede a senha do
   banco da Parte 2. O `login` abre o navegador.
6. **Sincronização automática de hora em hora** (00:00, 01:00, 02:00 ... toda hora cheia; o botão **Sincronizar** continua
   funcionando igual). Ela vem da migration `20261122190000_shopify_automatica.sql` (liga o `pg_net`, cria a função
   `sincronizar_shopify_agendado` e o agendamento `shopify-sync` com `0 * * * *`). **O segredo nunca fica no arquivo, no
   chat nem numa consulta salva**: a função lê o valor do **Vault** do Supabase. Depois que o Claude aplicar a migration
   (com o seu "sim"), faça você, no painel:
   1. **Project Settings** → **Edge Functions** → **Secrets**: confira que o `CRON_SECRET` existe (é o mesmo da tabela do
      passo 4). Você não precisa abrir o valor para ninguém.
   2. **Database** → **Vault** → **Add new secret**: **Name** = `cron_secret` (exatamente assim, minúsculas), **Secret** = o
      **mesmo texto** do `CRON_SECRET`. Salve. (Se só tiver o `CRON_SECRET` das Edge Functions e não souber o texto, gere um
      novo, grave nos dois lugares com o mesmo valor e republique a função: o Claude faz a publicação.)
   3. Na hora cheia seguinte o banco chama a `shopify-sync` sozinho. Para conferir (só leitura), peça ao Claude ou use o
      **SQL Editor** com `select start_time, status, return_message from cron.job_run_details order by start_time desc limit 5;`
      e, nos **Logs** da função Edge `shopify-sync`, veja as chamadas de cada hora. Sem o segredo no Vault nada quebra: a
      função só deixa um aviso no log ("falta o segredo cron_secret no Vault") e os pedidos continuam entrando pelo botão.
   4. Para pausar: **Database** → **Cron** (ou SQL Editor: `select cron.unschedule('shopify-sync');`).

Conferir: no app, botão **Sincronizar** traz os pedidos pagos da loja, com foto. Rodar de novo não
duplica nada.

## Cópia do banco (toda semana, no GitHub)

O plano Free do Supabase não guarda cópia. O robô `.github/workflows/backup.yml` copia o banco todo domingo
(3h), cifrada com uma senha sua, e guarda por 90 dias no GitHub. Configuração (uma vez só, no navegador):

1. **Endereço do banco.** No painel do Supabase, projeto **Arvenne Orders** → botão **Connect** (no topo) →
   aba **Connection string** → tipo **URI** → escolha **Session pooler**. Copie o endereço e troque
   `[YOUR-PASSWORD]` pela senha do banco (se não lembrar: **Database** → **Settings** → **Reset database password**;
   o app não usa essa senha, nada para de funcionar).
2. **No GitHub**, repositório `gmroocha/arvenne-separacao` → **Settings** → **Secrets and variables** →
   **Actions** → **New repository secret**:
   - Nome `SUPABASE_DB_URL`, valor: o endereço do passo 1.
   - Nome `BACKUP_SENHA`, valor: uma senha nova, forte, só para a cópia. **Guarde num lugar seguro**: sem ela a
     cópia não abre.
3. **Testar:** aba **Actions** → **Cópia do banco** → **Run workflow**. Em ~2 min aparece verde, e o arquivo
   `banco-AAAA-MM-DD.dump.gpg` fica em **Artifacts** no fim da página da execução.

Não cole o endereço nem as senhas no chat. As fotos (Storage) não entram na cópia; ficam no Supabase.
Para restaurar, peça ao Claude (precisa da `BACKUP_SENHA`).

## Cuidados

- A chave `service_role` e o `CRON_SECRET` ficam só no Supabase. Não vão para o GitHub, nem para o
  Cloudflare, nem para o `.env.local`.
- Supabase grátis pausa o projeto depois de 7 dias sem uso. Com uso diário isso não acontece.
- O plano grátis não faz backup diário. Veja "Cópia de segurança" em `docs/ROADMAP.md`.

## Leitor de código de barras (Bipagem)

O leitor USB funciona como um teclado: ele "digita" o código da etiqueta (o SKU) e aperta Enter. Não
precisa instalar nada: plugue no computador, abra a etapa Bipagem do pedido e leia as peças.

## Catálogo da loja (peças do site)

O catálogo vem **direto da Shopify**, pela Admin API, e o Supabase guarda uma cópia para a busca ser
instantânea. O app precisa do escopo `read_products` (já está na Parte 5).

- **Carrinho colado:** ao colar, o app pede à Shopify as variantes daquele carrinho, então preço e foto
  vêm atuais. Peça de produto arquivado ou em rascunho também é lida.
- **Aba "Site" da busca:** mostra só produtos ativos, a partir da cópia.
- **Atualização:** botão "Atualizar catálogo" (completo, também remove o que saiu da loja) e,
  depois, agendamento (`catalogo-sync` com `{ "desde": "..." }` a cada poucos minutos e uma completa por dia).
- Publicar: `npx supabase functions deploy catalogo-sync --use-api`, depois dos segredos da Shopify.

## Impressora Zebra (etiquetas 50 x 30 mm)

Faça isto uma vez, no computador do Windows ligado na Zebra ZD220 por USB.

1. **Driver.** Instale o driver da Zebra (ZDesigner ZD220). Em Configurações → Impressoras, abra a
   "ZDesigner ZD220" → Preferências de impressão → tamanho **50 x 30 mm**, orientação retrato.
2. **Zebra Browser Print (gratuito).** Baixe no site da Zebra (zebra.com, procure "Zebra Browser Print"),
   instale e deixe aberto (ele fica perto do relógio). É ele que deixa o app mandar as etiquetas direto,
   sem janela de impressão.
3. **Primeira impressão.** O Browser Print pergunta se pode aceitar o endereço do app: aceite.
4. **App publicado (https).** Abra uma vez `https://localhost:9101/ssl_support` no Chrome e aceite o
   certificado. Depois volte ao app.
5. **Testar.** Na Separação de qualquer pedido, abra o menu "…" ao lado de "Imprimir todas as etiquetas" e escolha
   "Imprimir etiqueta de teste". Leia o código com o leitor da Bipagem e confira o tamanho.

Quando o Browser Print responde, o botão mostra "na Zebra". Sem ele, o botão abre a janela de impressão do
Chrome: escolha a ZD220 uma vez (o Chrome lembra), sem margens e sem cabeçalho.

Imprimir não marca nada: a etiqueta é colada no saquinho na Conferência (a etapa Etiquetagem não existe mais).
O botão "Imprimir todas as etiquetas" fica no topo da Separação de cada pedido (uma etiqueta por código e variante, não por unidade).

## Time Arvenne (depois de aplicar a migration `20261122140000_frete_e_time.sql`)

Só depois que a migration estiver aplicada no Supabase (o app avisa quando eu pedir o "sim"):

1. Abra o app e entre em **Time** (menu lateral).
2. Toque em **Adicionar pessoa** e cadastre cada pessoa: nome e **o mesmo e-mail com que ela entra no app**
   (o login criado no painel do Supabase). É esse e-mail que faz o filtro **Comigo** da Expedição funcionar.
   O e-mail é opcional: sem ele a pessoa aparece nas listas, mas não tem "Comigo".
3. Dentro de cada pedido, o nome da etapa atual (embaixo do número) abre **Quem faz cada etapa**.

## Token da Storefront (só se precisar)

Serve para o app ler o link de carrinho compartilhado da Shopify (`/cart/c/...`). Só faça se eu avisar
que o caminho sem token não funcionou.

1. No admin da Shopify, abra **Configurações > Apps e canais de vendas > Desenvolver apps** (ou o Dev
   Dashboard, no app "Arvenne Separação").
2. Na configuração do app, ative a **Storefront API** e marque o acesso de leitura a produtos e
   carrinhos (`unauthenticated_read_product_listings` e `unauthenticated_read_checkouts`).
3. Reinstale o app e copie o **token de acesso da Storefront API**. Não cole o token no chat.
4. No painel do Supabase, vá em **Edge Functions > Secrets**, crie o segredo `SHOPIFY_STOREFRONT_TOKEN`
   e cole o token no valor. Salve.

## Como usar a esteira nova (17/11/2026)

1. **Separação:** no topo, **Imprimir todas as etiquetas** (uma por código e variante, não por unidade; para uma peça só,
   use o "⋯" da peça → **Imprimir etiqueta**). **Começar separação** marca que o pedido saiu da fila (o primeiro **Achei**
   também faz isso). Toque **Achei** em cada peça; ela vai para a Conferência sozinha. Não precisa terminar tudo para conferir: abra **Conferência** na linha de etapas.
2. **Conferência:** confira a peça, cole a etiqueta no saquinho e toque **Conferida**; ela vai para a Bipagem.
3. **Bipagem:** bipe (ou use **Contar 1**). Quando todas as peças terminam uma etapa, o pedido **vai sozinho** para a
   próxima.
4. **Nota fiscal:** **Nota emitida** e **Pedido LR feito** (cada código tem botão de copiar). Os dois feitos levam à
   Embalagem. **Embalagem:** marque os três itens e **Embalado**. **Frete:** gere na Frenet, cole o link de rastreio
   e toque **Frete gerado**. **Postagem:** **Postado**.
5. **Concluídos** (menu lateral): **Enviar rastreio** (abre o WhatsApp com a mensagem; depois **Mensagem enviada**),
   **A caminho** e **Entregues** (**Marcar entregue**).
6. **Concluir pedido** (clique direito no cartão ou "⋯" do pedido): marca tudo que falta como feito e manda para
   Concluídos. **Mover para outra etapa** funciona nos dois sentidos e sempre pede confirmação; o sistema recusa se
   houver troca em andamento, acerto pendente ou peça em falta.
7. **Time:** **Excluir** tira a pessoa de vez (pedidos e histórico continuam); **Desativar** só pausa.
8. **Barra de baixo (celular e PC):** ‹ **etapa anterior** e **próxima etapa** › só trocam o que aparece na tela (não mudam o
   pedido). **Concluir etapa** pergunta e leva o pedido para a próxima (marca como feito o que faltar). Em todo avanço
   aparece "Etapa X concluída → agora Y"; toque em **Continuar**.
9. **Foto da peça:** tocar na foto abre o detalhe (código, nome, variante, quantidade, **preço**, nota e, se faltar, quantas
   faltam). O preço só aparece ali; os cartões das etapas continuam sem valores.
10. **Notas no pedido LR:** peças com nota aparecem em um bloco acima da lista do LR.
