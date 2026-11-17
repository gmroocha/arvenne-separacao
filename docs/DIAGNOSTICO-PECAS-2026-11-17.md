# Cliques rápidos e bipagem — 17/11/2026

## Evidências remotas (somente leitura)

- CLI Supabase 3.2.0 autenticado e vinculado ao projeto Arvenne Orders; `db query --remote --read-only`
  confirmou acesso como `supabase_read_only_user`. Nenhum MCP direto de Supabase disponível nesta sessão.
- Banco com 34 pedidos e 654 itens. Última migration aplicada: `20261122150000`.
- Pedido informado pela pessoa: **ARV-1287**, em bipagem no momento da consulta.
- Consulta de logs das últimas 12 horas, limite 1.000: retornou 848 erros, entre **08:45:42 e 14:29:44**,
  horário de São Paulo. **777 ocorrências de `57014` (statement timeout)**: 565 em consultas à `v_pedidos`,
  16 em `alterar_item`, 4 em `bipar` e 192 em outras consultas. Ocorrências de log não equivalem a pessoas,
  cliques nem pedidos distintos. A coleta não contém todos os históricos anteriores ao período.
- Falhas de `bipar` às **14:27:07, 14:27:56, 14:28:05 e 14:28:57**. O contexto do cancelamento estava,
  respectivamente, em `tg_itens_depois`, na inserção de `bipagens`, no `realtime.send` e na reavaliação de
  etapa. O ponto em que o prazo venceu não prova que aquela função consumiu todo o tempo da operação.
  Os logs consultados não identificam o pedido nos parâmetros; portanto, não atribuir definitivamente as
  quatro falhas ao ARV-1287 só pela proximidade de horário.
- `authenticated.statement_timeout=8s`; `authenticator.statement_timeout=8s` e `lock_timeout=8s`.
- Estatísticas acumuladas de chamadas concluídas: `bipar`, 38 chamadas, média **1.803 ms**, máximo
  **7.485 ms**; `alterar_item`, 759 chamadas, média **625 ms**, máximo **7.708 ms**. Esse acumulado inclui
  versões anteriores e não inclui as chamadas canceladas; não é uma medição exclusiva do incidente.
- Leitura isolada de um detalhe via CLI: **54,681 ms de planejamento + 17,624 ms de execução**. O usuário
  do CLI, a conexão e a carga diferem da API do app; essa amostra não representa o pico.
- Nenhum deadlock registrado desde o reset das estatísticas em 03/11. Na fotografia de atividade não
  havia espera por lock. Isso não descarta bloqueios transitórios durante o incidente.
- Metrics API: cerca de **432 MiB de RAM total**, **130 MiB disponíveis** e **281 MiB de swap em uso** na
  amostra. Uma amostra não determina pressão de memória/CPU no momento das falhas; falta série temporal
  correlacionada ao incidente para afirmar que o tamanho do compute é a causa.

Não há fundamento para prometer que um upgrade resolve, nem que o Free sempre basta. O código tinha
problemas reproduzíveis que amplificam carga e fazem a tela perder o progresso provisório.

## Reproduções e correções locais

1. **V75 — leitura no meio da fila.** O erro de uma peça invalidava imediatamente o detalhe e podia
   sobrepor as outras marcações com o estado antigo do banco. Agora o erro identifica a peça e a
   reconciliação espera a fila terminar. Refoco/reconexão durante gravações otimistas conserva o cache;
   requisições de detalhe canceladas recebem também o AbortSignal. A proteção é restrita às ações com
   atualização otimista; falta parcial continua podendo buscar suas novas linhas ao concluir.
2. **V76 — releitura por clique.** Mesmo quando cada escrita terminava antes do próximo clique, eram
   relidos detalhe, itens, histórico e consultas auxiliares. Agora a atualização espera 600 ms sem nova
   marcação e com a fila vazia. As escritas continuam imediatas e em ordem por pedido. O teste de quatro
   cliques passou de quatro releituras de itens para uma. O selo de Repetidas fica desatualizado sem
   refetch imediato; a contagem de vendas abertas usa a tabela `pedidos`, sem a view financeira.
