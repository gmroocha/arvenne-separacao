# Incidente após conferência rápida — análise revisada em 17/11/2026

## Conclusão

A falha de leitura é confirmada no PostgreSQL. A correção anterior tratou inconsistências do cache e reduziu trabalho por escrita, mas deixou as listas e os contadores apoiados numa view financeira complexa. Os testes anteriores não reproduziam a concorrência real de requisições e Broadcast. Não há prova de que a velocidade dos cliques, isoladamente, seja a causa exclusiva, nem de que todas as conferências tenham falhado ao gravar.

## Evidências

- Coleta de 30 minutos: 38 erros 57014 entre 15:05:41 e 15:25:32 (São Paulo). 21 contagens da v_pedidos, 6 leituras completas da v_pedidos, 1 leitura de v_pedido_alteracoes e 10 registros sem SQL disponível. Nenhuma falha identificada de alterar_item nessa amostra.
- Às 15:25:31, lista de expedição, lista de rastreios e contador de atrasados falharam praticamente juntos. Isso é compatível com o aviso da captura e com indisponibilidade para navegar pelos pedidos; não prova um crash do navegador.
- A contagem de atrasados usa a mesma v_pedidos com joins de itens, trocas, vendas somadas, coberturas e movimentos financeiros. Mesmo selecionando somente id/count, o plano consultado mantém 220 nós. Consulta direta em pedidos + prazo_envio: 2 nós.
- Comparação de três amostras somente leitura, em sequência (planejamento + execução): atual 421,974 / 30,743 / 30,439 ms; direta 79,809 / 4,284 / 4,707 ms. As consultas retornaram os mesmos 21 atrasados; a comparação final da direta filtrou excluido_em is null. Os papéis de aplicação precisam preservar RLS. Amostras do CLI não representam o pico nem substituem testes pela API autenticada.
- Lista completa: 222 nós, 101,566 ms de planejamento e 35,008 ms de execução, 31 pedidos. JIT está desligado. Não atribuir o incidente à compilação JIT.
- Na fotografia de atividade havia 3 conexões idle in transaction, 1 idle in transaction (aborted) e consultas ativas. Não se observou espera por lock nessa amostra. Transação ociosa não comprova, sozinha, bloqueio de outras consultas.
- Metrics API respondeu inicialmente 500 e depois 200. Segunda fotografia: RAM total ~432 MiB, disponível ~112 MiB, swap usada ~293 MiB; load1=7,06, load5=8,70, load15=4,76. Há indícios de pressão de recursos, mas sem série de CPU/I/O/swap no instante do incidente não é possível separar suas causas. Swap alocada não significa, necessariamente, paginação ativa naquele instante.

## Código e amplificação de consultas

- Cada marcação continua sendo uma RPC/transação independente; a melhoria anterior agrupou releituras, não gravações em lote.
- Ao terminar a fila, o app invalida detalhe e listas. O Broadcast das próprias alterações pode provocar outra invalidação posteriormente. Outras abas também recebem os eventos e recarregam seus dados ativos.
- useContagens permanece ativo na barra lateral; contagens e listas compartilham o prefixo de cache pedidos. Uma invalidação ampla também recalcula o contador de atrasados.
- usePedidosFase e usePendentesRastreio usam select('*') da view financeira para montar telas operacionais. Campos financeiros e regras completos entram no caminho de abrir a lista.
- Queries possuem retry=1. Durante falha persistente, isso acrescenta uma segunda tentativa às leituras que já excederam o prazo.

## Versão antiga ainda em uso: evidência e limite

O commit 527f5ee foi criado às 15:04:27 e a publicação foi confirmada depois. O endpoint público continua servindo index-D49WoCSK.js e api-BkObWAB0.js, com preservarPecas e proteção da fila.

Logs até 15:19:24 mostram contagem por status na v_pedidos, consulta retirada do código novo e substituída pela tabela pedidos. É evidência compatível com aba/cliente antigo ainda ativo; não identifica qual pessoa nem prova que a aba da captura estava antiga. O mecanismo atual só recarrega quando falha um import de pacote antigo, não quando todos os módulos antigos já estão em memória.

## Limite dos 558 testes anteriores

Os testes de tela usam scripts/simulacao/banco.mjs, que serializa TODAS as requisições numa única fila. scripts/simulacao/rede.mjs bloqueia todos os WebSockets. Realtime.send é uma simulação no banco de testes; não entrega notificações ao navegador.

Logo, os testes de 30 cliques comprovam comportamento funcional sob atraso/falhas simuladas. Não medem a capacidade do Supabase, a concorrência do PostgREST, a pressão de memória nem a multiplicação de leituras por Broadcast em várias abas. A aprovação da suíte não justificava afirmar que a queda real estava resolvida.

## Correção recomendada, por prioridade

1. Separar as leituras operacionais: contador leve direto de pedidos/prazo; listagem de expedição com campos operacionais e agregados de peças; cálculos financeiros carregados onde são usados. Preservar autorização, exclusões, prazos e regras de transição no banco.
2. Coordenar invalidações: uma atualização por sequência, evitar repetir o refresh por eco do próprio Broadcast e desacoplar contadores laterais das marcações de peças. Manter atualização de mudanças feitas por outras pessoas e recuperação de reconexão.
3. Avaliar gravação em pequenos lotes para conferência/etiquetagem. Isso precisa preservar ordem, desfazer e identificar falhas; não aplicar retry cego à bipagem. O objetivo é reduzir transações e avisos por sequência, não apenas esconder atraso.
4. Criar testes de várias abas com entrega de Broadcast, requisições concorrentes e navegação durante a fila; medir número e simultaneidade das chamadas, além de contagens finais. Validar desempenho em ambiente isolado com PostgREST antes de repetir o cenário real monitorado.
5. Tornar a versão do app verificável e oferecer atualização segura, respeitando gravações pendentes. Para o uso imediato, depois de terminar as gravações, fechar abas antigas e reabrir o app reduz a variável de versão obsoleta; isso não substitui otimização.

A escolha de compute deve considerar métricas após reduzir o trabalho dispensável. O tamanho pequeno da base não garante baixo custo por consulta. Aumentar timeout ou adicionar retries não resolve a arquitetura de leitura.

Esta rodada foi de análise e consultas somente leitura. Nenhuma mudança adicional no código de execução, schema ou plano foi aplicada.

Referências: https://supabase.com/docs/guides/api/query-plans e https://supabase.com/docs/guides/observability/log-slow-queries (estatísticas de consultas concluídas não incluem consultas que falharam por timeout).
