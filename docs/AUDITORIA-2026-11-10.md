# Auditoria completa: 10/11/2026

Continuação da varredura que o Codex começou (ele parou por limite de uso antes de escrever o plano).
**Status: corrigido em 11/11/2026** (ver `docs/ESTADO-ATUAL.md`). O texto abaixo é o relatório original; `tests/trocas.test.mjs` agora é `tests/banco.test.mjs`.

Como foi feito: leitura do código (front, funções Edge, migrations), `npm run build`, `npm run lint`,
`npm run test:trocas` (10/10 passam), testes num banco descartável local (PGlite, com as migrations
reais), consultas **só de leitura** ao Supabase real e capturas em 390 px e 1280 px.

Legenda: **[confirmado]** = reproduzido; **[risco]** = lido no código, ainda não aconteceu.

---

## Situação antes de corrigir qualquer coisa

- Há **trabalho do Codex não commitado**: `src/lib/api.ts` (confirmar troca agora usa a função SQL
  `troca_concluir_peca`), migration nova `20261112190000_conclusao_troca.sql`, correção na
  `20261112180000_sugestoes_preco.sql` (ainda não aplicada, então pode ser editada), `tests/`,
  `package.json` (PGlite e scripts de teste), README e ESTADO-ATUAL.
- `db push --dry-run` confirma **2 migrations pendentes**: `20261112180000_sugestoes_preco` e
  `20261112190000_conclusao_troca`.
- **Consequência hoje [confirmado]:** o código já commitado chama `sugerir_troca` com a assinatura nova
  (`p_busca`), mas o banco real ainda tem a antiga (`p_min`). E o código local chama
  `troca_concluir_peca`, que não existe no banco. Sugestões de troca e "confirmar troca" falham até
  aplicar as duas migrations.

---

## P0: dinheiro e dados errados (corrigir primeiro)

### 1. Total do pedido errado depois de uma troca com desconto em R$ [confirmado]
- Pedido do WhatsApp com peça de R$ 100 e desconto fixo de R$ 20 (pagou R$ 80). Troca por peça de
  R$ 150. O link mostra **"paga R$ 40 a mais"** (o certo: 80 + 40 = R$ 120), mas depois de confirmar
  a `v_pedidos` mostra **total R$ 130**.
- Continua errado **mesmo com** a migration nova do Codex: ela congela o fator de desconto para os
  valores da troca, mas a `v_pedidos` continua subtraindo os R$ 20 fixos do subtotal novo.
- O teste "desconto fixo + Pix" atual só confere `v_troca_valores`, não o total do pedido.
- **Correção:** nova migration em que `troca_concluir_peca`, quando `desconto_tipo = 'valor'`, ajusta
  `desconto_valor` para que `total novo = total antigo + diferença anunciada` (considerando também o
  Pix de 10%, que é recalculado sobre o subtotal novo), registrando evento. Alternativa: coluna
  `pedidos.ajuste_troca` somada no total da view. Acrescentar ao `tests/trocas.test.mjs` a checagem do
  `v_pedidos.total` (desconto fixo, percentual, Pix, crédito).
- Arquivos: `supabase/migrations/` (nova), `tests/trocas.test.mjs`.

### 2. "10.50" vira R$ 1.050 [confirmado]
- `lerNumero` em `src/lib/formato.ts` apaga todos os pontos. Teclado de celular Android costuma mostrar
  ponto no teclado decimal. Afeta preço da peça, desconto, frete, valor pago e custo da Frenet.
- Também aceita negativo (`-10`) e `Infinity`.
- **Correção:** se houver só um separador e até 2 dígitos depois dele, tratar como decimal; com os dois
  (`1.234,56`), ponto é milhar. Recusar negativo, infinito e mais de 2 casas.

### 3. Telefone com +55 fica errado ao salvar a venda [confirmado]
- `mascaraTelefone("+55 11 99999-9999")` corta para 11 dígitos a partir do 55 e grava
  `(55) 11999-9999`. Telefones vindos da Shopify (`shopify-clientes`) vêm com `+55`.
- `camposDe` (`src/components/venda/form.ts`) aplica a máscara antes de gravar, então o dado salvo fica
  errado e o link do WhatsApp aponta para outro número.
- **Correção:** tirar o `55` inicial quando houver 12 ou 13 dígitos; gravar só dígitos.

