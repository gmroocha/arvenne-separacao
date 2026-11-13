# Proteções do app

Uma vez por instalação, com Node 24: `npm ci` e `npx playwright install chromium`.
Em Linux sem bibliotecas do navegador: `npx playwright install --with-deps chromium`.

- `npm test`: tipos locais, tipos do app/testes, lint, unidade, banco, telas e build de produção.
- `npm run test:rapido`: tipos, lint e unidade; normalmente poucos segundos.
- `npm run test:banco`: regras SQL em memória, organizadas por assunto.
- `npm run test:e2e`: fluxos em celular e PC, com matriz de acessibilidade também em tablet; inicia e encerra um servidor próprio.
- `npm run test:watch`: unidade em observação durante a edição.

Nenhum desses comandos precisa de Supabase, Docker, conta, senha ou segredo. O lint está sem avisos;
nenhuma regra foi desabilitada. O workflow `testes.yml` executa `npm test`
em push/PR assim que os commits forem enviados ao GitHub; não faz deploy.

## O que protege

| Peça | Em uma linha |
| --- | --- |
| Restrições SQL | Impedem bipagem acima da quantidade, vínculo adicional incoerente e opção de outra peça; regressões de integridade e permissões cobertas no banco descartável. |
| Tipos gerados | Nomes de tabelas, campos e argumentos de RPC vêm do Supabase e são conferidos pelo TypeScript. |
| Vitest | Confere formatação, etapas, etiquetas, variantes, texto de troca, avisos e bloqueio de rede. |
| PGlite | Roda as migrations reais, incluindo gatilhos, RLS e permissões, em PostgreSQL descartável. |
| fast-check | Gera 80 pedidos, 40 trocas, 150 sequências financeiras e 60 combinações de etapas; compara com oráculos independentes em centavos e regras de avanço. |
| Playwright | Confere pagamento, esteira, trocas, recuperação, disputa entre navegadores e barreira de rede; axe em 390/768/1280 px, dois temas, e 12 referências visuais em celular/PC. |
| Vigia diário | Lista incoerências, guarda uma fotografia e mostra aviso no app; não altera pedidos. |
| GitHub Actions | Repete as mesmas verificações sem credenciais e guarda evidências de falha de tela por sete dias. |

Todas as reproduções da vistoria viraram travas permanentes (não há mais `test.fails`).
`conservacao.test.mjs` gera sequências aleatórias de venda somada, troca, crédito, cobertura, Pix,
retirada, falta, recebimento, estorno e devolução e confere que o dinheiro fecha. Para procurar mais
fundo: `PROP_SEED=7 PROP_RUNS=500 npx vitest run --project banco tests/banco/conservacao.test.mjs`.

Somente infraestrutura ausente no PGlite é simulada: Storage, Realtime e agendamento `pg_cron`.
O teste confere o comando e horário cadastrados; executar no relógio do Supabase depende da aplicação
remota autorizada. O vigia está programado para 06h UTC (03h em São Paulo); erros do job aparecem em
`cron.job_run_details`. Após 36h sem fotografia, o app avisa que a verificação atrasou.

## Como adicionar um teste

1. Reproduza o erro em `tests/unidade/<assunto>.test.ts`, `tests/banco/<assunto>.test.mjs` ou,
   apenas se for interação principal de tela, `tests/e2e/fluxos.spec.mjs`.
2. Confira que a expectativa correta falha antes da mudança. Use o ID Vxx no nome do teste.
3. Corrija e rode o teste do assunto. Se a reprodução já usa `test.fails`, retire `.fails`.
4. Rode `npm test` e faça um commit com correção e teste juntos. SQL aplicado nunca é editado.

Os testes SQL abrem uma transação por caso e fazem rollback. Casos de erro devem usar `recusa`
(savepoint), para não inutilizar a transação. Novas tabelas precisam de GRANT e teste de anon/auth.
Em propriedades, informe `seed` e `path` mostrados pelo fast-check para repetir uma falha.

