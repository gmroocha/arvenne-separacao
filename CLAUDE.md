# CLAUDE.md — Arvenne Separação

App interno para separar pedidos da Arvenne Pratas (joias): pedidos da Shopify e do WhatsApp num lugar só,
em esteira (separação, conferência, etiquetagem, bipagem, nota e frete, embalagem, postagem).

## Comece por aqui

1. Leia [`docs/ESTADO-ATUAL.md`](docs/ESTADO-ATUAL.md): o que está pronto, o que está aberto e a próxima ação.
2. [`docs/ROADMAP.md`](docs/ROADMAP.md) só quando a tarefa pedir (ideias e decisões do Gustavo).
3. [`docs/PASSO-A-PASSO.md`](docs/PASSO-A-PASSO.md) é o roteiro de configuração que o Gustavo segue.

O Gustavo **não é dev**: explique em português simples, passo a passo, e faça você mesmo tudo o que não
exige navegador, senha ou segredo.

## Stack

Vite 8, React 19, TypeScript 7, Tailwind 4, react-router 8, TanStack Query, shadcn/ui (preset
`radix-nova`, ícones lucide), Supabase (banco, login, fotos, funções Edge). Hospedagem prevista:
Cloudflare Pages (ainda não publicado). Repositório: `gmroocha/arvenne-separacao` (privado). O push usa a
chave certa via `core.sshCommand` já configurado neste repositório.

## Regras que não se renegociam

- **Segredos nunca no chat nem em arquivo aberto no editor** (a seleção do VS Code vai junto na
  conversa). Shopify client secret, token da Frenet, `CRON_SECRET`, chave `service_role`: o Gustavo grava
  direto no painel do Supabase. Houve dois vazamentos assim no outro projeto.
- **Este projeto Supabase não dá GRANT automático.** Toda tabela, view ou função nova precisa de GRANT
  explícito (padrão em `supabase/migrations/20261110180000_permissoes.sql`): `anon` nada,
  `authenticated` sem DELETE em pedidos e itens. **Nenhum pedido é apagado pelo app.**
- **Nunca edite migration já aplicada.** Crie uma nova. Todas ficam em `supabase/migrations/`.
- **Escrita no banco ou na nuvem só com o "sim" do Gustavo**, dado antes, naquele pedido. O CLI exige
  `--yes` em modo agente: pergunte primeiro. Rotina: `npx supabase db push --remote --dry-run`, depois
  `--yes`. Leituras: `npx supabase db query --remote --read-only "..."`. O CLI mira o banco local por
  padrão: sempre `--remote`.
- Chamar função Edge por fora do login (chave interna) é bloqueado pelo sistema. Dispare pelos botões do
  app, com o Gustavo logado, e confira o resultado no banco.
- **A interface não calcula dinheiro:** totais, prazo e contagens vêm da view `v_pedidos` e de funções SQL.
- Prazo de envio: 48 h úteis a partir do pagamento (tabela `feriados`).

## Como o Gustavo gosta de trabalhar

- Opus planeja (modo plano, com `ExitPlanMode`) e **Sonnet executa**, normalmente por um agente.
- UX/UI em primeiro lugar, **celular primeiro**, visual minimalista, só componentes de
  `src/components/ui/` (shadcn atual) e tokens do tema. Exceções pedidas por ele: aviso amarelo na
  conferência e verde nas peças já feitas. Não usar a logo dos Correios.
- A **separação de pedidos é o coração do app.** Na separação, conferência, etiquetagem e bipagem o que
  importa é foto, código (SKU), variante e quantidade; nome da cliente em destaque; nada de valores.
- Guardar todos os dados, sem jogar nada fora (futuras análises).

## Comandos

```
cd ~/arvenne-separacao
npm run dev      # servidor local (usa .env.local, ignorado pelo git)
npm run build    # tsc + vite
npm run lint     # oxlint (restam avisos antigos em src/components/ui e use-mobile)
git push         # a chave SSH já está no repositório
```

Commits em português, no estilo dos existentes, terminando com a linha de coautoria que o ambiente indicar.
