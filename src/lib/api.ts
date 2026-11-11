import { keepPreviousData, useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query"
import { flushSync } from "react-dom"
import { toast } from "sonner"
import { supabase, chamarFuncao } from "@/lib/supabase"
import { etapaCompleta } from "@/lib/etapa"
import { intervaloListas } from "@/lib/tempoReal"
import { NOME_ETAPA, STATUS_DA_FASE, type StatusItem, type StatusPedido } from "@/lib/status"
import type { AcertoPedido, CategoriaCatalogo, Cliente, EscolhaTroca, Feedback, ClienteShopify, Endereco, Evento, FiltrosSugestao, Item, ModoSugestao, NovoItem, PecaClube, PecaRepetida, Pedido, ResultadoBipagem, Romaneio, Sugestao, Troca, TrocaCarrinho, TrocaEscolha, TrocaOpcao, TrocaPeca, TrocaPublica, TrocaResumo, TrocaValor, ValorPago } from "@/lib/tipos"

export const msg = (e: unknown) => (e instanceof Error ? e.message : (e as { message?: string })?.message ?? "Erro inesperado")

// Banco ainda sem a migration de uma função/tabela nova: mensagem clara em vez do erro cru.
const semFuncao = (e: unknown) => /could not find the function|could not find the table|does not exist|schema cache|relationship/i.test(`${msg(e)} ${(e as { details?: string })?.details ?? ""}`)
export const msgBanco = (e: unknown) => (semFuncao(e) ? "Atualize o banco para usar esta função" : msg(e))

export type PedidoLista = Pedido
export type PedidoDetalhe = Pedido & { pedido_itens: Item[]; pedido_eventos: Evento[] }
export type VarianteSite = Omit<NovoItem, "chave" | "origem" | "peca_clube_id" | "qtd">

// Tamanho máximo das listas de uma fase; ao bater, a tela avisa que pode haver mais.
export const LIMITE_LISTA = 300

// Listas de uma fase, lidas de v_pedidos (o banco calcula total, prazo e contagens).
export function usePedidosFase(fase: "venda" | "expedicao") {
  return useQuery({
    queryKey: ["pedidos", fase],
    refetchInterval: intervaloListas,
    queryFn: async () => {
      let q = supabase.from("v_pedidos").select("*").in("status", STATUS_DA_FASE[fase]).limit(LIMITE_LISTA)
      q = fase === "expedicao"
        ? q.order("prazo", { ascending: true, nullsFirst: false })
        : q.order("pedido_em", { ascending: false })
      const { data, error } = await q
      if (error) throw error
      return data as Pedido[]
    },
  })
}

// Pedidos do WhatsApp já enviados cuja cliente ainda não recebeu o rastreio (coluna "Enviar rastreio").
export function usePendentesRastreio() {
  return useQuery({
    queryKey: ["pedidos", "rastreio"],
    refetchInterval: intervaloListas,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_pedidos")
        .select("*")
        .eq("pendente_rastreio", true)
        .order("status_desde", { ascending: true })
        .limit(100)
      if (error) throw error
      return data as Pedido[]
    },
  })
}

export function useArquivo(busca: string, limite: number) {
  return useQuery({
    queryKey: ["pedidos", "arquivo", busca, limite],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      let q = supabase
        .from("v_pedidos")
        .select("*")
        .in("status", STATUS_DA_FASE.arquivo)
        .order("status_desde", { ascending: false })
        .limit(limite)
      const t = busca.trim().replace(/[%,()]/g, " ")
      if (t) {
        const d = t.replace(/\D/g, "")
        q = q.or(
          [`numero.ilike.%${t}%`, `cliente_nome.ilike.%${t}%`, `cliente_telefone.ilike.%${t}%`, d.length >= 3 ? `cliente_telefone.ilike.%${d}%` : null]
            .filter(Boolean)
            .join(","),
        )
      }
      const { data, error } = await q
      if (error) throw error
      return data as Pedido[]
    },
  })
}

// Contagens da barra lateral: vendas em aberto e pedidos da expedição atrasados.
export function useContagens() {
  return useQuery({
    queryKey: ["pedidos", "contagem"],
    refetchInterval: intervaloListas,
    queryFn: async () => {
      const [a, b] = await Promise.all([
        supabase.from("v_pedidos").select("id", { count: "exact", head: true }).eq("status", "em_aberto"),
        supabase
          .from("v_pedidos")
          .select("id", { count: "exact", head: true })
          .in("status", STATUS_DA_FASE.expedicao)
          .lt("prazo", new Date().toISOString()),
      ])
      if (a.error) throw a.error
      if (b.error) throw b.error
      return { emAberto: a.count ?? 0, atrasados: b.count ?? 0 }
    },
  })
}

export function usePedido(id: string | undefined) {
  return useQuery({
    queryKey: ["pedido", id],
    enabled: !!id,
    queryFn: async () => {
      const [p, i, e] = await Promise.all([
        supabase.from("v_pedidos").select("*").eq("id", id!).single(),
        supabase.from("pedido_itens").select("*").eq("pedido_id", id!).order("ordem"),
        supabase.from("pedido_eventos").select("*").eq("pedido_id", id!).order("created_at", { ascending: false }),
      ])
      if (p.error) throw p.error
      if (i.error) throw i.error
      if (e.error) throw e.error
      return { ...(p.data as Pedido), pedido_itens: i.data as Item[], pedido_eventos: e.data as Evento[] } as PedidoDetalhe
    },
  })
}

export function useRomaneio(token: string | undefined) {
  return useQuery({
    queryKey: ["romaneio", token],
    enabled: !!token,
    refetchInterval: 30_000,
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("romaneio_publico", { p_token: token })
      if (error) return null
      return (data as Romaneio | null) ?? null
    },
  })
}

export function useRepetidas() {
  return useQuery({
    queryKey: ["repetidas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_pecas_em_varios_pedidos")
        .select("*")
        .order("qtd_pedidos", { ascending: false })
      if (error) throw error
      return data as PecaRepetida[]
    },
  })
}

// Contagem das peças em vários pedidos, só para o selo da barra lateral (não carrega as linhas).
export function useContagemRepetidas() {
  return useQuery({
    queryKey: ["repetidas", "contagem"],
    queryFn: async () => {
      const { count, error } = await supabase.from("v_pecas_em_varios_pedidos").select("chave", { count: "exact", head: true })
      if (error) throw error
      return count ?? 0
    },
  })
}

export function usePecasClube(busca: string, incluirInativas = false) {
  return useQuery({
    queryKey: ["clube", busca, incluirInativas],
    queryFn: async () => {
      let q = supabase.from("pecas_clube").select("*").order("created_at", { ascending: false }).limit(30)
      if (!incluirInativas) q = q.eq("ativo", true)
      const t = busca.trim().replace(/[%,()]/g, " ")
      if (t) q = q.or(`codigo.ilike.%${t}%,nome.ilike.%${t}%`)
      const { data, error } = await q
      if (error) throw error
      return data as (PecaClube & { ativo: boolean })[]
    },
  })
}

