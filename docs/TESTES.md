# Proteções do app

Uma vez por instalação, com Node 24: `npm ci` e `npx playwright install chromium`.
Em Linux sem bibliotecas do navegador: `npx playwright install --with-deps chromium`.

- `npm test`: tipos locais, tipos do app/testes, lint, unidade, banco, telas e build de produção.
- `npm run test:rapido`: tipos, lint e unidade; normalmente poucos segundos.
- `npm run test:banco`: regras SQL em memória, organizadas por assunto.
- `npm run test:e2e`: cinco fluxos em celular e PC; inicia e encerra um servidor próprio.
- `npm run test:watch`: unidade em observação durante a edição.

Nenhum desses comandos precisa de Supabase, Docker, conta, senha ou segredo. Os oito avisos antigos
do lint continuam identificados; não são oito falhas novas. O workflow `testes.yml` executa `npm test`
em push/PR assim que os commits forem enviados ao GitHub; não faz deploy.

## O que protege

| Peça | Em uma linha |
| --- | --- |
| Restrições SQL | Impedem bipagem acima da quantidade, vínculo adicional incoerente e opção de outra peça; aplicação remota pendente. |
| Tipos gerados | Nomes de tabelas, campos e argumentos de RPC vêm do Supabase e são conferidos pelo TypeScript. |
| Vitest | Confere formatação, etapas, etiquetas, variantes, texto de troca, avisos e bloqueio de rede. |
| PGlite | Roda as migrations reais, incluindo gatilhos, RLS e permissões, em PostgreSQL descartável. |
| fast-check | Gera 80 pedidos e 40 trocas por execução e compara dinheiro com um oráculo independente em centavos. |
| Playwright | Confere pagamento, expedição até nota/frete, troca com falha/recuperação, vigia e barreira de rede em 390/1280 px. |
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
`database.local.types.ts` a partir da diferença entre as migrations aplicadas até `20261119190000`
e as locais. `tipos:conferir` verifica esse complemento sem escrever; não precisa de rede.
Nunca edite os arquivos gerados à mão. Ao atualizar a base remota, regenere o oficial, ajuste a referência
`baseAplicada` em `scripts/tipos-pendentes.mjs`, regenere o complemento e rode `npm test`.

`src/lib/banco.ts` só refina estruturas JSON e nulabilidade de RPC; valores e campos vêm do gerado.
`tests/tipos/contratos.ts` garante que nomes inventados continuem sendo erros de compilação.

Migrations, cron e funções remotas só entram após dry-run e o “sim” específico do Gustavo.
As proteções não reconstroem automaticamente pedidos antigos nem presumem pagamentos.