### 4. Banco aceita valores negativos [confirmado]
- `pedido_itens.preco = -10` foi aceito. Nada impede desconto, frete ou valor pago negativos.
- **Correção:** nova migration com `CHECK (... >= 0)` em `pedido_itens.preco`, `pedidos.desconto_valor`,
  `frete_cobrado`, `frete_custo`, `valor_pago`, `troca_opcoes.preco` (usar `NOT VALID` e depois validar,
  para não travar se houver dado antigo).

### 5. Venda entra na expedição sem peças ou sem preço [confirmado no banco real]
- W0004 foi marcada como paga com **0 peças e R$ 0** e está na Fila. W0002 está em Nota e frete com
  4 peças **sem preço** (total R$ 0). Pode ser dado de teste, mas nada impede.
- `enviar()` checa "ao menos uma peça"; `confirmarPagamento()` em `src/pages/Venda.tsx` não checa nada.
- **Correção:** bloquear "Marcar como pago" sem peças ou com peça sem preço (aviso claro); reforço no
  banco: gatilho que recusa a passagem de venda para expedição nessas condições.

---

## P1: integração com a Shopify e escrita no banco

### 6. Sincronizar de novo não completa número, cidade, UF [confirmado]
- `importar_pedido_shopify` (última versão em `20261111180000_esteira.sql`) tem o `SET` com
  `coalesce` para todos os campos, mas a condição `WHERE` não inclui `entrega_numero`,
  `entrega_cidade`, `entrega_uf`, `frete_pago_por`, `desconto_codigos`. Se só um desses chegou depois,
  nada é gravado (teste: número `123` chegou na 2ª sincronização e ficou `null`).
- **Correção:** nova migration com `create or replace` incluindo esses campos no `WHERE`.

### 7. Um pedido com erro para a sincronização inteira [risco]
- Em `supabase/functions/shopify-sync/index.ts`, um erro do RPC em qualquer pedido faz `throw`, e os
  pedidos seguintes daquela rodada não entram.
- **Correção:** `try/catch` por pedido, seguir com os outros e devolver `{ importados, erros: [...] }`;
  a tela mostra quais pedidos falharam.

### 8. Pedido com mais de 60 linhas entra incompleto, sem aviso [risco]
- A consulta usa `lineItems(first: 60)` sem paginação. ARV-1273 já tem 31 peças.
- **Correção:** pedir `pageInfo` dos `lineItems` e paginar (ou `first: 250` + erro se `hasNextPage`).

### 9. Sem nova tentativa quando a Shopify limita o ritmo, e sem tempo máximo [risco]
- `catalogo-sync` repete em caso de `THROTTLED`; `shopify-sync` e `shopify-clientes` não.
- Nenhum `fetch` tem tempo máximo: uma resposta presa consome os 150 s da função.
- **Correção:** levar a repetição para `supabase/functions/_shared/shopify.ts` e usar
  `AbortSignal.timeout(20_000)`.

### 10. Prazo de Pix/boleto pode começar antes do pagamento [risco, conferir com pedido real]
- `pago_em` usa `processedAt`, que costuma ser a hora da compra, não a do pagamento. Num Pix pago
  horas depois, o prazo de 48 h úteis começa cedo demais.
- **Correção:** buscar `transactions { kind status processedAt }` e usar a primeira `SALE`/`CAPTURE`
  com `SUCCESS`; conferir antes com um pedido Pix real (`shopify_bruto`).

### 11. Mudanças nas peças feitas na Shopify depois da importação não aparecem [risco]
- Edição de pedido ou reembolso parcial na Shopify não muda `pedido_itens`.
- **Correção mínima:** na sincronização, comparar quantidades e gravar um aviso no pedido
  ("peças mudaram na Shopify") em vez de alterar sozinho.

### 12. Ações de vários passos sem transação [risco]
- `useReiniciar`, `useEnviarTroca`, `useCriarTroca` e `useAdicionarItens` (modo somar) em
  `src/lib/api.ts` fazem 2 a 5 gravações separadas. Uma falha de rede no meio deixa o pedido pela
  metade. (O Codex já moveu "confirmar troca" para uma função SQL: seguir o mesmo modelo.)
- **Correção:** funções SQL `reiniciar_pedido`, `enviar_troca`, `garantir_troca` com GRANT explícito
  para `authenticated`.

### 13. "Reiniciar do zero" traz de volta peças tiradas na venda [confirmado no código]
- Na venda, remover peça grava `status = 'removido'` sem observação (`PecasVenda.tsx`). O reinício
  total (`useReiniciar`) volta para "pendente" toda peça removida cuja observação não começa com
  "troca de", inclusive essas. O pedido ganha peças que a cliente não comprou.