type LinhaCatalogo = {
  variant_id: number
  sku: string | null
  produto: string
  variante: string | null
  preco: number | null
  foto_url: string | null
}

const paraVariante = (r: LinhaCatalogo): VarianteSite => ({
  shopify_variant_id: r.variant_id,
  sku: r.sku,
  nome: r.produto,
  variante: r.variante,
  foto_url: r.foto_url,
  preco: r.preco,
})

// Aba "Site": busca no catálogo copiado da Shopify (catalogo_site), só produtos ativos.
export function useBuscaSite(termo: string) {
  return useQuery({
    queryKey: ["busca-site", termo],
    enabled: termo.length >= 2,
    queryFn: async () => {
      const t = termo.replace(/[%,()]/g, " ").trim()
      const { data, error } = await supabase
        .from("catalogo_site")
        .select("variant_id, sku, produto, variante, preco, foto_url")
        .or(`produto.ilike.%${t}%,sku.ilike.%${t}%`)
        .or("status.is.null,status.eq.ACTIVE")
        .order("produto")
        .limit(30)
      if (error) throw error
      return (data as LinhaCatalogo[]).map(paraVariante)
    },
  })
}

// Resolve as variantes do carrinho. Antes de ler, pede à Shopify (via catalogo-sync) as variantes
// do carrinho, para preço e foto virem atuais. Se a Shopify não responder (credencial ausente,
// fora do ar), usa a cópia do banco. IDs que faltam voltam em "faltando".
export async function buscarVariantes(variantIds: string[]) {
  try {
    await chamarFuncao("catalogo-sync", { variantIds })
  } catch {
    // segue com a cópia local
  }
  const { data, error } = await supabase
    .from("catalogo_site")
    .select("variant_id, sku, produto, variante, preco, foto_url")
    .in("variant_id", variantIds)
  if (error) throw error
  const achadas = (data as LinhaCatalogo[]).map(paraVariante)
  const ids = new Set(achadas.map((v) => String(v.shopify_variant_id)))
  return { variantes: achadas, faltando: variantIds.filter((id) => !ids.has(String(id))) }
}

// Quantas variantes o catálogo copiado tem (0 = ainda não foi carregado da Shopify).
export function useCatalogoTotal() {
  return useQuery({
    queryKey: ["catalogo-total"],
    queryFn: async () => {
      const { count, error } = await supabase.from("catalogo_site").select("variant_id", { count: "exact", head: true })
      if (error) throw error
      return count ?? 0
    },
  })
}

export function useAtualizarCatalogo() {
  return useAcao(
    () => chamarFuncao<{ variantes: number; removidas?: number }>("catalogo-sync", {}),
    [["busca-site"], ["catalogo-total"]],
  )
}

function useAcao<A, R = unknown>(fn: (a: A) => Promise<R>, invalidar: unknown[][], aoConcluir?: (r: R, a: A) => void) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: (r, a) => {
      invalidar.forEach((queryKey) => qc.invalidateQueries({ queryKey }))
      aoConcluir?.(r, a)
    },
    onError: (e) => toast.error(msg(e)),
  })
}

const TODAS = [["pedidos"], ["pedido"], ["repetidas"], ["acerto"], ["etiquetar"]]

export type ItemPatch = Partial<
  Pick<Item, "status" | "observacao" | "conferido_em" | "etiquetado_em" | "etiqueta_previa" | "qtd_bipada" | "bipado_em" | "qtd" | "preco">
>

const chavePedido = (id: string) => ["pedido", id]

// Troca de cache com transição suave (os blocos deslizam para o lugar em vez de pular).
// Sem suporte do navegador, ou com "reduzir movimento", troca direto como sempre.
function comTransicao(trocar: () => void) {
  const doc = document as Document & { startViewTransition?: (cb: () => Promise<void>) => unknown }
  const reduzir = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  if (typeof doc.startViewTransition !== "function" || reduzir) return trocar()
  try {
    doc.startViewTransition(async () => {
      flushSync(trocar)
      // O TanStack avisa a tela num setTimeout(0): dá um respiro para o React desenhar o novo estado.
      await new Promise((r) => setTimeout(r, 30))
    })
  } catch {
    trocar()
  }
}

// Troca o pedido em cache na hora e devolve o estado anterior, para desfazer se o banco recusar.
function aplicarNoCache(qc: QueryClient, id: string, mudar: (p: PedidoDetalhe) => PedidoDetalhe) {
  const anterior = qc.getQueryData<PedidoDetalhe>(chavePedido(id))
  if (anterior) qc.setQueryData<PedidoDetalhe>(chavePedido(id), mudar(anterior))
  return anterior
}

// Muda a etapa do pedido. A tela atualiza antes do banco responder; se falhar, volta ao que era.
export function useMudarStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ pedidoId, para, campos }: { pedidoId: string; para: StatusPedido; campos?: CamposPedido; silencioso?: boolean }) => {
      const { error } = await supabase.from("pedidos").update({ status: para, ...campos }).eq("id", pedidoId)
      if (error) throw error
    },
    onMutate: async ({ pedidoId, para, campos }) => {
      await qc.cancelQueries({ queryKey: chavePedido(pedidoId) })
      await qc.cancelQueries({ queryKey: ["pedidos"] })
      // Listas (esteira) também mudam na hora, para o cartão arrastado não "voltar" até o refetch.
      const listas = qc.getQueriesData({ queryKey: ["pedidos"] })
      qc.setQueriesData({ queryKey: ["pedidos"] }, (old: unknown) =>
        Array.isArray(old)
          ? old.map((p: { id: string }) => (p.id === pedidoId ? { ...p, ...campos, status: para, status_desde: new Date().toISOString() } : p))
          : old,
      )
      return { listas, anterior: aplicarNoCache(qc, pedidoId, (p) => ({ ...p, ...campos, status: para, status_desde: new Date().toISOString() })) }
    },
    onError: (e, a, ctx) => {
      if (ctx?.anterior) qc.setQueryData(chavePedido(a.pedidoId), ctx.anterior)
      ctx?.listas.forEach(([chave, dados]) => qc.setQueryData(chave, dados))
      toast.error(msg(e))
    },
    onSuccess: (_, a) => {
      if (!a.silencioso) toast.success(`Pedido movido para ${NOME_ETAPA[a.para]}`)
    },
    onSettled: (_, __, a) => {
      // Com gravações de peça ainda na fila, recarregar agora traria a peça "antiga" de volta por um
      // instante. A própria fila recarrega o pedido quando esvazia.
      if (qc.isMutating({ mutationKey: ["item", a.pedidoId] }) === 0) {
        qc.invalidateQueries({ queryKey: chavePedido(a.pedidoId) })
      }
      qc.invalidateQueries({ queryKey: ["pedidos"] })
      qc.invalidateQueries({ queryKey: ["acerto"] })
      qc.invalidateQueries({ queryKey: ["etiquetar"] })
    },
  })
}

