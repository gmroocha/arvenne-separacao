# Lista completa dos testes — Arvenne

Inventário extraído dos testes em 17/11/2026. Cada linha descreve o comportamento verificado. Os códigos Vxx identificam erros encontrados anteriormente e protegidos contra regressão.

Na última execução completa, passaram 558 casos: 174 de unidade, 232 de banco e 152 execuções de tela. A contagem de telas inclui a repetição em diferentes tamanhos de dispositivo. A lista de unidade e banco abaixo mostra as declarações coletadas; testes parametrizados geram vários casos na execução, por isso há menos títulos do que casos executados.

Os testes usam banco descartável e rede simulada: não comprovam disponibilidade, desempenho ou funcionamento de serviços externos em produção.

## Regras e integrações isoladas

Conferem regras do aplicativo e respostas simuladas de serviços, sem abrir o navegador.

### buscaPeca.test.ts

Arquivo: [tests/unidade/buscaPeca.test.ts](../tests/unidade/buscaPeca.test.ts)

- busca de peça: código, nome, variante e nota, sem acento nem maiúscula

### carrinho-ler.test.mjs

Arquivo: [tests/unidade/carrinho-ler.test.mjs](../tests/unidade/carrinho-ler.test.mjs)

- V43: checkout com mais de 100 linhas só retorna depois de ler todas as páginas
- V43: token parecido em outra parte da URL não escolhe o checkout errado
- V43: falha no restante das linhas não devolve um carrinho truncado

### carrinho.test.ts

Arquivo: [tests/unidade/carrinho.test.ts](../tests/unidade/carrinho.test.ts)

- V21: variante repetida no link soma as quantidades
- V21: quantidade zero sai do carrinho em vez de virar 1
- V21: leitura da função de checkout também junta repetidas
- link compartilhado continua indo para a função Edge
- V22: /cart/c/ não vai para a função Edge e explica o formato aceito

### catalogo-sync.test.mjs

Arquivo: [tests/unidade/catalogo-sync.test.mjs](../tests/unidade/catalogo-sync.test.mjs)

- V24: variante apagada na Shopify sai do cache; marcador do catálogo não muda
- V26 e V23: produto com mais de 100 variantes lê todas as páginas e só então marca o catálogo
- V46: não avança o marcador do catálogo quando %s na paginação
- V46: incremental não aninha 25 produtos por 100 variantes em uma consulta

### categoria.test.ts

Arquivo: [tests/unidade/categoria.test.ts](../tests/unidade/categoria.test.ts)

- categoria pelo nome da peça > %s → %s
- categoria pelo nome da peça > busca ignora acento e caixa

### desconto.test.ts

Arquivo: [tests/unidade/desconto.test.ts](../tests/unidade/desconto.test.ts)

- cupom da Shopify com percentual
- desconto automático usa o título
- WhatsApp em percentual e depois o percentual da view
- sem percentual conhecido só diz Desconto; cupom antigo vira motivo
- dois descontos juntos não somam percentuais

### etapas.test.ts

Arquivo: [tests/unidade/etapas.test.ts](../tests/unidade/etapas.test.ts)

- cada status pertence a uma fase, sem pedido ficar escondido
- o fluxo normal não pula uma etapa
- nova esteira: Nota fiscal → Embalagem → Frete → Postagem → Enviado
- peça pendente, inclusive adicional, impede completar conferência
- bipagem conta todas as unidades; nenhuma peça viva não é etapa feita
- as adicionais continuam na lista ao separar os grupos
- V18: pedido todo convertido em crédito explica como encerrar
- V37: pedido em desvio conta como a etapa de origem; sem origem, como Separação

### etiquetas.test.ts

Arquivo: [tests/unidade/etiquetas.test.ts](../tests/unidade/etiquetas.test.ts)

- uma etiqueta por unidade, com aviso da peça sem SKU
- lote separa os pedidos sem duplicar as etiquetas
- SKU não injeta comandos na impressora

### filaPedido.test.ts

Arquivo: [tests/unidade/filaPedido.test.ts](../tests/unidade/filaPedido.test.ts)

- fila ainda gravando ao atingir o limite não libera a próxima etapa
- libera a próxima etapa assim que todas as peças terminam

### formato.test.ts

Arquivo: [tests/unidade/formato.test.ts](../tests/unidade/formato.test.ts)

- entrada de valores e contatos > converte %s
- entrada de valores e contatos > V30: recusa %s em vez de inventar valor
- entrada de valores e contatos > V30: aceita %s
- entrada de valores e contatos > qualquer valor em centavos volta do formato brasileiro sem mudar
- entrada de valores e contatos > não monta WhatsApp com telefone %s
- entrada de valores e contatos > telefone colado com +55 mantém DDD e número e não duplica país
- entrada de valores e contatos > prazo formata o instante do banco sem criar outro vencimento

### foto-rede.test.ts

Arquivo: [tests/unidade/foto-rede.test.ts](../tests/unidade/foto-rede.test.ts)

- V54: miniatura Shopify limita a foto original sem alterar URLs externas ou miniaturas menores

### gravarPeca.test.ts

Arquivo: [tests/unidade/gravarPeca.test.ts](../tests/unidade/gravarPeca.test.ts)

- repete somente uma vez após timeout confirmado, com pausa
- não repete erro ambíguo ou recusa: $message
- não repete exceção de rede: a primeira operação pode ter sido gravada

### historico.test.ts

Arquivo: [tests/unidade/historico.test.ts](../tests/unidade/historico.test.ts)

