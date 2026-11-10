# Arvenne Separação

App interno para separar pedidos da Arvenne (Shopify e WhatsApp) num lugar só: etapas, check por peça,
peça em falta que vira "aguardando cliente" e lista de peças repetidas em vários pedidos.

Stack: Vite + React + TypeScript, Tailwind, shadcn/ui (preset `radix-nova`), Supabase (banco, login,
fotos, funções) e Cloudflare Pages.

## Rodar local

```bash
npm install
cp .env.example .env.local   # preencha com a URL e a chave anon do Supabase
npm run dev
```

Sem `.env.local` o app mostra a tela "Configure o Supabase". `.env.local` não vai para o git.

Outros comandos: `npm run build` (tsc + vite), `npm run lint`.

## Roteiro de configuração

1. **Supabase**: crie o projeto na conta pessoal (região São Paulo) e rode
   `supabase/migrations/20261110120000_inicio.sql` inteiro no SQL Editor. Em Authentication, desligue
   "Allow new users to sign up" e crie os usuários da equipe em Users.
2. **Shopify**: no Dev Dashboard, crie o app "Arvenne Separação" com os escopos `read_orders` e
   `read_products` e acesso a dados protegidos de cliente (nome, telefone, e-mail). Instale na loja e
   copie o client id e o client secret.
3. **Segredos das funções** (Project Settings → Edge Functions → Secrets): `SHOPIFY_STORE_DOMAIN`,
   `SHOPIFY_CLIENT_ID`, `SHOPIFY_CLIENT_SECRET`, `SHOPIFY_IMPORTAR_DESDE` (data de início,
   `AAAA-MM-DD`) e `CRON_SECRET` (texto aleatório).
4. **Publicar as funções (sem Docker)**:
   ```bash
   npx supabase login
   npx supabase link --project-ref SEU-REF
   npx supabase functions deploy shopify-sync shopify-produtos --use-api
   ```
5. **Agendamento a cada 5 minutos**: ative as extensões `pg_cron` e `pg_net` e rode no SQL Editor
   (troque `<ref>` e `<CRON_SECRET>`):
   ```sql
   select cron.schedule('shopify-sync', '*/5 * * * *', $$
     select net.http_post(
       url := 'https://<ref>.supabase.co/functions/v1/shopify-sync',
       headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', '<CRON_SECRET>'),
       body := '{}'::jsonb
     )
   $$);
   ```
6. **Cloudflare Pages**: conecte o repositório do GitHub, comando de build `npm run build`, saída
   `dist`, variáveis `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`. Sem `404.html` o Pages já trata
   o app como SPA.

## GitHub

Crie um repositório privado vazio no site e, nesta pasta:

```bash
git remote add origin git@github.com:SEU-USUARIO/arvenne-separacao.git
git push -u origin main
```

## Fora desta versão

Etiqueta Zebra com 1 clique, checagem por leitor de código e automação Olist/Bling/Frenet.