- **Correção:** só restaurar peças removidas depois de o pedido entrar na expedição (usar
  `pedido_eventos`, ou gravar a observação "removida na venda" e excluí-la do reinício).

### 14. Bipagem em dois aparelhos se sobrescreve [risco baixo]
- `qtd_bipada` é gravada como valor absoluto lido da tela. Dois leitores no mesmo pedido perdem leituras.
- **Correção:** função SQL `bipar(item)` com `qtd_bipada = qtd_bipada + 1`.

---

## P2: desempenho e custo (tudo cabe no plano grátis)

Situação real: banco com **15 MB** (limite grátis 500 MB), fotos com 407 KB (limite 1 GB),
2.045 variantes no catálogo, 11 pedidos. Nada exige plano pago.

### 15. App inteiro num arquivo só: 1 MB (287 KB comprimido)
- Todas as telas vão no mesmo pacote (`src/App.tsx` importa tudo). A cliente que abre o link
  `/r/...` ou `/t/...` no 4G baixa o app da equipe inteiro.
- **Correção:** `React.lazy` por rota com `Suspense`, páginas públicas em pacote próprio.

### 16. Fonte extra (Instrument Sans) nos títulos
- `--font-heading` em `src/index.css` usa Instrument Sans (Layout, menu, Venda, Troca, Cabeçalho,
  diálogos). Fere a regra "Inter Tight no app inteiro" e baixa mais 30 KB.
- **Correção:** `--font-heading` = Inter Tight; tirar o import e a dependência.

### 17. Listas recalculam todos os pedidos a cada consulta
- `usePedidosFase`, `useContagens` e `useArquivo` filtram `v_pedidos` por `fase`, coluna calculada.
  O banco não consegue usar o índice e soma as peças de **todos** os pedidos (inclusive o arquivo, que
  só cresce) em cada consulta: 4 consultas por aba aberta a cada 60 s, mais a cada evento em tempo real.
  Hoje é instantâneo; com milhares de pedidos fica pesado.
- **Correção:** filtrar por `status in (...)` (usa o índice `pedidos_status`); no Arquivo, paginar.

### 18. Tempo real recarrega tudo em todas as telas
- `src/lib/tempoReal.ts`: qualquer mudança em qualquer pedido invalida todas as listas, **todos** os
  pedidos abertos, repetidas e trocas, em todos os aparelhos. E o recarregamento a cada 60 s continua
  em paralelo.
- **Correção:** invalidar só o pedido do evento (`payload.new.id` / `pedido_id`) e as listas; com o
  canal conectado, deixar o recarregamento periódico em 5 min, só como reserva.

### 19. Pasta de fotos sem limite de tamanho e tipo
- Bucket `fotos` sem `file_size_limit` nem `allowed_mime_types`. O app comprime, mas o bucket aceita
  qualquer arquivo de qualquer usuário logado.
- **Correção:** migration que define limite de 2 MB e só `image/*`.

### 20. Plano grátis do Supabase pausa o projeto após 7 dias sem uso
- Em férias ou recesso o app pode amanhecer "pausado". O agendamento (pg_cron) previsto no ESTADO-ATUAL
  evita isso. Só aviso, sem custo.

---

## P2: robustez da tela

### 21. Salvamento automático da venda (`src/pages/Venda.tsx`) [risco]
- Sair da tela menos de 600 ms depois de digitar **perde** o que foi digitado (o timer é cancelado sem
  gravar).
- Duas gravações podem sair ao mesmo tempo e chegar fora de ordem: a mais velha pode ficar por último.
- Cada gravação manda **todos** os campos: apaga o que outra pessoa mudou em outro aparelho.
- **Correção:** fila única (mutation com `scope`), gravar na hora ao sair da tela e em
  `visibilitychange`, mandar só os campos alterados.

### 22. CPF e CEP gravados em formatos diferentes
- A venda grava com máscara (`123.456.789-01`, `01001-000`); Shopify e cadastro gravam só dígitos.
  Atrapalha busca, cópia para a nota e comparação.
- **Correção:** `camposDe` grava `digitos(...)`; migration normaliza os existentes (com o "sim").

### 23. Cadastro de cliente pode sobrescrever outra pessoa [risco]
- `salvarCliente` procura quem tem o mesmo CPF **ou** e-mail **ou** telefone e atualiza esse cadastro.
  Mãe e filha com o mesmo telefone: o cadastro da mãe passa a ter o nome da filha.