- histórico do pedido > quem: só a parte antes do @, sistema quando não há
- histórico do pedido > categorias: etapas, peças, troca e dinheiro, notas
- histórico do pedido > evento de peça separa o SKU (mono) do resto
- histórico do pedido > quantidade e preço mostram de → para
- histórico do pedido > mudança de etapa usa os nomes das etapas
- histórico do pedido > mudança de situação da peça concorda com o gênero
- histórico do pedido > nota mantém o texto digitado
- histórico do pedido > evento desconhecido não quebra
- histórico do pedido > Hoje, Ontem e data por extenso no fuso de São Paulo
- histórico do pedido > 23h30 de São Paulo continua no dia certo (e não vira o dia seguinte em UTC)
- histórico do pedido > hora em HH:mm de São Paulo
- histórico do pedido > agrupa por dia, do mais novo para o mais antigo
- histórico do pedido > filtro por categoria

### lookup-rede.test.ts

Arquivo: [tests/unidade/lookup-rede.test.ts](../tests/unidade/lookup-rede.test.ts)

- V52: CEP sem resposta termina com erro e libera o formulário
- V52: consulta de CNPJ tenta a reserva e termina quando ambas ficam sem resposta
- contrato CEP: inválido não consulta; inexistente volta null; válido normaliza o endereço

### rede.test.mjs

Arquivo: [tests/unidade/rede.test.mjs](../tests/unidade/rede.test.mjs)

- V31: bloqueia %s (%s)
- V31: permite apenas as leituras conhecidas no domínio correto
- V44: conferência permite a leitura nova %s sem liberar gravação

### regrasEtapas.test.ts

Arquivo: [tests/unidade/regrasEtapas.test.ts](../tests/unidade/regrasEtapas.test.ts)

- V14: menu segue a decisão do banco sem inventar pré-requisitos
- V14: contrato ausente ou ilegível bloqueia a etapa (%j)

### romaneio.test.ts

Arquivo: [tests/unidade/romaneio.test.ts](../tests/unidade/romaneio.test.ts)

- V19: romaneio %s/%s mostra %s

### shopify-clientes.test.mjs

Arquivo: [tests/unidade/shopify-clientes.test.mjs](../tests/unidade/shopify-clientes.test.mjs)

- contrato clientes: busca curta não chama a Shopify
- contrato clientes: telefone %s vira consulta E.164
- contrato clientes: dado da cliente permanece disponível se o campo opcional de CPF falhar
- contrato clientes: erro da busca é informado, sem resultado de sucesso falso
- V68 contrato clientes: CPF do metacampo do cadastro, mesmo sem pedido
- V68 contrato clientes: metacampo do cadastro vence o CPF do último pedido; sem ele, usa o do pedido

### shopify-http.test.mjs

Arquivo: [tests/unidade/shopify-http.test.mjs](../tests/unidade/shopify-http.test.mjs)

- V51: HTTP 429 repete a leitura dentro do prazo e reaproveita o token
- V51: repetições respeitam o prazo total informado pelo chamador
- contrato Shopify: não repete erro permanente de permissão

### shopify-sync.test.mjs

Arquivo: [tests/unidade/shopify-sync.test.mjs](../tests/unidade/shopify-sync.test.mjs)

- V09: %s
- V09: dado financeiro ausente recusa a importação e nunca presume pagamento pelo total
- V10: valor exato por linha fecha com o subtotal da Shopify
- descontos da Shopify entram no pedido bruto; falha na consulta não impede a importação
- V42: não importa composição incompleta quando %s
- V42: mais de 50 linhas são importadas uma vez e com a composição completa

### sincronizar.test.ts

Arquivo: [tests/unidade/sincronizar.test.ts](../tests/unidade/sincronizar.test.ts)

- V25: sincronização incompleta continua de onde parou e soma o resultado
- V25: depois do limite de partes, avisa que ficou incompleto
- tempo limite do banco vira mensagem compreensível
- mudar de etapa espera as peças ainda na fila de gravação do pedido

### tempoReal.test.ts

Arquivo: [tests/unidade/tempoReal.test.ts](../tests/unidade/tempoReal.test.ts)

- tempo real: queda volta ao polling curto e reconexão recarrega dados possivelmente perdidos
- tempo real: agrupa eventos de outra pessoa e aguarda a fila local antes de recarregar
- tempo real: aba escondida não recarrega; recarrega ao voltar a aparecer
- tempo real: aviso de opção da troca recarrega só a troca
- tempo real: aviso do time recarrega só a lista de pessoas, sem tocar nos pedidos

### trocaConclusao.test.ts

Arquivo: [tests/unidade/trocaConclusao.test.ts](../tests/unidade/trocaConclusao.test.ts)

- concluir vale para as escolhas exatas: mudar qualquer peça pede concluir de novo

### trocaTexto.test.ts

Arquivo: [tests/unidade/trocaTexto.test.ts](../tests/unidade/trocaTexto.test.ts)

- texto apresenta a diferença recebida do banco sem somar novamente a quantidade
- valor pago da peça usa a linha de crédito da view
- V38: 'cobrir tudo' é o máximo do banco e só ele conta como tudo
- V38: rótulo mostra o que a Arvenne cobre e o que a cliente paga, com os valores do banco
- V38: texto das opções e do carrinho não chama a diferença coberta de 'a pagar'
- V38: a mensagem para a cliente diz que a loja cobre a diferença sem mostrar o número gigante
- mensagem da troca: texto aprovado, com negrito do WhatsApp (asteriscos) e link em linha própria

### variante.test.ts

Arquivo: [tests/unidade/variante.test.ts](../tests/unidade/variante.test.ts)

- agrupa tamanhos sem misturar pedras ou unidades de medida
- código do modelo preserva os números que não são o tamanho

### varianteClube.test.ts

Arquivo: [tests/unidade/varianteClube.test.ts](../tests/unidade/varianteClube.test.ts)

