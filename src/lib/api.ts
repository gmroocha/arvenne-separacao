import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { supabase, chamarFuncao } from "@/lib/supabase"
import { NOME_ETAPA, type StatusItem, type StatusPedido } from "@/lib/status"
import type { Cliente, ClienteShopify, Endereco, Evento, Item, NovoItem, PecaClube, PecaRepetida, Pedido, Romaneio } from "@/lib/tipos"

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

// Aba "Site": busca no catálogo copiado (catalogo_site), sem chamar a loja.
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
        .order("produto")
        .limit(30)
      if (error) throw error
      return (data as LinhaCatalogo[]).map(paraVariante)
    },
  })
}

// Resolve as variantes do carrinho só no catálogo local. IDs que faltam voltam em "faltando".
export async function buscarVariantes(variantIds: string[]) {
  const { data, error } = await supabase
    .from("catalogo_site")
    .select("variant_id, sku, produto, variante, preco, foto_url")
    .in("variant_id", variantIds)
  if (error) throw error
  const achadas = (data as LinhaCatalogo[]).map(paraVariante)
  const ids = new Set(achadas.map((v) => String(v.shopify_variant_id)))
  return { variantes: achadas, faltando: variantIds.filter((id) => !ids.has(String(id))) }
}

export function useAtualizarCatalogo() {
  return useAcao(() => chamarFuncao<{ variantes: number }>("catalogo-sync", {}), [["busca-site"]])
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

export function useMudarStatus() {
  return useAcao(
    async ({ pedidoId, para }: { pedidoId: string; para: StatusPedido; silencioso?: boolean }) => {
      const { error } = await supabase.from("pedidos").update({ status: para }).eq("id", pedidoId)
      if (error) throw error
    },
    TODAS,
    (_, a) => {
      if (!a.silencioso) toast.success(`Pedido movido para ${NOME_ETAPA[a.para]}`)
    },
  )
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
  >
>

export async function atualizarPedido(pedidoId: string, campos: CamposPedido) {
  const { error } = await supabase.from("pedidos").update(campos).eq("id", pedidoId)
  if (error) throw error
}

export function useAtualizarPedido(invalidar: unknown[][] = TODAS) {
  return useAcao(({ pedidoId, campos }: { pedidoId: string; campos: CamposPedido }) => atualizarPedido(pedidoId, campos), invalidar)
}

const ITENS_ABRIDORES: StatusPedido[] = ["novo", "separacao", "aguardando_cliente"]

// Regras da separação, aplicadas depois de cada mudança numa peça:
//  - falta/defeito leva o pedido a "aguardando cliente";
//  - resolvidos todos os problemas, o pedido volta a "separação";
//  - primeira peça achada tira o pedido de "novo";
//  - a última peça achada leva o pedido sozinho para Conferência (com Desfazer).
export function useAcaoItem(pedido: PedidoDetalhe | undefined) {
  const qc = useQueryClient()
  const mudarStatus = useMudarStatus()

  function avisarConferencia(anterior: StatusPedido) {
    if (!pedido) return
    toast.success("Pedido foi para Conferência", {
      duration: 8000,
      action: {
        label: "Desfazer",
        onClick: () => mudarStatus.mutate({ pedidoId: pedido.id, para: anterior === "novo" ? "separacao" : anterior, silencioso: true }),
      },
    })
  }

  return useAcao(
    async ({ item, para, observacao }: { item: Item; para: StatusItem; observacao?: string | null }) => {
      // A peça muda de lista na hora; o banco confirma logo depois.
      if (pedido)
        qc.setQueryData<PedidoDetalhe>(["pedido", pedido.id], (old) =>
          old && { ...old, pedido_itens: old.pedido_itens.map((i) => (i.id === item.id ? { ...i, status: para } : i)) },
        )
      const { error } = await supabase
        .from("pedido_itens")
        .update({
          status: para,
          ...(para !== "encontrado" ? { conferido_em: null } : {}),
          ...(observacao !== undefined ? { observacao } : {}),
        })
        .eq("id", item.id)
      if (error) {
        qc.invalidateQueries({ queryKey: ["pedido"] })
        throw error
      }
      if (!pedido) return
      const vivos = pedido.pedido_itens.map((i) => (i.id === item.id ? { ...i, status: para } : i)).filter((i) => i.status !== "removido")
      const problemas = vivos.filter((i) => i.status === "falta" || i.status === "defeito")
      const todosAchados = vivos.length > 0 && vivos.every((i) => i.status === "encontrado")
      const atual = pedido.status
      const mover = (destino: StatusPedido) => atualizarPedido(pedido.id, { status: destino })
      if (problemas.length > 0) {
        if (atual === "novo" || atual === "separacao" || atual === "conferencia") {
          await mover("aguardando_cliente")
          toast.info("Pedido aguardando resposta da cliente")
        }
        return
      }
      if (atual === "aguardando_cliente") {
        await mover(todosAchados ? "conferencia" : "separacao")
        if (todosAchados) avisarConferencia(atual)
        return
      }
      if (ITENS_ABRIDORES.includes(atual) && todosAchados) {
        await mover("conferencia")
        avisarConferencia(atual)
        return
      }
      if (atual === "novo" && para === "encontrado") await mover("separacao")
    },
    TODAS,
  )

}

// Conferência: marca a peça como conferida; a última conferida leva o pedido a Nota/Bling/frete.
export function useConferirItem(pedido: PedidoDetalhe | undefined) {
  const mudarStatus = useMudarStatus()
  return useAcao(
    async ({ item, conferido }: { item: Item; conferido: boolean }) => {
      const { error } = await supabase
        .from("pedido_itens")
        .update({ conferido_em: conferido ? new Date().toISOString() : null })
        .eq("id", item.id)
      if (error) throw error
      if (!pedido || !conferido || pedido.status !== "conferencia") return
      const alvo = pedido.pedido_itens
        .map((i) => (i.id === item.id ? { ...i, conferido_em: "agora" } : i))
        .filter((i) => i.status === "encontrado")
      const outras = pedido.pedido_itens.filter((i) => i.status !== "removido" && i.status !== "encontrado")
      if (alvo.length > 0 && outras.length === 0 && alvo.every((i) => i.conferido_em)) {
        await atualizarPedido(pedido.id, { status: "faturamento" })
        toast.success("Pedido foi para Nota, Bling e frete", {
          duration: 8000,
          action: {
            label: "Desfazer",
            onClick: () => mudarStatus.mutate({ pedidoId: pedido.id, para: "conferencia", silencioso: true }),
          },
        })
      }
    },
    TODAS,
  )
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