- **Correção:** CPF tem prioridade; por telefone/e-mail só se o nome bater; senão criar novo.

### 24. Sem proteção contra tela branca
- Não há `ErrorBoundary`. Qualquer erro de desenho deixa a tela em branco.
- **Correção:** `ErrorBoundary` com mensagem e botão "Recarregar".

### 25. Erros ignorados
- Reinício não confere o erro ao gravar o evento; `registrarBipagem` só mostra aviso. Baixo impacto.

### 26. Arrastar na esteira aceita qualquer etapa
- Dá para arrastar da Fila direto para Postagem; o banco não valida a ordem. Tem "Desfazer".
  **Decisão do Gustavo:** manter livre ou só permitir vizinhas/voltar.

---

## P2: visual (celular e PC)

Capturas novas em `capturas/*-aud-*.png`. Sem rolagem horizontal e sem erro de página nas telas vistas.

27. **Nota e frete no celular:** o bloco "Faltam dados do pedido" (7 campos) aparece **duas vezes**,
    nos passos 1 e 2; a página passa de 7.500 px. Mostrar uma vez, acima dos passos.
28. **Pedido LR:** o mesmo SKU aparece em várias linhas (`1× BRP302` três vezes e `4× BRP302`).
    Agrupar por SKU.
29. **Expedição no celular:** "Sincronizar" fica sozinho numa segunda linha. Virar botão de ícone na
    linha da busca.
30. **Expedição no PC (1280 px):** a coluna "Aguardando cliente" fica cortada à direita sem sinal de
    que dá para rolar. Sombra/degradê na borda ou colunas mais estreitas.
31. **Bloco de troca no celular:** o "(2)" do título cai sozinho na linha de baixo; o botão WhatsApp
    fica sozinho numa linha. Ajuste de layout.
32. **320 px (teste do Codex):** uma das telas teve 3 elementos passando da largura e algumas telas
    têm campo sem rótulo acessível (busca só com placeholder). Conferir com `npm run capturas`
    numa largura de 320.

---

## P3: ferramentas e higiene

33. `scripts/capturas.mjs` não percebe sessão vencida: o app redireciona para `/login` depois do
    carregamento e o script fotografa a tela de login sem avisar (aconteceu nesta auditoria; a sessão
    velha está guardada em backup e a nova foi criada com o usuário de teste). Conferir a URL depois do
    `networkidle` e entrar de novo.
34. Função `shopify-produtos` sem uso e publicada com `verify_jwt = false`: despublicar e apagar.
35. Segurança: todas as tabelas liberam tudo para qualquer usuário logado. Isso só é seguro com o
    **cadastro público desligado** (Authentication → Sign In / Providers). Conferir no painel; não dá
    para ler pelo SQL.
36. Lint: só avisos antigos em `src/components/ui` e um `catch (_)` sem uso em `shopify-clientes`.
37. Segredos: nada vazado nos arquivos versionados; `.env.local` está no `.gitignore`.

---

## Ordem sugerida para corrigir

1. **Fase 0 (arrumar a casa):** revisar o diff do Codex, rodar `npm run test:trocas`, fazer commit,
   aplicar as 2 migrations pendentes **com o "sim" do Gustavo** (dry-run, depois `--yes`).
2. **Fase 1 (dinheiro):** itens 1 a 5, com testes no PGlite para cada um.
3. **Fase 2 (Shopify):** itens 6 a 11 (uma migration e novo deploy de `shopify-sync`, com o "sim").
4. **Fase 3 (transações):** itens 12 a 14 e 21 a 23.
5. **Fase 4 (leveza):** itens 15 a 19 e 24.
6. **Fase 5 (visual):** itens 27 a 32, conferindo com `npm run capturas` em 390 e 1280 px.

Decisões pendentes do Gustavo: forma de ajustar o total na troca (item 1: ajustar o desconto ou criar
"ajuste de troca"), arrastar livre na esteira (item 26).

## Como verificar ao final
- `npm run test:trocas` com os casos novos (total depois da troca, valores negativos recusados,
  sincronização completando número/cidade/UF, venda sem peça não vira pedido).
- `npm run build` sem erro e com o pacote inicial bem menor que 1 MB.
- `npm run capturas` nas telas Expedição, Venda, Pedido em cada etapa, `/r/` e `/t/`.
- No app, com o Gustavo logado: Sincronizar e conferir no banco (leitura) número, cidade e UF.