- monta a variante do Clube no formato do site
- grava em maiúsculas, como a Shopify (inclusive acentos)
- peça com mais de uma variante: tamanho sempre por último, como no site
- sugere o próximo tipo ao adicionar variante
- lê a variante gravada de volta para editar

### versaoNova.test.ts

Arquivo: [tests/unidade/versaoNova.test.ts](../tests/unidade/versaoNova.test.ts)

- V65: pacote da versão antiga > reconhece o erro de pacote que não existe mais
- V65: pacote da versão antiga > recarrega uma vez e não entra em repetição

### vistoria.test.ts

Arquivo: [tests/unidade/vistoria.test.ts](../tests/unidade/vistoria.test.ts)

- aviso do banco preserva a referência do pedido sem recalcular números
- JSON inválido não quebra a navegação

## Banco de dados

Executam as migrations, regras SQL, permissões e cálculos no PostgreSQL descartável.

### conservacao.test.mjs

Arquivo: [tests/banco/conservacao.test.mjs](../tests/banco/conservacao.test.mjs)

- propriedade: dinheiro se conserva em qualquer sequência de somada, troca, retirada, frete e acerto

### creditos.test.mjs

Arquivo: [tests/banco/creditos.test.mjs](../tests/banco/creditos.test.mjs)

- reembolso em 2 passos: pendente, reembolsado e desfazer
- desfazer o acerto cancela o crédito sem apagar e permite registrar de novo
- crédito para o próximo pedido aparece só para a mesma cliente e pode ser usado e desfeito
- mesma cliente por telefone ou CPF, com máscara diferente
- sem saldo a favor não registra crédito; destino inválido é recusado
- equipe só lê créditos; escrita só pelas funções e anon não acessa

### dinheiro.test.mjs

Arquivo: [tests/banco/dinheiro.test.mjs](../tests/banco/dinheiro.test.mjs)

- total depois da troca: desconto fixo
- total depois da troca: desconto fixo + Pix, opção e crédito
- total depois da troca: desconto percentual
- total depois da troca: crédito sem substituição
- total depois da troca: pedido da Shopify soma a diferença
- valores negativos são recusados
- acerto: pendente -> recebido, com evento e acerto_pendente na v_pedidos
- acerto: crédito vira credito_registrado e troca sem diferença não tem acerto
- peça removida depois do pagamento: a devolver + acerto pendente; marcar_devolvido e desfazer
- peça removida no app e reembolsada na Shopify: não desconta duas vezes do total
- venda do WhatsApp: peça removida depois de paga devolve o que passou do total
- Shopify depois da troca: subtotal - desconto + frete = total, e a contagem ignora a peça de troca
- V08: o último acerto incorpora os créditos anteriores ainda não registrados
- cobertura parcial, total e crédito: resumo e troca_publica
- cobertura na troca com várias peças: soma a troca inteira (+13,50 e -5,40)
- cobertura: total do pedido do WhatsApp com desconto em R$ e Pix = original + líquido, identidade do desconto
- cobertura: pedido da Shopify abate o total e v_pedido_acerto fica líquido
- carrinho: concluir fecha o total também no desconto percentual, na Shopify e com cobertura
- V07: acerto e evento usam saldo líquido (preço %s, cobertura %s)
- V11: quantidade e centavos fecham em opção, carrinho, sugestão e conclusão
- V11: meio centavo é arredondado sem perder precisão na divisão do desconto

### entrada-venda.test.mjs

Arquivo: [tests/banco/entrada-venda.test.mjs](../tests/banco/entrada-venda.test.mjs)

- adicionar_itens grava a entrada; somar só junta na mesma entrada; total não muda

### etapas-atomicas.test.mjs

Arquivo: [tests/banco/etapas-atomicas.test.mjs](../tests/banco/etapas-atomicas.test.mjs)

- V57: a primeira peça encontrada tira da fila na mesma transação, sem depender de resposta ao navegador
- V57: %s abre o desvio junto com a peça e preserva a etapa de origem
- V57: falta parcial na Conferência guarda a Conferência, sem perder a origem durante a divisão
- V57: resolver a falta sai do desvio na mesma ação, sem segunda requisição
- V57: a ação atômica só aceita campos da peça e não é pública

### etapas.test.mjs

Arquivo: [tests/banco/etapas.test.mjs](../tests/banco/etapas.test.mjs)

- venda sem peça ou com peça sem preço não entra na expedição
- reiniciar do zero não ressuscita peça removida na venda e restaura a removida depois
- reiniciar só a bipagem zera as bipadas e mantém o resto
- bipar é atômico: duas chamadas somam 2 e nunca passam da quantidade
- adicionar_itens: ordem no banco e soma de quantidade na venda
- reiniciar do zero é recusado se já houve troca concluída (a etapa sozinha continua valendo)
- prazo de envio: fim de semana e feriado contam do 1º dia útil 00h; dia útil mantém a hora
- feriados de 2028: Páscoa em 16/04, Carnaval, Sexta Santa e Corpus Christi nos dias certos
- bipar_ajustar soma e tira no banco, sem passar de 0 nem da quantidade
- falta parcial: 4 viram 3 + 1 em falta, copiando preço pago e linha da Shopify, com evento e bipagem limitada
- falta parcial: quantidade igual ou maior marca a linha inteira e zera as etapas; recusas
- V17: reiniciar e restaurar não recolocam uma peça já devolvida como paga
- V14: cada destino exige o trabalho das etapas anteriores, inclusive nota e postagem
- V14: acerto pendente bloqueia embalagem mesmo com peças e documentos prontos
- V14: inserir diretamente na etapa avançada não contorna os pré-requisitos
- V16: reabrir trabalho em %s retorna o pedido para %s
- V16: restaurar uma removida retorna à separação; pedido enviado recusa reabrir peças
- V16: desfazer %s retorna os documentos para %s
- Frete: desfazer a embalagem ou a nota na etapa Frete volta para onde o trabalho foi reaberto
- Frete: reiniciar a etapa Frete limpa o frete gerado e o peso; a nota e a embalagem ficam
- Frete: peso da caixa só entre 1 g e 30 kg; evento de frete gerado leva o peso
- V18: pedido todo convertido em crédito pode ser encerrado como cancelado depois do acerto