// Atualiza campos do pedido (sem toast): usado pelo salvamento automático e pelas ações das telas.
export type CamposPedido = Partial<
  Pick<
    Pedido,
    | "cliente_id" | "cliente_nome" | "cliente_telefone" | "cliente_email" | "cliente_cpf" | "cliente_razao_social" | "cliente_ie"
    | "entrega_cep" | "entrega_logradouro" | "entrega_numero" | "entrega_complemento"
    | "entrega_bairro" | "entrega_cidade" | "entrega_uf"
    | "desconto_tipo" | "desconto_valor" | "cupom"
    | "frete_tipo" | "frete_pago_por" | "frete_cobrado" | "frete_custo"
    | "forma_pagamento" | "valor_pago" | "pago_em" | "data_compra"
    | "status" | "rastreio" | "observacoes"
    | "nf_numero" | "nf_emitida_em" | "frete_gerado_em" | "frete_servico" | "rastreio_url"
    | "pedido_fornecedor_numero" | "pedido_fornecedor_em" | "embalado_em" | "postado_em" | "rastreio_enviado_em"
  >
>

export async function atualizarPedido(pedidoId: string, campos: CamposPedido) {
  const { error } = await supabase.from("pedidos").update(campos).eq("id", pedidoId)
  if (error) throw error
}

export function useAtualizarPedido(invalidar: unknown[][] = TODAS) {
  return useAcao(({ pedidoId, campos }: { pedidoId: string; campos: CamposPedido }) => atualizarPedido(pedidoId, campos), invalidar)
}

// Versão da tela do pedido: grava campos do pedido com atualização imediata e volta atrás se falhar.
export function usePatchPedido(pedidoId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationKey: ["patch-pedido", pedidoId],
    scope: { id: `pedido-${pedidoId}` },
    mutationFn: (campos: CamposPedido) => atualizarPedido(pedidoId, campos),
    onMutate: async (campos) => {
      await qc.cancelQueries({ queryKey: chavePedido(pedidoId) })
      return { anterior: aplicarNoCache(qc, pedidoId, (p) => ({ ...p, ...campos })) }
    },
    onError: (e, _, ctx) => {
      if (ctx?.anterior) qc.setQueryData(chavePedido(pedidoId), ctx.anterior)
      toast.error(msg(e))
    },
    onSettled: () => {
      if (qc.isMutating({ mutationKey: ["patch-pedido", pedidoId] }) <= 1) {
        qc.invalidateQueries({ queryKey: chavePedido(pedidoId) })
        qc.invalidateQueries({ queryKey: ["pedidos"] })
      }
    },
  })
}

const ESTADOS_DE_PECAS: StatusPedido[] = ["novo", "separacao", "conferencia", "etiquetagem", "bipagem"]
const ZERAR_ETAPAS = { conferido_em: null, etiquetado_em: null, etiqueta_previa: false, qtd_bipada: 0, bipado_em: null } as const

// Todas as ações numa peça (achei, conferida, etiquetada, bipada, desfazer, falta, defeito...).
// A peça muda na tela na hora; o banco confirma em seguida, uma gravação por vez por pedido.
// Efeitos no pedido (nada disso trava o clique):
//  - falta/defeito leva o pedido a "aguardando cliente";
//  - resolvidos os problemas, ele volta a "separação";
//  - primeira peça achada tira o pedido de "novo";
//  - ao completar a etapa, chama aoCompletar (a tela abre o Dialog; quem muda de etapa é a pessoa).
export function useAcoesItem(pedidoId: string, aoCompletar?: (etapa: StatusPedido) => void) {
  const qc = useQueryClient()
  const mudarStatus = useMudarStatus()
  const chave = ["item", pedidoId]

  const gravar = useMutation({
    mutationKey: chave,
    scope: { id: `pedido-${pedidoId}` },
    mutationFn: async ({ itemId, campos, codigo, delta }: { itemId: string; campos: ItemPatch; codigo?: string; delta?: number }): Promise<ResultadoBipagem | null> => {
      // Com código (bipagem), o banco soma 1 e registra o histórico: duas leituras seguidas contam as duas.
      if (codigo) {
        const { data, error } = await supabase.rpc("bipar", { p_pedido: pedidoId, p_item: itemId, p_codigo: codigo })
        if (error) throw error
        return data as ResultadoBipagem
      }
      // "Contar 1" / "Tirar 1": o banco soma ou tira 1 (sem sair de 0..qtd), sem depender da tela.
      if (delta) {
        const { error } = await supabase.rpc("bipar_ajustar", { p_item: itemId, p_delta: delta })
        if (error) throw error
        return null
      }
      const { error } = await supabase.from("pedido_itens").update(campos).eq("id", itemId)
      if (error) throw error
      return null
    },
    onError: (e) => {
      toast.error(msg(e))
      qc.invalidateQueries({ queryKey: chavePedido(pedidoId) }) // volta ao que o banco tem
    },
    onSettled: () => {
      if (qc.isMutating({ mutationKey: chave }) <= 1) {
        qc.invalidateQueries({ queryKey: chavePedido(pedidoId) })
        qc.invalidateQueries({ queryKey: ["pedidos"] })
        qc.invalidateQueries({ queryKey: ["repetidas"] })
        qc.invalidateQueries({ queryKey: ["acerto"] })
        qc.invalidateQueries({ queryKey: ["etiquetar"] })
      }
    },
  })

  // Com codigo (leitura do leitor) devolve o resultado do banco; com delta (+1/-1) o banco ajusta a contagem.
  return (item: Item, campos: ItemPatch, codigo?: string, delta?: number): Promise<ResultadoBipagem | null> | void => {
    const atual = qc.getQueryData<PedidoDetalhe>(chavePedido(pedidoId))
    if (!atual) return
    const patch: ItemPatch = campos.status && campos.status !== "encontrado" ? { ...ZERAR_ETAPAS, ...campos } : campos
    const antes = atual.pedido_itens
    const depois = antes.map((i) => (i.id === item.id ? { ...i, ...patch } : i))
    // Cancela uma leitura em andamento (ela traria o estado velho de volta) e grava sobre o que está no cache agora.
    void qc.cancelQueries({ queryKey: chavePedido(pedidoId) })
    comTransicao(() =>
      qc.setQueryData<PedidoDetalhe>(chavePedido(pedidoId), (old) =>
        old ? { ...old, pedido_itens: old.pedido_itens.map((i) => (i.id === item.id ? { ...i, ...patch } : i)) } : old,
      ),
    )
    const resultado = gravar.mutateAsync({ itemId: item.id, campos: patch, codigo, delta }).catch(() => null)

    let estado = atual.status
    if (campos.status) {
      const vivos = depois.filter((i) => i.status !== "removido")
      const problemas = vivos.some((i) => i.status === "falta" || i.status === "defeito")
      let destino: StatusPedido | null = null
      if (problemas && ESTADOS_DE_PECAS.includes(estado)) {
        destino = "avisar_cliente"
        toast.info("Avise a cliente sobre a peça em falta")
      } else if (!problemas && (estado === "avisar_cliente" || estado === "aguardando_cliente")) destino = "separacao"
      else if (estado === "novo" && campos.status === "encontrado") destino = "separacao"
      if (destino) {
        estado = destino
        mudarStatus.mutate({ pedidoId, para: destino, silencioso: true })
      }
    }
    if (etapaCompleta(estado, depois) && !etapaCompleta(estado, antes)) aoCompletar?.(estado)
    return resultado
  }
}