O adaptador de tela executa as regras nas migrations, sem reimplementar dinheiro em JavaScript.
Requisições fictícias ficam no banco em memória; o restante passa pela mesma barreira do simulador.
Edge, gravação em Storage, RPC desconhecida e renovação de sessão real são bloqueados por padrão.
Descoberta de impressora é fictícia; nenhuma etiqueta vai para uma impressora real.
As capturas do vigia ficam em `capturas/vigia-{celular,pc}.png`, no escuro.

## Tipos e implantação

`npm run tipos:gerar` usa `supabase gen types --remote` para introspecção, sem aplicar SQL.
O resultado oficial fica em `src/lib/gerado/database.types.ts`. `npm run tipos:local` gera o complemento
`database.local.types.ts` a partir da diferença entre as migrations aplicadas até `20261120140000`
e as locais. `tipos:conferir` verifica esse complemento sem escrever; não precisa de rede.
Nunca edite os arquivos gerados à mão. Ao atualizar a base remota, regenere o oficial, ajuste a referência
`baseAplicada` em `scripts/tipos-pendentes.mjs`, regenere o complemento e rode `npm test`.

`src/lib/banco.ts` só refina estruturas JSON e nulabilidade de RPC; valores e campos vêm do gerado.
`tests/tipos/contratos.ts` garante que nomes inventados continuem sendo erros de compilação.

Migrations, cron e funções remotas só entram após dry-run e autorização específica do Gustavo (concedida para a Vistoria 2).
As proteções não reconstroem automaticamente pedidos antigos nem presumem pagamentos.

## Cobertura adicionada na Vistoria 2

- Contratos Shopify fictícios: >50 linhas e 151 linhas completas, checkout com 101 linhas, cursores inválidos, catálogo parcial, HTTP 429, orçamento de tempo e clientes. `deno check --no-lock` valida as quatro Edges sem acioná-las.
- `conservacao.test.mjs`: preços e coberturas em centavos; amostra extra de 300 sequências na seed 45. `maquina-estados.test.mjs`: 60 combinações × 7 etapas (420 tentativas do gatilho real).
- `etapas-atomicas.test.mjs`: peça/etapa numa transação, falta parcial e origem do desvio, repetição idempotente e permissão. E2E retém resposta após commit e recarrega a tela.
- Segurança de todas as tabelas/views/definers, proteção contra tabela temporária, tokens cruzados e dados pessoais nas respostas públicas, inclusive e-mail no campo nome.
- Rede lenta, falha e recuperação nas seis listas e romaneio; CNPJ/CEP atrasados não sobrescrevem outra cliente e serviços sem resposta têm prazo.
- Axe: 12 rotas × 3 larguras × 2 temas (72 situações), listas preenchidas; erros de seis listas em 24 situações extras; abas por teclado. Sem desativar regra de contraste ou aumentar tolerância visual.
- Tempo real: agrupa eventos, aguarda fila local, recupera mudanças perdidas ao reconectar e reduz intervalo do polling na queda.
- Desempenho local: pedido/troca abrem em menos de 7 s, incluindo SQL descartável e navegador. Não é um SLA do site ou medição de INP real.

PGlite serializa o acesso: dois contextos de navegador conferem interface/cache/idempotência, sem reproduzir toda disputa de bloqueios entre conexões PostgreSQL. Não há teste automatizado em impressora física ou sincronização real Shopify.

Ferramentas de conferência publicada (fora de `npm test`): `scripts/vistoria/publicado.mjs` usa o login autorizado e barreira de gravações; captura nove telas em dois temas/duas larguras. `banco-remoto.mjs` compara metadados e mede seis planos com CLI `--remote --read-only`. `bundle.mjs` guarda tamanhos e verifica que os valores privados conhecidos do ambiente não foram empacotados, sem imprimir valores.