### excluir-duplicar.test.mjs

Arquivo: [tests/banco/excluir-duplicar.test.mjs](../tests/banco/excluir-duplicar.test.mjs)

- excluir venda não paga: some de listas, link e buscas, mas os dados ficam guardados
- excluir: a equipe não marca excluido_em direto nem mexe em pedido excluído
- excluir: pedido do Arquivo sim; pedido na esteira não
- excluir: venda somada não sai sozinha; excluir o principal leva as somadas juntas
- excluir: pedido com troca não pode (dinheiro não some da conta)
- duplicar venda: mesma cliente e peças vivas, nova venda em aberto, sem pagamento
- duplicar: só venda do WhatsApp e não duplica pedido excluído
- excluir e duplicar: anon não chama

### historico-essencial.test.mjs

Arquivo: [tests/banco/historico-essencial.test.mjs](../tests/banco/historico-essencial.test.mjs)

- montando a venda: quantidade, preço e retirada não entram no histórico; depois de paga, entram
- Peças trocadas e removidas: ajuste feito montando a venda somada não aparece no pedido principal
- limpeza: some só o ruído da montagem de vendas; etapas, pagamento e pedidos antigos ficam

### indices-vistoria2.test.mjs

Arquivo: [tests/banco/indices-vistoria2.test.mjs](../tests/banco/indices-vistoria2.test.mjs)

- V48: toda chave estrangeira pública tem índice de apoio nas colunas iniciais

### maquina-estados.test.mjs

Arquivo: [tests/banco/maquina-estados.test.mjs](../tests/banco/maquina-estados.test.mjs)

- propriedade: nenhuma combinação de peças ou documentos libera etapa sem os pré-requisitos

### nota-peca.test.mjs

Arquivo: [tests/banco/nota-peca.test.mjs](../tests/banco/nota-peca.test.mjs)

- nota da peça: grava, troca e apaga, com cada mudança no histórico
- nota da peça: vale em qualquer etapa e não muda status nem etapa
- nota da peça: limite de 500 caracteres; anon não anota

### partes.test.mjs

Arquivo: [tests/banco/partes.test.mjs](../tests/banco/partes.test.mjs)

- V03: troca de adicional conserva cada parte (%s, %s, cobertura %s)
- V03: dividir a adicional preserva seu valor exato e troca só a quantidade em falta
- V03: segunda troca de adicional com cobertura anterior não duplica o abatimento
- V03: cobertura em troca mista é repartida sem perder centavos nem mudar a outra parte
- base financeira é imutável e só o banco pode iniciar o retrato
- V04: retirar adicional devolve uma vez o valor líquido da venda (%s)
- V04: retirada da substituta com cobertura devolve apenas recebido (recebido %s)
- V04: retirada parcial compensa a diferença não recebida antes de calcular devolução

### pecas-desempenho.test.mjs

Arquivo: [tests/banco/pecas-desempenho.test.mjs](../tests/banco/pecas-desempenho.test.mjs)

- V78: avançar as peças não recalcula as regras de retorno do pedido a cada unidade

### permissoes.test.mjs

Arquivo: [tests/banco/permissoes.test.mjs](../tests/banco/permissoes.test.mjs)

- cliente sem login pode escolher, mas não concluir nem ler dados internos
- funções de ação: anon não executa
- funções novas da troca v2: anon não executa
- funções da vistoria: anon não executa nem lê as views
- cobertura: troca cancelada não cobre; trava em troca concluída; anon não lê
- carrinho: anon só usa troca_carrinho, troca_escolher e troca_publica
- conferência somente leitura executa as funções da v_pedidos; anon continua sem acesso
- V23: marcador do catálogo só é lido pela equipe e gravado pela função
- V44: auditoria somente leitura acessa painel e sugestões com o mesmo contrato do app
- feedback de peça: equipe grava peça e código; quem e quando vêm do banco; anon não grava
- Frete e time: peso e responsáveis saem pela v_pedidos; equipe e designar só para quem tem login

### propriedades.test.mjs

Arquivo: [tests/banco/propriedades.test.mjs](../tests/banco/propriedades.test.mjs)

- propriedade: total = peças − desconto − Pix + frete, sem dinheiro negativo
- propriedade: troca comum sem desconto conserva total + diferença líquida
- propriedade: troca com desconto, Pix e cobertura conserva centavos anunciados

### protecoes.test.mjs

Arquivo: [tests/banco/protecoes.test.mjs](../tests/banco/protecoes.test.mjs)

- V20: restrição impede mais bipagens que unidades, inclusive por atualização direta
- adicional e venda de origem precisam ser gravadas juntas
- V27: nem o auxiliar pode ligar opção de outra peça no carrinho
- V27: auxiliar não muda escolha de peça já concluída
- V35: gatilhos antigos não são RPCs públicas
- vigia encontra dado legado de etapa sem alterar pedidos
- vigia grava uma fotografia por execução, inclusive sem ocorrências, e mantém as anteriores
- equipe só lê o vigia; anon não lê nem executa; ninguém do app dispara sua escrita
- agendamento diário aponta para a função de observação, sem credencial ou chamada Edge
- V20: bipar confere o SKU da peça e recusa peça retirada
- V28: valor de opção concluída não pode reescrever o histórico
- V36: calendário cobre até 2040 com a mesma regra e o vigia avisa quando estiver acabando