// Falta parcial: "faltam N de M". O banco divide a linha (função marcar_falta): o resto segue na separação
// e as N em falta viram uma linha nova. Com N igual à quantidade, é a linha inteira. Como em useAcoesItem,
// a primeira peça em falta leva o pedido a "avisar cliente".
export function useMarcarFalta(pedidoId: string) {
  const qc = useQueryClient()
  const mudarStatus = useMudarStatus()
  return useMutation({
    mutationKey: ["item", pedidoId],
    scope: { id: `pedido-${pedidoId}` },
    mutationFn: async ({ item, qtd, status = "falta" }: { item: Item; qtd: number; status?: "falta" | "defeito" }) => {
      const { error } = await supabase.rpc("marcar_falta", { p_item: item.id, p_qtd: qtd, p_status: status })
      if (error) throw error
    },
    onSuccess: () => {
      const atual = qc.getQueryData<PedidoDetalhe>(chavePedido(pedidoId))
      if (atual && ESTADOS_DE_PECAS.includes(atual.status)) {
        toast.info("Avise a cliente sobre a peça em falta")
        mudarStatus.mutate({ pedidoId, para: "avisar_cliente", silencioso: true })
      }
    },
    onError: (e) => toast.error(msgBanco(e)),
    onSettled: () => {
      if (qc.isMutating({ mutationKey: ["item", pedidoId] }) <= 1) {
        ;[chavePedido(pedidoId), ["pedidos"], ["troca"], ["repetidas"], ["acerto"], ["etiquetar"]].forEach((queryKey) => qc.invalidateQueries({ queryKey }))
      }
    },
  })
}

// Reiniciar: zera o trabalho de uma etapa (ou de todas) para refazer, numa transação no banco
// (função reiniciar_pedido). Nada é apagado: histórico de bipagens e números digitados (nota, LR) ficam
// guardados. "Do zero" devolve o pedido ao estado original: peças que entraram por troca saem, a troca
// em andamento é cancelada e as peças removidas depois da venda voltam (as tiradas na venda não).
export function useReiniciar(pedidoId: string) {
  const qc = useQueryClient()
  return useMutation({
    scope: { id: `pedido-${pedidoId}` },
    mutationFn: async ({ tudo, etapa }: { tudo: boolean; etapa: StatusPedido }) => {
      const { error } = await supabase.rpc("reiniciar_pedido", { p_pedido: pedidoId, p_etapa: etapa, p_tudo: tudo })
      if (error) throw error
    },
    onSuccess: (_, a) => toast.success(a.tudo ? "Pedido reiniciado" : "Etapa reiniciada"),
    onError: (e) => toast.error(msg(e)),
    onSettled: () => [...TODAS, ["troca"]].forEach((queryKey) => qc.invalidateQueries({ queryKey })),
  })
}

// Leitura do leitor de código: soma 1 na peça (sem passar da quantidade) e grava o histórico em "bipagens",
// tudo no banco (função bipar). Sem itemId, registra "fora_do_pedido". Devolve o resultado.
export async function registrarBipagem(pedidoId: string, itemId: string | null, codigo: string): Promise<ResultadoBipagem | null> {
  const { data, error } = await supabase.rpc("bipar", { p_pedido: pedidoId, p_item: itemId, p_codigo: codigo })
  if (error) {
    toast.error(msg(error))
    return null
  }
  return data as ResultadoBipagem
}

export function useAtualizarItem() {
  return useAcao(
    async ({ itemId, campos }: { itemId: string; campos: { qtd?: number; preco?: number | null; status?: StatusItem } }) => {
      const { error } = await supabase.from("pedido_itens").update(campos).eq("id", itemId)
      if (error) throw error
    },
    TODAS,
  )
}

// Venda (WhatsApp): qtd, preço e remover mudam na tela na hora; o banco grava em fila.
// O total continua vindo do banco (v_pedidos) e atualiza quando a fila esvazia.
export function useAcoesItemVenda(pedidoId: string) {
  const qc = useQueryClient()
  const chave = ["item-venda", pedidoId]
  const gravar = useMutation({
    mutationKey: chave,
    scope: { id: `pedido-${pedidoId}` },
    mutationFn: async ({ itemId, campos }: { itemId: string; campos: ItemPatch }) => {
      const { error } = await supabase.from("pedido_itens").update(campos).eq("id", itemId)
      if (error) throw error
    },
    onMutate: async ({ itemId, campos }) => {
      await qc.cancelQueries({ queryKey: chavePedido(pedidoId) })
      return {
        anterior: aplicarNoCache(qc, pedidoId, (p) => ({
          ...p,
          pedido_itens: p.pedido_itens.map((i) => (i.id === itemId ? { ...i, ...campos } : i)),
        })),
      }
    },
    onError: (e, _, ctx) => {
      if (ctx?.anterior) qc.setQueryData(chavePedido(pedidoId), ctx.anterior)
      toast.error(msg(e))
    },
    onSettled: () => {
      if (qc.isMutating({ mutationKey: chave }) <= 1) {
        qc.invalidateQueries({ queryKey: chavePedido(pedidoId) })
        qc.invalidateQueries({ queryKey: ["pedidos"] })
      }
    },
  })
  return (itemId: string, campos: ItemPatch) => gravar.mutate({ itemId, campos })
}

// Com somar (só na venda), peça já no pedido ganha quantidade em vez de uma linha nova.
// A ordem das linhas e a soma são feitas no banco (função adicionar_itens), numa transação.
export function useAdicionarItens() {
  return useAcao(
    async ({ pedidoId, itens, somar, jaEncontradas }: { pedidoId: string; itens: NovoItem[]; somar?: boolean; jaEncontradas?: boolean }) => {
      if (!itens.length) return
      const linhas = itens.map((i) => ({
        origem: i.origem,
        shopify_variant_id: i.shopify_variant_id,
        peca_clube_id: i.peca_clube_id,
        sku: i.sku,
        nome: i.nome,
        variante: i.variante,
        foto_url: i.foto_url,
        qtd: i.qtd,
        preco: i.preco,
      }))
      // Peças pendentes de antes: não podem virar "encontrado" junto com as novas.
      let antes = new Set<string>()
      if (jaEncontradas) {
        const { data, error: e0 } = await supabase.from("pedido_itens").select("id").eq("pedido_id", pedidoId).eq("status", "pendente")
        if (e0) throw e0
        antes = new Set((data ?? []).map((r) => r.id as string))
      }
      const { error } = await supabase.rpc("adicionar_itens", { p_pedido: pedidoId, p_itens: linhas, p_somar: !!somar })
      if (error) throw error
      // Peça que entra depois da separação (conferência, etiquetagem, bipagem) já vale como encontrada:
      // as etapas só listam e contam peças encontradas. Peça nova nasce "pendente".
      if (jaEncontradas) {
        const { data, error: e1 } = await supabase.from("pedido_itens").select("id").eq("pedido_id", pedidoId).eq("status", "pendente")
        if (e1) throw e1
        const novas = (data ?? []).map((r) => r.id as string).filter((id) => !antes.has(id))
        if (novas.length) {
          const { error: e2 } = await supabase.from("pedido_itens").update({ status: "encontrado" }).in("id", novas)
          if (e2) throw e2
        }
      }
    },
    TODAS,
  )
}

