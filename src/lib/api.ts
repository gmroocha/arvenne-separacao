import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { supabase, chamarFuncao } from "@/lib/supabase"
import { etapaCompleta } from "@/lib/etapa"
import { NOME_ETAPA, type StatusItem, type StatusPedido } from "@/lib/status"
import type { Cliente, ClienteShopify, Endereco, Evento, Item, NovoItem, PecaClube, PecaRepetida, Pedido, ResultadoBipagem, Romaneio } from "@/lib/tipos"

const msg = (e: unknown) => (e instanceof Error ? e.message : (e as { message?: string })?.message ?? "Erro inesperado")

export type PedidoLista = Pedido
export type PedidoDetalhe = Pedido & { pedido_itens: Item[]; pedido_eventos: Evento[] }
export type VarianteSite = Omit<NovoItem, "chave" | "origem" | "peca_clube_id" | "qtd">

// Listas de uma fase, lidas de v_pedidos (o banco calcula total, prazo e contagens).
export function usePedidosFase(fase: "venda" | "expedicao") {
  return useQuery({
    queryKey: ["pedidos", fase],
    refetchInterval: 60_000,
    queryFn: async () => {
      let q = supabase.from("v_pedidos").select("*").eq("fase", fase).limit(300)
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
    refetchInterval: 60_000,
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
    queryFn: async () => {
      let q = supabase
        .from("v_pedidos")
        .select("*")
        .eq("fase", "arquivo")
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
    refetchInterval: 60_000,
    queryFn: async () => {
      const [a, b] = await Promise.all([
        supabase.from("v_pedidos").select("id", { count: "exact", head: true }).eq("status", "em_aberto"),
        supabase
          .from("v_pedidos")
          .select("id", { count: "exact", head: true })
          .eq("fase", "expedicao")
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

const TODAS = [["pedidos"], ["pedido"], ["repetidas"]]

export type ItemPatch = Partial<
  Pick<Item, "status" | "observacao" | "conferido_em" | "etiquetado_em" | "etiqueta_previa" | "qtd_bipada" | "bipado_em" | "qtd" | "preco">
>

const chavePedido = (id: string) => ["pedido", id]

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
      return { anterior: aplicarNoCache(qc, pedidoId, (p) => ({ ...p, ...campos, status: para, status_desde: new Date().toISOString() })) }
    },
    onError: (e, a, ctx) => {
      if (ctx?.anterior) qc.setQueryData(chavePedido(a.pedidoId), ctx.anterior)
      toast.error(msg(e))
    },
    onSuccess: (_, a) => {
      if (!a.silencioso) toast.success(`Pedido movido para ${NOME_ETAPA[a.para]}`)
    },
    onSettled: (_, __, a) => {
      qc.invalidateQueries({ queryKey: chavePedido(a.pedidoId) })
      qc.invalidateQueries({ queryKey: ["pedidos"] })
    },
  })
}

// Atualiza campos do pedido (sem toast): usado pelo salvamento automático e pelas ações das telas.
export type CamposPedido = Partial<
  Pick<
    Pedido,
    | "cliente_id" | "cliente_nome" | "cliente_telefone" | "cliente_email" | "cliente_cpf"
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
    mutationFn: async ({ itemId, campos }: { itemId: string; campos: ItemPatch }) => {
      const { error } = await supabase.from("pedido_itens").update(campos).eq("id", itemId)
      if (error) throw error
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
      }
    },
  })

  return (item: Item, campos: ItemPatch) => {
    const atual = qc.getQueryData<PedidoDetalhe>(chavePedido(pedidoId))
    if (!atual) return
    const patch: ItemPatch = campos.status && campos.status !== "encontrado" ? { ...ZERAR_ETAPAS, ...campos } : campos
    const antes = atual.pedido_itens
    const depois = antes.map((i) => (i.id === item.id ? { ...i, ...patch } : i))
    qc.setQueryData<PedidoDetalhe>(chavePedido(pedidoId), { ...atual, pedido_itens: depois })
    gravar.mutate({ itemId: item.id, campos: patch })

    let estado = atual.status
    if (campos.status) {
      const vivos = depois.filter((i) => i.status !== "removido")
      const problemas = vivos.some((i) => i.status === "falta" || i.status === "defeito")
      let destino: StatusPedido | null = null
      if (problemas && ESTADOS_DE_PECAS.includes(estado)) {
        destino = "aguardando_cliente"
        toast.info("Pedido aguardando resposta da cliente")
      } else if (!problemas && estado === "aguardando_cliente") destino = "separacao"
      else if (estado === "novo" && campos.status === "encontrado") destino = "separacao"
      if (destino) {
        estado = destino
        mudarStatus.mutate({ pedidoId, para: destino, silencioso: true })
      }
    }
    if (etapaCompleta(estado, depois) && !etapaCompleta(estado, antes)) aoCompletar?.(estado)
  }
}

// Registra a leitura do leitor de código (histórico em "bipagens"). Não trava a tela.
export async function registrarBipagem(pedidoId: string, itemId: string | null, codigo: string, resultado: ResultadoBipagem) {
  const { error } = await supabase.from("bipagens").insert({ pedido_id: pedidoId, item_id: itemId, codigo, resultado })
  if (error) toast.error(msg(error))
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

export function useAdicionarItens() {
  return useAcao(
    async ({ pedidoId, itens }: { pedidoId: string; itens: NovoItem[] }) => {
      const { data: ult } = await supabase
        .from("pedido_itens")
        .select("ordem")
        .eq("pedido_id", pedidoId)
        .order("ordem", { ascending: false })
        .limit(1)
      const base = (ult?.[0]?.ordem ?? 0) + 1
      const linhas = itens.map((i, n) => ({
        pedido_id: pedidoId,
        origem: i.origem,
        shopify_variant_id: i.shopify_variant_id,
        peca_clube_id: i.peca_clube_id,
        sku: i.sku,
        nome: i.nome,
        variante: i.variante,
        foto_url: i.foto_url,
        qtd: i.qtd,
        preco: i.preco,
        ordem: base + n,
      }))
      const { error } = await supabase.from("pedido_itens").insert(linhas)
      if (error) throw error
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
  email: string | null
  telefone: string | null
  shopify_customer_id?: number | null
} & Partial<Endereco>

const soDigitos = (t: string | null | undefined) => (t ?? "").replace(/\D/g, "")

// Cria ou atualiza a cliente em "clientes" (telefone, CPF e CEP só com dígitos) e devolve o id.
export async function salvarCliente(id: string | null, d: DadosCliente): Promise<string> {
  const linha = {
    nome: d.nome.trim(),
    cpf: soDigitos(d.cpf) || null,
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
    // Evita duplicar: procura quem já tem o mesmo CPF, e-mail ou telefone.
    const filtros = [
      linha.cpf ? `cpf.eq.${linha.cpf}` : null,
      linha.email ? `email.eq.${linha.email}` : null,
      linha.telefone ? `telefone.eq.${linha.telefone}` : null,
    ].filter(Boolean)
    if (filtros.length) {
      const { data } = await supabase.from("clientes").select("id").or(filtros.join(",")).limit(1)
      alvo = data?.[0]?.id ?? null
    }
  }
  if (alvo) {
    const { error } = await supabase.from("clientes").update(linha).eq("id", alvo)
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
    () => chamarFuncao<{ importados: number }>("shopify-sync", {}),
    TODAS,
    (r) => toast.success(r.importados ? `${r.importados} pedidos novos` : "Nenhum pedido novo"),
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

export type AcaoItem = (item: Item, campos: ItemPatch) => void