3. **V77 — recuperação de timeout confirmado.** Bipagem e ajuste +/-1 ganham uma segunda tentativa,
   após 350 ms, apenas quando o servidor retorna **código 57014 e mensagem statement timeout**. Nesse
   caso a transação foi cancelada. Erro de rede, HTTP ambíguo, cancelamento pelo usuário ou resposta
   perdida após gravar não são repetidos, evitando contagem dupla. O mesmo critério passa a valer para
   `alterar_item`, que antes repetia imediatamente todo erro 57014.
4. **V78 — regras de retorno em cada avanço.** Nova migration
   `20261122160000_progresso_pecas_leve.sql`: o gatilho continua bloqueando pedidos arquivados, mas evita
   recalcular o retorno quando a peça apenas avança nas etapas de trabalho. Desfazer, inserir,
   restaurar, mudar quantidade, mover peça e etapas posteriores mantêm a reavaliação. Teste instrumentado:
   uma peça encontrada, conferida, etiquetada e bipada dez vezes fazia **13 reavaliações**, agora **zero**.
   Tirar uma unidade após a nota fiscal continua retornando à Bipagem.
5. Ao esgotar os 60 segundos de espera pela fila, a mudança de etapa agora informa que ainda há peças
   sendo salvas; não envia a mudança enquanto a fila continua pendente.

O cronômetro agrupa apenas leituras. Cada marcação ainda é uma transação independente: não há lote
atômico de todos os cliques nem fila persistida para fechar a aba durante o envio. Não há retry cego de
bipagem. Nenhum timeout foi aumentado, nenhum histórico removido e nenhuma regra financeira relaxada.

## Validação e publicação

- Os três testes iniciais de tela falharam antes da correção (leitura durante a fila, quatro releituras,
  ausência de recuperação de timeout). O teste de banco também falhou antes, com 13 reavaliações.
- Testes adicionais cobrem resposta perdida após o commit sem duplicação, 30 cliques com refoco enquanto
  a gravação está retida, limite de espera da etapa e erros que não podem ser repetidos.
- `db push --remote --dry-run` identificou **somente** `20261122160000_progresso_pecas_leve.sql` pendente.
  Após a investigação, Gustavo autorizou “aplica”: migration **aplicada em 17/11** com `--yes`.
  Consulta remota confirmou versão `20261122160000`, otimização presente, search_path protegido e
  execução direta revogada de anon/authenticated. Tipos regenerados; publicação do app pelo push
  desta entrega na main, seguida de verificação dos arquivos servidos pelo Cloudflare.
- Resultado final: **174 testes de unidade, 232 de banco e 152 de tela passaram (558 no total)**.
  Tipos, conferência dos tipos das migrations locais, build e `git diff --check` passaram. A suíte de
  telas inclui celular, tablet e PC, comparação visual, concorrência, faltas, trocas e pagamento.
  Permanece o aviso de lint preexistente `react/no-did-update-set-state` em `ErrorBoundary.tsx`.

Depois de aplicar e publicar, validar uma sequência real com o operador, medir duração das gravações e
consultar novos logs. Se ainda ocorrerem cancelamentos de 8 s, correlacionar CPU, swap, I/O e conexões com
o horário; medir as consultas com o papel autenticado e simplificar as leituras da `v_pedidos` que ainda
dominam as falhas. Só então decidir sobre capacidade. A redução local de chamadas não comprova, sozinha,
eliminação dos timeouts de produção.

Referências: [timeouts no Supabase](https://supabase.com/docs/guides/database/postgres/timeouts),
[consultas que falham e limites das estatísticas](https://supabase.com/docs/guides/observability/log-slow-queries),
[Metrics API](https://supabase.com/docs/reference/api/v1-scrape-project-metrics).