export function useAdicionarNota() {
  return useAcao(
    async ({ pedidoId, texto }: { pedidoId: string; texto: string }) => {
      const { data: u } = await supabase.auth.getUser()
      const { error } = await supabase
        .from("pedido_eventos")
        .insert({ pedido_id: pedidoId, tipo: "nota", texto, usuario_email: u.user?.email ?? null })
      if (error) throw error
    },
    [["pedido"]],
  )
}

export function useCriarVenda() {
  return useAcao(
    async () => {
      const { data, error } = await supabase.rpc("criar_venda", { p: {} })
      if (error) throw error
      return (data as { id: string; numero: string }[])[0]
    },
    TODAS,
  )
}

export type DadosCliente = {
  nome: string
  cpf: string | null
  razao_social?: string | null
  ie?: string | null
  email: string | null
  telefone: string | null
  shopify_customer_id?: number | null
} & Partial<Endereco>

const soDigitos = (t: string | null | undefined) => (t ?? "").replace(/\D/g, "")
const semAcento = (t: string | null | undefined) =>
  (t ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim()

// Cria ou atualiza a cliente em "clientes" (telefone, CPF e CEP só com dígitos) e devolve o id.
export async function salvarCliente(id: string | null, d: DadosCliente): Promise<string> {
  const linha = {
    nome: d.nome.trim(),
    cpf: soDigitos(d.cpf) || null,
    razao_social: d.razao_social?.trim() || null,
    ie: d.ie?.trim() || null,
    email: d.email?.trim().toLowerCase() || null,
    telefone: soDigitos(d.telefone) || null,
    cep: soDigitos(d.cep) || null,
    logradouro: d.logradouro?.trim() || null,
    numero: d.numero?.trim() || null,
    complemento: d.complemento?.trim() || null,
    bairro: d.bairro?.trim() || null,
    cidade: d.cidade?.trim() || null,
    uf: d.uf?.trim().toUpperCase() || null,
    ...(d.shopify_customer_id ? { shopify_customer_id: d.shopify_customer_id } : {}),
  }
  let alvo = id
  if (!alvo) {
    // Evita duplicar: CPF identifica a pessoa. Telefone e e-mail são compartilhados (mãe e filha, o
    // mesmo contato), então só valem se o nome também for o mesmo; senão nasce uma cliente nova.
    if (linha.cpf) {
      const { data, error } = await supabase.from("clientes").select("id").eq("cpf", linha.cpf).limit(1)
      if (error) throw error
      alvo = data?.[0]?.id ?? null
    }
    // Valores entre aspas: e-mail com vírgula ou parêntese não quebra o filtro.
    const aspas = (v: string) => `"${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`
    const filtros = [
      linha.email ? `email.eq.${aspas(linha.email)}` : null,
      linha.telefone ? `telefone.eq.${aspas(linha.telefone)}` : null,
    ].filter(Boolean)
    if (!alvo && filtros.length) {
      const { data, error } = await supabase.from("clientes").select("id, nome").or(filtros.join(",")).limit(20)
      if (error) throw error
      alvo = data?.find((c) => semAcento(c.nome) === semAcento(linha.nome))?.id ?? null
    }
  }
  if (alvo) {
    // Ao atualizar, campo vazio não apaga o que já está guardado no cadastro.
    const parcial = Object.fromEntries(Object.entries(linha).filter(([, v]) => v != null && v !== ""))
    const { error } = await supabase.from("clientes").update(parcial).eq("id", alvo)
    if (error) throw error
    return alvo
  }
  const { data, error } = await supabase.from("clientes").insert(linha).select("id").single()
  if (error) throw error
  return data.id as string
}

// Busca única: telefone, e-mail, nome ou CPF. Primeiro em "clientes"; a Shopify é complemento
// (sem a função publicada, a busca segue só com o cadastro daqui, sem erro na tela).
export function useBuscaClientes(termo: string) {
  const t = termo.trim().replace(/[%,()]/g, " ")
  const d = soDigitos(t)
  const local = useQuery({
    queryKey: ["clientes", t],
    enabled: t.length >= 2,
    queryFn: async () => {
      const filtros = [`nome.ilike.%${t}%`, `email.ilike.%${t}%`]
      if (d.length >= 3) filtros.push(`telefone.ilike.%${d}%`, `cpf.ilike.%${d}%`)
      const { data, error } = await supabase.from("clientes").select("*").or(filtros.join(",")).order("nome").limit(8)
      if (error) throw error
      return data as Cliente[]
    },
  })
  const shopify = useQuery({
    queryKey: ["clientes-shopify", t],
    enabled: t.length >= 3,
    retry: false,
    staleTime: 60_000,
    queryFn: async () => {
      try {
        return (await chamarFuncao<{ clientes: ClienteShopify[] }>("shopify-clientes", { q: t })).clientes
      } catch {
        return [] as ClienteShopify[]
      }
    },
  })
  return { local: local.data ?? [], shopify: shopify.data ?? [], carregando: local.isFetching || shopify.isFetching }
}

export function useSincronizarShopify() {
  return useAcao(
    () => chamarFuncao<{ importados: number; erros?: { numero: string; erro: string }[] }>("shopify-sync", {}),
    TODAS,
    (r) => {
      toast.success(r.importados ? `${r.importados} pedidos novos` : "Nenhum pedido novo")
      if (r.erros?.length) {
        toast.warning(`${r.erros.length} pedido(s) com erro: ${r.erros.map((e) => `${e.numero} (${e.erro})`).join("; ")}`)
      }
    },
  )
}

export type DadosPecaClube = { codigo: string; nome: string; variante: string | null; preco: number | null; foto_url: string | null }

export function useCriarPecaClube() {
  return useAcao(
    async (d: DadosPecaClube) => {
      const { data, error } = await supabase.from("pecas_clube").insert(d).select().single()
      if (error) throw error
      return data as PecaClube
    },
    [["clube"]],
  )
}

export function useAtivarPecaClube() {
  return useAcao(
    async ({ id, ativo }: { id: string; ativo: boolean }) => {
      const { error } = await supabase.from("pecas_clube").update({ ativo }).eq("id", id)
      if (error) throw error
    },
    [["clube"]],
  )
}

// codigo (só na bipagem): grava pela função bipar, que soma 1 no banco e registra o histórico.
export type AcaoItem = (item: Item, campos: ItemPatch, codigo?: string, delta?: number) => Promise<ResultadoBipagem | null> | void

// Feedbacks da equipe (página /feedbacks): guardados e visíveis a todos.
export function useFeedbacks() {
  return useQuery({
    queryKey: ["feedbacks"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("feedbacks")
        .select("*, pedidos(numero, cliente_nome, origem)")
        .order("created_at", { ascending: false })
        .limit(500)
      if (error) throw error
      return data as Feedback[]
    },
  })
}

// Feedbacks ainda em aberto, só a contagem (selo da barra lateral).
export function useContagemFeedbacksAbertos() {
  return useQuery({
    queryKey: ["feedbacks", "contagem"],
    queryFn: async () => {
      const { count, error } = await supabase.from("feedbacks").select("id", { count: "exact", head: true }).is("resolvido_em", null)
      if (error) throw error
      return count ?? 0
    },
  })
}

export function useEnviarFeedback() {
  return useAcao(
    async (d: { texto: string; pagina: string; pedido_id: string | null }) => {
      const { error } = await supabase.from("feedbacks").insert(d)
      if (error) throw error
    },
    [["feedbacks"]],
    () => toast.success("Feedback guardado. Obrigado!"),
  )
}

export function useResolverFeedback() {
  return useAcao(
    async ({ id, resolvido }: { id: string; resolvido: boolean }) => {
      const { error } = await supabase.from("feedbacks").update({ resolvido_em: resolvido ? new Date().toISOString() : null }).eq("id", id)
      if (error) throw error
    },
    [["feedbacks"]],
  )
}

// ---------------------------------------------------------------------------
// Trocas de peça em falta: UMA troca por pedido, com várias peças e um link só.
// ---------------------------------------------------------------------------
const TROCAS_TUDO = [["troca"], ["pedido"], ["pedidos"], ["repetidas"], ["acerto"], ["etiquetar"]]

// Troca ativa do pedido (rascunho, enviada ou respondida) com peças, opções, valores e resumo.
// Todo dinheiro (pago, diferença, crédito) vem de v_troca_valores / v_troca_resumo.
export function useTroca(pedidoId: string | undefined) {
  return useQuery({
    queryKey: ["troca", pedidoId],
    enabled: !!pedidoId,
    queryFn: async (): Promise<Troca | null> => {
      // Duas chaves ligam troca_pecas e troca_opcoes (a opção e a escolha): nomeia a certa.
      const consulta = (comEscolhas: boolean) =>
        supabase
          .from("trocas")
          .select(`*, troca_pecas(*, troca_opcoes!troca_opcoes_troca_peca_id_fkey(*)${comEscolhas ? ", troca_escolhas!troca_escolhas_troca_peca_id_fkey(*)" : ""})`)
          .eq("pedido_id", pedidoId!)
          .in("status", ["rascunho", "enviada", "respondida"])
          .maybeSingle()
      let { data: t, error } = await consulta(true)
      // Banco sem a migration do carrinho: lê sem as escolhas.
      if (error && semFuncao(error)) ({ data: t, error } = await consulta(false))
      if (error) throw error
      if (!t) return null
      const [v, r, c] = await Promise.all([
        supabase.from("v_troca_valores").select("*").eq("troca_id", t.id),
        supabase.from("v_troca_resumo").select("*").eq("troca_id", t.id).maybeSingle(),
        supabase.from("v_troca_carrinho").select("*").eq("troca_id", t.id),
      ])
      if (v.error) throw v.error
      if (r.error) throw r.error
      const valores = v.data as TrocaValor[]
      const carrinhos = c.error ? [] : (c.data as TrocaCarrinho[])
      const { troca_pecas, ...troca } = t as unknown as { troca_pecas: (Omit<TrocaPeca, "opcoes" | "valores"> & { troca_opcoes: TrocaOpcao[]; troca_escolhas?: TrocaEscolha[] })[] } & Omit<Troca, "pecas" | "resumo">
      const pecas: TrocaPeca[] = troca_pecas
        .map(({ troca_opcoes, troca_escolhas, ...p }) => ({
          ...p,
          opcoes: [...troca_opcoes].sort((a, b) => a.ordem - b.ordem),
          valores: valores.filter((x) => x.troca_peca_id === p.id),
          escolhas: troca_escolhas ?? [],
          carrinho: carrinhos.find((x) => x.troca_peca_id === p.id) ?? null,
        }))
        .sort((a, b) => a.created_at.localeCompare(b.created_at))
      return { ...troca, pecas, resumo: (r.data as TrocaResumo | null) ?? null } as Troca
    },
  })
}

// Quanto a loja cobre da diferença da troca (0 = não cobre). O banco recusa depois de concluída.
export function useCobrirTroca() {
  return useAcao(
    async ({ trocaId, valor }: { trocaId: string; valor: number }) => {
      const { error } = await supabase.from("trocas").update({ cobrir_ate: valor }).eq("id", trocaId)
      if (error) throw error
    },
    TROCAS_TUDO,
  )
}

// Sugestões de troca. Só consulta quando `ativo` (aba aberta); preços e diferença vêm prontos do banco.
export function useSugestoes(itemId: string | undefined, modo: ModoSugestao, filtros: FiltrosSugestao = {}, ativo = true, incluirPedido = false, soSemEstoque = false) {
  const categoria = filtros.categoria ?? null
  const faixa = modo === "preco" ? (filtros.faixa === undefined ? 0.2 : filtros.faixa) : 0.2
  return useQuery({
    queryKey: ["sugestoes", itemId, modo, modo === "preco" ? categoria : null, modo === "preco" ? faixa : null, incluirPedido, soSemEstoque],
    enabled: !!itemId && ativo,
    staleTime: 5 * 60_000,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const base = {
        p_item: itemId,
        p_modo: modo,
        p_categoria: modo === "preco" ? categoria : null,
        p_faixa: faixa,
        p_busca: null,
        p_incluir_pedido: incluirPedido,
      }
      let r = await supabase.rpc("sugerir_troca", soSemEstoque ? { ...base, p_so_sem_estoque: true } : base)
      let filtroIndisponivel = false
      // Banco ainda sem a migration do filtro: tenta de novo sem o parâmetro e avisa na tela.
      if (r.error && soSemEstoque && /could not find the function|does not exist|p_so_sem_estoque/i.test(`${r.error.message} ${r.error.details ?? ""}`)) {
        filtroIndisponivel = true
        r = await supabase.rpc("sugerir_troca", base)
      }
      if (r.error) throw r.error
      return { linhas: (r.data ?? []) as Sugestao[], filtroIndisponivel }
    },
  })
}