### recebimentos.test.mjs

Arquivo: [tests/banco/recebimentos.test.mjs](../tests/banco/recebimentos.test.mjs)

- V08: recebimento repetido, estorno e novo recebimento preservam o dinheiro e o histórico
- V08: retirar substituta após receber a diferença devolve apenas o que foi recebido
- V08: mudar para crédito antes de pagar a diferença compensa a cobrança e limita o crédito ao pago
- V08: equipe não altera movimentos; estorno precisa corresponder ao original
- V08: saldo de recebimento legado não é presumido nem pode ser liberado por edição da flag
- V08: incoerência antiga não autoriza receber ou devolver dinheiro pelo saldo inválido
- segunda troca sem diferença não apaga a diferença ainda não recebida da primeira

### repetidas.test.mjs

Arquivo: [tests/banco/repetidas.test.mjs](../tests/banco/repetidas.test.mjs)

- sem seleção, repetidas são as mesmas da view do selo
- seleção conta só os pedidos escolhidos e some peça que deixa de repetir
- cada pedido traz o prazo de envio e vem do mais urgente para o menos
- só a equipe logada consulta as repetidas

### romaneio-total.test.mjs

Arquivo: [tests/banco/romaneio-total.test.mjs](../tests/banco/romaneio-total.test.mjs)

- romaneio_publico traz o total de cada peça (qtd × preço)
- venda somada: retrato das peças também traz o total de cada linha

### seguranca-vistoria2.test.mjs

Arquivo: [tests/banco/seguranca-vistoria2.test.mjs](../tests/banco/seguranca-vistoria2.test.mjs)

- Vistoria 2: todas as tabelas têm RLS e anon não lê nem grava relações internas
- Vistoria 2: V45: todo definer fixa search_path e só quatro funções definer são públicas por token
- Vistoria 2: páginas públicas não expõem dados pessoais nem dados brutos, mesmo nas estruturas aninhadas
- Vistoria 2: token de uma troca não escolhe peça ou opção de outra
- V45: tabela temporária não desvia o histórico de escolha executado pelo definer
- V58: e-mail usado como nome da cliente também é omitido no romaneio público

### shopify.test.mjs

Arquivo: [tests/banco/shopify.test.mjs](../tests/banco/shopify.test.mjs)

- importação: segunda chamada completa número, cidade e UF vazios
- importação: mudança de quantidade na Shopify gera um único evento shopify_alterado
- backfill da Shopify separa o frete grátis do desconto das peças
- importação: preco_pago e frete exatos da Shopify vencem o provisório do backfill
- reembolsado na Shopify cancela o pedido (uma vez só no histórico); novo reembolsado não entra
- reembolso parcial: valor atual é regravado, desconto da carga vale e subtotal - desconto + frete = total
- preco_pago casa por linha da Shopify, mesmo com a mesma variante repetida
- importação: frete_pago_por da equipe fica, retirada vem antes de pac, pago_em estimado é corrigido
- Shopify despachada antes da embalagem só avisa (uma vez), sem mover o pedido
- Shopify despachada: na embalagem ou no frete ainda sem etiqueta só avisa; do frete gerado ou da postagem vai a enviado
- V10: valor exato da linha fecha a composição com o total da Shopify
- V10: pedido novo já entra com o valor exato da linha

### somadas.test.mjs

Arquivo: [tests/banco/somadas.test.mjs](../tests/banco/somadas.test.mjs)

- somar_venda: peças vão para o principal como adicionais, venda vira somada e o total do principal não muda
- somar_venda: principal na conferência ou depois volta para a separação
- somar_venda: recusas
- somar_venda: Pix da venda entra no valor somado e o principal da Shopify mantém o total
- V01: romaneio da venda somada preserva a compra e aponta o principal
- V02: falta parcial adicional conserva dinheiro e origem (%s, %s)
- V05: trocar original com desconto fixo ignora a base das adicionais (%s)

### tempo-real.test.mjs

Arquivo: [tests/banco/tempo-real.test.mjs](../tests/banco/tempo-real.test.mjs)

- tempo real leve: um aviso por comando, com a tabela e os pedidos afetados
- tempo real leve: comando que não muda nada não avisa; troca avisa sem pedido
- tempo real leve: só a equipe logada lê o canal pedidos
- contagem de repetidas confere com a lista completa

### time.test.mjs

Arquivo: [tests/banco/time.test.mjs](../tests/banco/time.test.mjs)

- designar: grava, troca e tira o responsável de uma etapa, com evento e leitura pela v_pedidos
- designar: sem mudança não grava nada nem repete o evento
- designar: recusa etapa inválida, pessoa inativa ou inexistente, pedido arquivado ou excluído
- time: equipe lê, cria e edita; não apaga; anon não acessa; e-mail não repete (sem diferença de caixa)
- time: só designar() grava responsaveis válidos (objeto JSON) e as telas recebem aviso de mudança no time

### trocas.test.mjs

Arquivo: [tests/banco/trocas.test.mjs](../tests/banco/trocas.test.mjs)

