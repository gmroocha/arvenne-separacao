# Vistoria 2 — Arvenne Separação

## Retomar daqui

- **Fase/item atual:** Fase 0, medição da linha de base; Fase 1, inventário efetivo.
- **Base:** `3ce7b4a`, árvore limpa no início, 12/11/2026 (São Paulo).
- **Concluído:** leitura de `CLAUDE.md`, Estado atual, Vistoria 1, Testes e Roadmap; regras e autorização desta vistoria registradas neste documento.
- **Em andamento:** `npm test` inicial (log temporário `/tmp/arvenne-vistoria2-baseline.log`); este documento ainda sem commit inicial.
- **Próximo passo exato:** ler resultado do teste inicial, gerar inventário pelo catálogo PostgreSQL em memória e medir banco remoto usando exclusivamente `npx supabase db query --remote --read-only`. Depois investigar cada item, começando por dinheiro e etapas.
- **Ao continuar:** ler esta seção, `git status`, `git log -10`; concluir alterações pendentes antes de iniciar outro defeito.

### Checklist do inventário

- [x] Ler regras, histórico V01–V41, testes e decisões anteriores.
- [ ] Fase 0: testes, lint e bundle por chunk.
- [ ] Fase 0: inconsistências, advisors e planos de consultas remotas.
- [ ] Fase 0: site publicado, métricas móveis e requisições.
- [ ] Fase 1: rotas, componentes de fluxo, integrações e catálogo SQL efetivo.
- [ ] Fase 2: dinheiro e conservação, inclusive desconto composto e reembolso.
- [ ] Fase 2: etapas, desvios, repetição, concorrência e trabalho reaberto.
- [ ] Fase 2: Shopify, catálogo, clientes, carrinho, ViaCEP, Zebra e links.
- [ ] Fase 2: segurança, permissões e páginas públicas.
- [ ] Fase 2: design, acessibilidade e estados nas três larguras e dois temas.
- [ ] Fase 2: desempenho, código e dependências.
- [ ] Fase 3: propriedades, contratos Edge, e2e, visual, axe e desempenho.
- [ ] Fase 4: testes finais, migrations/tipos/Edges necessários, push e conferência publicada.
- [ ] Entrega: Estado atual, métricas antes/depois, pendências e resumo em português.

## Escopo e proteções

Autorização explícita no pedido da Vistoria 2 para migrations (dry-run antes de aplicar), deploy das Edges, regeneração de tipos e push. Não inclui apagar/reconstruir pedidos, alterar segredos ou Authentication, nem chamar Edge fora do login. Testes usam PGlite e credenciais fictícias. Conferência publicada permite login de teste com gravações bloqueadas; nenhum segredo ou dado pessoal será registrado aqui.

Os avisos de ARV-1273/1274/1276/1277 e W0001/W0006/W0007/W0008 são históricos conhecidos: investigar causas, preservar os dados. V01–V41 continuam cobertos pelos testes anteriores; IDs novos começam em V42.

## Linha de base — antes × depois

| Medida | Antes (`3ce7b4a`) | Depois |
| --- | --- | --- |
| `npm test` completo | Em execução | Pendente |
| Lint | Pendente | Pendente |
| Bundle por chunk | Pendente | Pendente |
| Inconsistências remotas | Pendente | Pendente |
| Advisors segurança/desempenho | Pendente | Pendente |
| Planos SQL mais usados | Pendente | Pendente |
| LCP / INP / CLS móvel | Pendente | Pendente |
| Requisições / abertura de telas | Pendente | Pendente |

## Correções e evidências

| ID | Gravidade | Onde / reprodução | Correção | Commit | Teste vermelho → verde |
| --- | --- | --- | --- | --- | --- |

## Decisões tomadas sem o Gustavo

- Preservar comportamentos e decisões de produto documentados; nenhuma limpeza de dados antigos e nenhuma sincronização real durante testes.
- Medidas de laboratório serão identificadas como tal: INP real exige uso e amostragem, não será inventado a partir do tempo de carregamento.
- Não instalar plugins de contas externas para a vistoria: usar ferramentas locais e CLI já disponíveis.

## Pendências e limitações

Preencher com evidência ao concluir cada verificação. Itens ainda desmarcados não foram declarados concluídos.