// Quanto a cliente pagou pela peça (total e por unidade), para o cabeçalho da troca.
export function useValorPago(itemId: string | undefined) {
  return useQuery({
    queryKey: ["troca-valor-pago", itemId],
    enabled: !!itemId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("troca_valor_pago", { p_item: itemId })
      if (error) throw error
      return ((data ?? [])[0] ?? null) as ValorPago | null
    },
  })
}

export function useCategorias(ativo = true) {
  return useQuery({
    queryKey: ["categorias-catalogo"],
    enabled: ativo,
    staleTime: 30 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("categorias_catalogo")
      if (error) throw error
      return (data ?? []) as CategoriaCatalogo[]
    },
  })
}

// Garante a troca do pedido e uma peça para cada item em falta (cria o rascunho, ou acrescenta peças
// à troca que já existe) numa transação (função garantir_troca). Devolve o id da troca.
export function useCriarTroca() {
  return useAcao(
    async ({ pedidoId, itemIds }: { pedidoId: string; itemIds: string[] }) => {
      const { data, error } = await supabase.rpc("garantir_troca", { p_pedido: pedidoId, p_itens: itemIds })
      if (error) throw error
      return data as string
    },
    [["troca"]],
  )
}

// Adicionar e remover opções de uma peça da troca, com cache otimista (a marcação responde na hora).
export function useOpcaoTroca(pedidoId: string) {
  const qc = useQueryClient()
  const chave = ["troca", pedidoId]
  const aoErro = (e: unknown) => toast.error(msg(e))
  // Só recarrega quando é a última gravação em andamento: um recarregamento no meio apagaria a marcação
  // otimista das outras e a opção piscava (ou parecia sumir).
  const aoFinal = () => {
    if (qc.isMutating({ mutationKey: ["troca-opcao", pedidoId] }) <= 1) qc.invalidateQueries({ queryKey: chave })
  }
  const mapearPecas = (old: Troca | null | undefined, f: (p: TrocaPeca) => TrocaPeca) =>
    old ? { ...old, pecas: old.pecas.map(f) } : old

  const adicionar = useMutation({
    mutationKey: ["troca-opcao", pedidoId],
    mutationFn: async ({ trocaPecaId, opcao, motivo, ordem }: { trocaPecaId: string; opcao: NovoItem; motivo: TrocaOpcao["motivo"]; ordem?: number }) => {
      const { error } = await supabase.from("troca_opcoes").insert({
        troca_peca_id: trocaPecaId,
        origem: opcao.origem === "clube" ? "clube" : "site",
        shopify_variant_id: opcao.shopify_variant_id,
        peca_clube_id: opcao.peca_clube_id,
        sku: opcao.sku,
        nome: opcao.nome,
        variante: opcao.variante,
        foto_url: opcao.foto_url,
        preco: opcao.preco,
        motivo,
        ordem: ordem ?? Date.now() % 2_000_000_000,
      })
      if (error) throw error
    },
    onMutate: async ({ trocaPecaId, opcao, motivo, ordem }) => {
      await qc.cancelQueries({ queryKey: chave })
      const antes = qc.getQueryData<Troca | null>(chave)
      qc.setQueryData<Troca | null>(chave, (old) =>
        mapearPecas(old, (p) =>
          p.id === trocaPecaId
            ? {
                ...p,
                opcoes: [
                  ...p.opcoes,
                  {
                    id: `tmp-${opcao.chave}`,
                    troca_peca_id: trocaPecaId,
                    origem: opcao.origem === "clube" ? "clube" : "site",
                    shopify_variant_id: opcao.shopify_variant_id,
                    peca_clube_id: opcao.peca_clube_id,
                    sku: opcao.sku,
                    nome: opcao.nome,
                    variante: opcao.variante,
                    foto_url: opcao.foto_url,
                    preco: opcao.preco,
                    motivo,
                    ordem: ordem ?? 0,
                  },
                ],
              }
            : p,
        ),
      )
      return { antes }
    },
    onError: (e, _a, ctx) => {
      if (ctx) qc.setQueryData(chave, ctx.antes)
      aoErro(e)
    },
    onSettled: aoFinal,
  })

  const remover = useMutation({
    mutationKey: ["troca-opcao", pedidoId],
    mutationFn: async ({ opcaoId }: { opcaoId: string }) => {
      const { error } = await supabase.from("troca_opcoes").delete().eq("id", opcaoId)
      if (error) throw error
    },
    onMutate: async ({ opcaoId }) => {
      await qc.cancelQueries({ queryKey: chave })
      const antes = qc.getQueryData<Troca | null>(chave)
      qc.setQueryData<Troca | null>(chave, (old) => mapearPecas(old, (p) => ({ ...p, opcoes: p.opcoes.filter((o) => o.id !== opcaoId) })))
      return { antes }
    },
    onError: (e, _a, ctx) => {
      if (ctx) qc.setQueryData(chave, ctx.antes)
      aoErro(e)
    },
    onSettled: aoFinal,
  })

  return { adicionar, remover }
}