- troca por peça do site: preserva quantidade, registra histórico e repetir não duplica
- troca por peça do Clube mantém a origem do catálogo
- desconto fixo + Pix ficam estáveis após conclusão parcial e crédito
- crédito sem substituição guarda a peça original e o valor pago
- se a cliente muda a escolha, a confirmação antiga é recusada sem alterar o pedido
- falha após inserir a substituição desfaz toda a operação
- troca cancelada e peça de outra troca são recusadas
- sugestões calculam o preço com o mesmo desconto do link da cliente
- remover a opção escolhida pede nova resposta e preserva escolhas já concluídas
- garantir_troca e enviar_troca são idempotentes
- troca usa o preco_pago exato da peça em falta; as opções usam preço x fator
- sugerir_troca exclui peças que já estão no pedido, a menos que peça para incluir, e marca no_pedido
- sugerir_troca com p_so_sem_estoque: só vende_sem_estoque true; padrão false mantém tudo; devolve a coluna
- troca_aprovar em troca em rascunho: opção e crédito, concluída na hora, total certo
- troca_aprovar em troca enviada sobrepõe a escolha da cliente; peça já escolhida pela cliente também conclui
- opção sem preço: não vira crédito na view e a troca é recusada (equipe e cliente)
- pedido cancelado cancela as trocas ativas; pedido cancelado ou enviado recusa escolher e concluir
- carrinho: duas opções batendo o valor (diferença 0), menor (crédito) e maior (paga)
- carrinho: limite de 20 unidades, opção inválida e troca já concluída
- carrinho: apagar uma opção tira a escolha dela e acerta escolha_tipo / escolha_opcao_id
- troca_escolher: "Quero esta" mantém a quantidade da linha; crédito e WhatsApp limpam o carrinho
- carrinho: concluir gera uma linha por peça e o total fecha (WhatsApp desconto fixo + Pix)
- carrinho: concluir exige carrinho e preço; p_versao protege contra mudança; 5 argumentos continuam valendo
- troca_aprovar_carrinho aprova o que a cliente montou; troca_aprovar de opção troca o carrinho
- troca: peça que saiu da falta some da página e do resumo, e volta igual se faltar de novo
- V15: peça inativa %s não impede responder nem concluir a troca
- V06: troca direta é atômica e gera acerto no pedido %s
- V06: falha após criar a troca desfaz opções, status e novas peças
- V29: cada mudança do carrinho da troca fica no histórico com as quantidades

### trocas_visiveis.test.mjs

Arquivo: [tests/banco/trocas_visiveis.test.mjs](../tests/banco/trocas_visiveis.test.mjs)

- V37: falta na Conferência leva ao desvio guardando a origem; sair volta à Conferência
- V37: resolvida a falta, o pedido volta à etapa de origem; peça pendente manda para a Separação
- V37: falta na Separação continua voltando para a Separação
- V37: mover manualmente do desvio vai exatamente para onde a pessoa escolheu
- V37: sair do desvio só vale em desvio e a função é só da equipe
- V37: troca só com crédito devolve o pedido à Conferência; troca com peça nova vai à Separação
- V38: valores e carrinho trazem o previsto da cobertura (parcial e tudo)
- V38: cobrir tudo cobre a diferença inteira e o total do pedido não muda
- alterações: troca com cobertura parcial, crédito, peça removida e quantidade reduzida
- alterações: quantidade reduzida depois do pagamento vira linha própria; antes do pagamento não
- alterações: só a equipe lê; anon não
- v_pedidos: subtotal - desconto sem cobertura - cobertura - Pix + frete = total (WhatsApp e Shopify)
- v_pedidos: o mesmo fecha num pedido da Shopify, com e sem cobertura de troca
- v_pedidos: percentual do desconto sobre o subtotal, sem a cobertura da loja
- descontos da Shopify: normaliza cupom, automático, manual e script (percentual ou valor)
- descontos da Shopify: sem a chave fica nulo e mantém o valor antigo; lista vazia é "sem desconto"
- V39: troca_painel devolve num só jsonb o mesmo que a tela montava em várias leituras
- V39: troca_painel traz a cobertura confirmada de cada peça resolvida; anon não executa
- sugerir_troca traz o previsto da cobertura da loja

### venda-completa-frete.test.mjs

Arquivo: [tests/banco/venda-completa-frete.test.mjs](../tests/banco/venda-completa-frete.test.mjs)

- V73: aviso da tela coincide com a regra SQL para cadastro, entrega, retirada e frete grátis
- V73: WhatsApp não sai de venda sem cliente, documento, frete e endereço; retirada dispensa só endereço
- V73: frete da cliente exige valor positivo, grátis não exige valor; somar venda continua usando dados do principal
- V74: correção do frete muda o pago junto, mantém saldo e histórico, sem duplicar ao repetir
- V74: frete preserva Pix, descontos, vendas somadas e reembolso pendente
- V74: dados e correção financeira são uma gravação; falha não deixa edição parcial
- V74: anon, Shopify, Arquivo, venda aberta, somada, excluída e pagamento desconhecido não corrigem frete

### zerar.test.mjs

Arquivo: [tests/banco/zerar.test.mjs](../tests/banco/zerar.test.mjs)

- zerar-testes.sql apaga pedidos, trocas e movimentos e mantém catálogo e feriados

## Testes de tela

Simulam as ações de uma pessoa no navegador. Cada caso informa em quais dispositivos é executado.

### acessibilidade.spec.mjs

Arquivo: [tests/e2e/acessibilidade.spec.mjs](../tests/e2e/acessibilidade.spec.mjs)

- V50: acessibilidade e layout das telas no tema light — celular, pc, tablet.
- V50: acessibilidade e layout das telas no tema dark — celular, pc, tablet.

### busca-etapa.spec.mjs

Arquivo: [tests/e2e/busca-etapa.spec.mjs](../tests/e2e/busca-etapa.spec.mjs)

- busca de peça na separação filtra a fazer e as encontradas — celular, pc.

### catalogo.spec.mjs