// Marca a troca como enviada e leva o pedido para "Aguardando cliente".
// O evento "troca_enviada" é gravado pelo banco (gatilho). Reenviar não muda nada.
export function useEnviarTroca() {
  return useAcao(
    async ({ troca }: { troca: Troca }) => {
      const { error } = await supabase.rpc("enviar_troca", { p_troca: troca.id })
      if (error) throw error
    },
    TROCAS_TUDO,
  )
}

// Fecha UMA peça da troca: a peça nova entra no pedido (opção) ou fica só o crédito; a antiga sai como
// removida. Com todas as peças fechadas, a troca fica concluída. Resolvidos os problemas, o pedido volta
// para "Separação" (igual a useAcoesItem).
export function useConcluirTroca() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ troca, peca, tipo }: { troca: Troca; peca: TrocaPeca; tipo: "opcao" | "credito" }) => {
      // Uma transação no banco: repetir após uma falha de rede não duplica a peça.
      // A escolha esperada evita confirmar uma opção que a cliente acabou de mudar.
      const { error } = await supabase.rpc("troca_concluir_peca", {
        p_troca: troca.id,
        p_peca: peca.id,
        p_tipo: tipo,
        p_opcao: peca.escolha_opcao_id,
        p_escolha_tipo: peca.escolha_tipo,
        // Versão da escolha vista na tela: o banco recusa se a cliente mexeu no carrinho depois.
        ...(peca.respondida_em ? { p_versao: peca.respondida_em } : {}),
      })
      if (error) throw error
    },
    // Recarrega também se a cliente mudou a escolha ou se a resposta da rede se perdeu.
    onSettled: () => Promise.all(TROCAS_TUDO.map((queryKey) => qc.invalidateQueries({ queryKey }))),
    onError: (e) => toast.error(msgBanco(e)),
  })
}

// A equipe aprova a escolha de uma peça (a cliente respondeu no WhatsApp) e a troca já é feita, numa
// transação só (função troca_aprovar). Funciona em troca em rascunho ou enviada.
export function useAprovarTroca() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ troca, peca, tipo, opcaoId }: { troca: Troca; peca: TrocaPeca; tipo: "opcao" | "credito"; opcaoId?: string | null }) => {
      const { error } = await supabase.rpc("troca_aprovar", {
        p_troca: troca.id,
        p_peca: peca.id,
        p_tipo: tipo,
        p_opcao: tipo === "opcao" ? (opcaoId ?? null) : null,
      })
      if (error) throw error
    },
    onSettled: () => Promise.all([...TROCAS_TUDO, ["acerto"]].map((queryKey) => qc.invalidateQueries({ queryKey }))),
    onError: (e) => toast.error(msg(e)),
  })
}

// A equipe aprova o carrinho que a cliente montou (troca_aprovar_carrinho): uma transação, como troca_aprovar.
export function useAprovarCarrinho() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ troca, peca }: { troca: Troca; peca: TrocaPeca }) => {
      const { error } = await supabase.rpc("troca_aprovar_carrinho", { p_troca: troca.id, p_peca: peca.id })
      if (error) throw error
    },
    onSettled: () => Promise.all([...TROCAS_TUDO, ["acerto"]].map((queryKey) => qc.invalidateQueries({ queryKey }))),
    onError: (e) => toast.error(msgBanco(e)),
  })
}

// Acerto do pedido (v_pedido_acerto): o que foi pago, cada peça trocada, o saldo e o status. Nulo = sem troca feita.
export function useAcerto(pedidoId: string | undefined) {
  return useQuery({
    queryKey: ["acerto", pedidoId],
    enabled: !!pedidoId,
    queryFn: async () => {
      const { data, error } = await supabase.from("v_pedido_acerto").select("*").eq("pedido_id", pedidoId!).maybeSingle()
      if (error) throw error
      return (data as AcertoPedido | null) ?? null
    },
  })
}

// Marca o acerto de uma troca concluída: 'recebido', 'credito_registrado' ou 'pendente' (desfazer).
export function useMarcarAcerto() {
  return useAcao(
    async ({ trocaId, status }: { trocaId: string; status: "pendente" | "recebido" | "credito_registrado" }) => {
      const { error } = await supabase.rpc("troca_acerto", { p_troca: trocaId, p_status: status })
      if (error) throw error
    },
    [["acerto"], ["pedido"], ["pedidos"]],
  )
}

// "A devolver": reembolso de peças tiradas depois do pagamento. Marca como devolvido (ou desfaz) no banco.
export function useMarcarDevolvido() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ pedidoId, desfazer }: { pedidoId: string; desfazer?: boolean }) => {
      const { error } = await supabase.rpc("marcar_devolvido", { p_pedido: pedidoId, p_desfazer: !!desfazer })
      if (error) throw error
    },
    onSuccess: (_, a) => {
      if (a.desfazer) return
      toast.success("Devolução registrada", {
        action: { label: "Desfazer", onClick: () => marcarOutraVez(a.pedidoId) },
      })
    },
    onError: (e) => toast.error(msg(e)),
    onSettled: () => TROCAS_TUDO.forEach((queryKey) => qc.invalidateQueries({ queryKey })),
  })

  function marcarOutraVez(pedidoId: string) {
    void supabase.rpc("marcar_devolvido", { p_pedido: pedidoId, p_desfazer: true }).then(({ error }) => {
      if (error) toast.error(msg(error))
      else TROCAS_TUDO.forEach((queryKey) => qc.invalidateQueries({ queryKey }))
    })
  }
}

// Página da cliente (sem login).
export function useTrocaPublica(token: string | undefined) {
  return useQuery({
    queryKey: ["troca-publica", token],
    enabled: !!token,
    refetchInterval: 30_000,
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("troca_publica", { p_token: token })
      if (error) throw error
      return (data as TrocaPublica | null) ?? null
    },
  })
}

// A cliente escolhe por peça; cada toque já grava (o banco marca "respondida" quando todas têm escolha).
export function useEscolherTroca(token: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ itemId, tipo, opcaoId }: { itemId: string; tipo: EscolhaTroca; opcaoId?: string | null }) => {
      const { error } = await supabase.rpc("troca_escolher", { p_token: token, p_item: itemId, p_tipo: tipo, p_opcao: opcaoId ?? null })
      if (error) throw error
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["troca-publica", token] }),
    onError: (e) => toast.error(msgBanco(e)),
  })
}

// Carrinho da cliente: define quantas unidades de uma opção ela quer (0 tira). O número muda na tela na
// hora; totais e valores continuam vindo do banco (recarrega quando a fila esvazia).
export function useCarrinhoTroca(token: string | undefined) {
  const qc = useQueryClient()
  const chave = ["troca-publica", token]
  return useMutation({
    mutationKey: ["troca-carrinho", token],
    scope: { id: `troca-carrinho-${token}` },
    mutationFn: async ({ itemId, opcaoId, qtd }: { itemId: string; opcaoId: string; qtd: number }) => {
      const { error } = await supabase.rpc("troca_carrinho", { p_token: token, p_item: itemId, p_opcao: opcaoId, p_qtd: qtd })
      if (error) throw error
    },
    onMutate: async ({ itemId, opcaoId, qtd }) => {
      await qc.cancelQueries({ queryKey: chave })
      const antes = qc.getQueryData<TrocaPublica | null>(chave)
      qc.setQueryData<TrocaPublica | null>(chave, (old) =>
        old
          ? {
              ...old,
              pecas: old.pecas.map((p) => {
                if (p.item_id !== itemId) return p
                const base = carrinhoDaPeca(p).filter((c) => c.opcao_id !== opcaoId)
                const carrinho = qtd > 0 ? [...base, { opcao_id: opcaoId, qtd }] : base
                return { ...p, carrinho, unidades: carrinho.reduce((n, c) => n + c.qtd, 0), escolha_tipo: carrinho.length > 0 ? ("opcao" as const) : null }
              }),
            }
          : old,
      )
      return { antes }
    },
    onError: (e, _a, ctx) => {
      if (ctx) qc.setQueryData(chave, ctx.antes)
      toast.error(msgBanco(e))
    },
    onSettled: () => {
      if (qc.isMutating({ mutationKey: ["troca-carrinho", token] }) <= 1) qc.invalidateQueries({ queryKey: chave })
    },
  })
}

// Carrinho de uma peça na página da cliente. Banco antigo (sem carrinho): a opção escolhida vale a quantidade da peça.
export function carrinhoDaPeca(p: TrocaPublica["pecas"][number]): { opcao_id: string; qtd: number }[] {
  if (p.carrinho) return p.carrinho
  return p.escolha_tipo === "opcao" && p.escolha_opcao_id ? [{ opcao_id: p.escolha_opcao_id, qtd: p.qtd }] : []
}

export type PecasDoPedido = { pedidoId: string; numero: string; cliente: string | null; itens: Item[] }

// Peças encontradas e ainda sem etiqueta, de todos os pedidos em Etiquetagem (botão "Imprimir todas" da Expedição).
export function usePecasParaEtiquetar() {
  return useQuery({
    queryKey: ["etiquetar"],
    refetchInterval: intervaloListas,
    queryFn: async () => {
      const { data: pedidos, error } = await supabase
        .from("v_pedidos")
        .select("id,numero,cliente_nome,prazo")
        .eq("status", "etiquetagem")
        .order("prazo", { ascending: true, nullsFirst: false })
        .limit(300)
      if (error) throw error
      if (!pedidos || pedidos.length === 0) return [] as PecasDoPedido[]
      const { data: itens, error: e2 } = await supabase
        .from("pedido_itens")
        .select("*")
        .in("pedido_id", pedidos.map((p) => p.id))
        .eq("status", "encontrado")
        .is("etiquetado_em", null)
        .order("ordem")
      if (e2) throw e2
      return pedidos
        .map((p) => ({ pedidoId: p.id as string, numero: p.numero as string, cliente: (p.cliente_nome as string | null) ?? null, itens: (itens as Item[]).filter((i) => i.pedido_id === p.id) }))
        .filter((p) => p.itens.length > 0) as PecasDoPedido[]
    },
  })
}