Arquivo: [tests/e2e/catalogo.spec.mjs](../tests/e2e/catalogo.spec.mjs)

- catálogo busca, filtra, seleciona e imprime etiquetas — celular, pc.

### cliente-lookup.spec.mjs

Arquivo: [tests/e2e/cliente-lookup.spec.mjs](../tests/e2e/cliente-lookup.spec.mjs)

- V47: resposta atrasada do CNPJ não troca os dados de uma cliente já alterada — celular, pc.

### concorrencia.spec.mjs

Arquivo: [tests/e2e/concorrencia.spec.mjs](../tests/e2e/concorrencia.spec.mjs)

- duplo clique em dois navegadores conserva a peça e registra a ação uma vez — celular, pc.
- V57: resposta perdida depois da gravação recupera o estado ao recarregar, sem repetir o evento — celular, pc.
- HTML, emoji e textos longos são tratados como texto sem execução nem overflow — celular, pc.

### editar-dados.spec.mjs

Arquivo: [tests/e2e/editar-dados.spec.mjs](../tests/e2e/editar-dados.spec.mjs)

- V74: corrigir frete pago mantém saldo zerado e custo da Frenet separado — celular, pc.
- V74: correção recusada não grava os outros dados pela metade — celular, pc.
- editar dados do pedido: trocar o frete e a Arvenne paga a diferença — celular, pc.

### etapa-fila.spec.mjs

Arquivo: [tests/e2e/etapa-fila.spec.mjs](../tests/e2e/etapa-fila.spec.mjs)

- V60: confirmar a próxima etapa com peça ainda gravando não volta a tela para a Separação — celular, pc.
- V61: abrir a etapa atual por "Ver mesmo assim" ainda oferece a próxima etapa ao concluir — celular, pc.
- V62: abrir o pedido com a etapa atual já completa oferece a próxima etapa — celular, pc.
- V63: toques rápidos seguidos marcam todas as peças — celular, pc.
- V64: toques rápidos em Contar 1 contam na hora e oferecem a próxima etapa — celular, pc.

### excluir-duplicar.spec.mjs

Arquivo: [tests/e2e/excluir-duplicar.spec.mjs](../tests/e2e/excluir-duplicar.spec.mjs)

- V69: separação não lista peça removida durante a montagem da venda — celular, pc.
- venda: clique direito duplica e exclui — celular, pc.
- arquivo: clique direito exclui pedido cancelado — celular, pc.

### fluxos.spec.mjs

Arquivo: [tests/e2e/fluxos.spec.mjs](../tests/e2e/fluxos.spec.mjs)

- venda paga entra na expedição com o valor calculado pelo banco — celular, pc.
- clique direito no cartão da venda abre as ações e marca como perdida — celular, pc.
- separação, conferência, etiqueta e bipagem preservam as duas unidades — celular, pc.
- cliente escolhe troca, recupera falha e muda para crédito — celular, pc.
- V06/V08: atalho Trocar cria diferença e o recebimento atualiza o saldo — celular, pc.
- V37: falta na Conferência mantém o pedido na Conferência e resolver volta para ela — celular, pc.
- V01: cliente continua vendo a compra no romaneio da venda somada — celular, pc.
- vigia avisa sem alterar o pedido e mostra o detalhe — celular, pc.
- V31: Edge, Storage e RPC de escrita nunca chegam à rede real — celular, pc.
- foto ampliada tem moldura com espaço e o X fica dentro da foto — celular, pc.
- peças repetidas: seleciona os pedidos do dia e mostra o prazo de cada pedido — celular, pc.
- V33: Clube carrega mais peças além das 30 primeiras — celular, pc.
- V34: busca de vendas acha pedido além dos primeiros da lista — celular, pc.
- troca enviada: sem botão Reenviar e botões de copiar com contorno único no meio — celular, pc.
- crédito da troca: reembolso fica pendente com selo até marcar Reembolsado — celular, pc.
- crédito guardado aparece na próxima venda da mesma cliente e é marcado como usado — celular, pc.
- peças trocadas: selo, diálogo com valores do banco e histórico por filtros — celular, pc.
- etapa Frete: peso da caixa obrigatório antes de gerar o frete e de seguir para a Postagem — celular, pc.
- time: cadastrar pessoa, designar a etapa do pedido e filtrar a Expedição — celular, pc.

### listas-erro.spec.mjs

Arquivo: [tests/e2e/listas-erro.spec.mjs](../tests/e2e/listas-erro.spec.mjs)

- V55: listas explicam falha de rede e recuperam com nova tentativa (light) — celular, pc.
- V55: listas explicam falha de rede e recuperam com nova tentativa (dark) — celular, pc.

### nota-peca.spec.mjs

Arquivo: [tests/e2e/nota-peca.spec.mjs](../tests/e2e/nota-peca.spec.mjs)

- nota da peça: anotar na separação, ver no cartão e na conferência — celular, pc.

### pecas-ajustes.spec.mjs

Arquivo: [tests/e2e/pecas-ajustes.spec.mjs](../tests/e2e/pecas-ajustes.spec.mjs)

- V66: marcar peça troca a tela sem animação de transição — celular, pc.
- feedback da peça pelo menu grava peça e código — celular, pc.
- V67: seletor de quantidade com um traço só em cada junção; venda separa carrinho de peças à mão — celular, pc.
- situação da venda pela lista do topo grava na hora — celular, pc.
- foto ampliada abre no tamanho certo antes da foto grande chegar — celular, pc.
- romaneio: carrossel das peças com valores do banco e resumo fixo — celular, pc.
- Clube: editar peça com mais de uma variante — celular, pc.

### pecas-rajada.spec.mjs

Arquivo: [tests/e2e/pecas-rajada.spec.mjs](../tests/e2e/pecas-rajada.spec.mjs)

- V75: falha numa peça não relê o pedido por cima das outras ainda na fila — celular, pc.
- V76: sequência de peças não recarrega o pedido inteiro entre cada clique — celular, pc.
- V77: timeout confirmado da bipagem pode ser repetido sem contar duas vezes — celular, pc.
- V77: resposta perdida depois de bipar não repete a contagem — celular, pc.
- V75: trinta cliques rápidos sobrevivem a refoco durante a gravação e concluem a etapa — celular, pc.

### romaneio-erro.spec.mjs

Arquivo: [tests/e2e/romaneio-erro.spec.mjs](../tests/e2e/romaneio-erro.spec.mjs)

- V53: falha de rede no romaneio permite tentar novamente (light) — celular, pc.
- V53: falha de rede no romaneio permite tentar novamente (dark) — celular, pc.

### semantica.spec.mjs

Arquivo: [tests/e2e/semantica.spec.mjs](../tests/e2e/semantica.spec.mjs)

- V49: abas e progresso têm nome e vínculo acessíveis (light) — celular, pc, tablet.
- V49: abas e progresso têm nome e vínculo acessíveis (dark) — celular, pc, tablet.
- V59: login tem região principal para leitores de tela (light) — celular, pc, tablet.
- V59: login tem região principal para leitores de tela (dark) — celular, pc, tablet.

### troca-abas.spec.mjs

Arquivo: [tests/e2e/troca-abas.spec.mjs](../tests/e2e/troca-abas.spec.mjs)

- V40: trocar de aba não desloca as abas; V38: Cobrir tudo esconde o campo e o número gigante — celular, pc.
- botões Oferecer alinhados no rodapé dos cartões do catálogo — celular, pc.

### troca-reembolso.spec.mjs

Arquivo: [tests/e2e/troca-reembolso.spec.mjs](../tests/e2e/troca-reembolso.spec.mjs)

- troca: reembolso ou crédito direto na janela (Reembolsar) — celular, pc.
- troca: reembolso ou crédito direto na janela (Guardar para o próximo pedido) — celular, pc.

### venda-pagamento.spec.mjs

Arquivo: [tests/e2e/venda-pagamento.spec.mjs](../tests/e2e/venda-pagamento.spec.mjs)

- V71: pagamento abre com gravação pendente e só confirma com o total atualizado do banco — celular, pc.
- V71: falha na leitura do total bloqueia confirmação e permite recalcular — celular, pc.
- V71: trocar a forma de pagamento recalcula o Pix e descarta uma resposta antiga — celular, pc.
- V73: venda incompleta mostra o que falta e destaca campos antes de pagar — celular, pc.
- V72: venda somada sai do Arquivo e continua dentro do pedido principal — celular, pc.

### venda-rapida.spec.mjs

Arquivo: [tests/e2e/venda-rapida.spec.mjs](../tests/e2e/venda-rapida.spec.mjs)

- V70: venda — quantidade e preço gravam rápido, preço digitado substitui o anterior e o total vem do banco — celular, pc.

### versao-nova.spec.mjs

Arquivo: [tests/e2e/versao-nova.spec.mjs](../tests/e2e/versao-nova.spec.mjs)

- V65: pacote da versão antiga recarrega a página uma vez — celular, pc.

### visual.spec.mjs

Arquivo: [tests/e2e/visual.spec.mjs](../tests/e2e/visual.spec.mjs)

- regressão visual das páginas da cliente (light) — celular, pc.
- regressão visual das páginas da cliente (dark) — celular, pc.
- desempenho: pedido e troca pública abrem dentro do limite local — celular, pc.

## Verificações adicionais

- **Contratos de tipos (`tests/tipos/contratos.ts`):** impede usar tabelas, campos e argumentos de funções que não existem. Compilação, sem execução no banco.
- **Conferência dos tipos das migrations:** detecta definições locais desatualizadas em relação às migrations do projeto.
- **TypeScript:** procura incompatibilidades de dados e chamadas em todo o app e testes.
- **Lint:** procura padrões de código problemáticos.
- **Build:** confirma que o app consegue gerar os arquivos de produção.
- **Referências visuais:** 12 imagens de referência usadas para comparar mudanças nas telas, em celular/PC e temas claro/escuro.
- **`tests/trocas-ui.mjs`:** atalho antigo para executar o teste de escolha de troca; não é um teste adicional.
- **Fixtures, setup e suporte:** preparam dados e banco de teste; não representam casos adicionais.

## Comandos

- `npm test`: verificações, unidade, banco, telas e build.
- `npm run test:rapido`: tipos, lint e unidade.
- `npm run test:banco`: regras do banco.
- `npm run test:e2e`: fluxos do navegador.


## Novos testes da otimização operacional (17/11/2026)

- `tests/banco/operacao-leve.test.mjs`: compara todos os campos da lista leve com a view original nas etapas; cobre troca e crédito no WhatsApp e Shopify; verifica contadores, exclusões e permissões; prova que o pedido comum não precisa acessar a view financeira; preserva retirada, devolução e desfazer. Seis casos executados.
- `tests/unidade/atualizacaoOperacional.test.ts`: dois casos para agrupar eventos locais e Broadcast em três caches, preservar pedidos diferentes e eventos posteriores, esperar gravações e evitar leituras de aba oculta.
- `tests/e2e/pecas-rajada.spec.mjs`: novo caso V80, executado em celular e PC. Confere 30 peças rapidamente, entrega Broadcast a duas telas, exige uma releitura por sequência, verifica o diálogo e abre outro pedido. WebSocket simulado sem conexão externa; não é teste de carga do Supabase.
