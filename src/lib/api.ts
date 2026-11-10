import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { supabase, chamarFuncao } from "@/lib/supabase"
import { ABERTOS, NOME_ETAPA, type StatusItem, type StatusPedido } from "@/lib/status"
import type { Evento, Item, NovoItem, PecaClube, PecaRepetida, Pedido } from "@/lib/tipos"

const msg = (e: unknown) => (e instanceof Error ? e.message : (e as { message?: string })?.message ?? "Erro inesperado")

export type PedidoLista = Pedido & { pedido_itens: Pick<Item, "id" | "foto_url" | "status" | "qtd">[] }
export type PedidoDetalhe = Pedido & { pedido_itens: Item[]; pedido_eventos: Evento[] }
export type VarianteSite = Omit<NovoItem, "chave" | "origem" | "peca_clube_id" | "qtd">

export function usePedidos() {
  return useQuery({
    queryKey: ["pedidos"],
    queryFn: async () => {
      const desde = new Date(Date.now() - 30 * 86400000).toISOString()
      const { data, error } = await supabase
        .from("pedidos")
        .select("*, pedido_itens(id, foto_url, status, qtd)")
        .or(`status.in.(${ABERTOS.join(",")}),status_desde.gte.${desde}`)
        .order("pedido_em", { ascending: false })
        .limit(300)
      if (error) throw error
      return data as PedidoLista[]
    },
  })
}

export function usePedido(id: string | undefined) {
  return useQuery({
    queryKey: ["pedido", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pedidos")
        .select("*, pedido_itens(*), pedido_eventos(*)")
        .eq("id", id!)
        .order("ordem", { referencedTable: "pedido_itens" })
        .order("created_at", { referencedTable: "pedido_eventos", ascending: false })
        .single()
      if (error) throw error
      return data as PedidoDetalhe
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

export function useBuscaSite(termo: string) {
  return useQuery({
    queryKey: ["busca-site", termo],
    enabled: termo.length >= 2,
    queryFn: async () => (await chamarFuncao<{ variantes: VarianteSite[] }>("shopify-produtos", { q: termo })).variantes,
  })
}

export async function buscarVariantes(variantIds: string[]) {
  return (await chamarFuncao<{ variantes: VarianteSite[] }>("shopify-produtos", { variantIds })).variantes
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
    async ({ pedidoId, para }: { pedidoId: string; para: StatusPedido }) => {
      const { error } = await supabase.from("pedidos").update({ status: para }).eq("id", pedidoId)
      if (error) throw error
    },
    TODAS,
    (_, a) => toast.success(`Pedido movido para ${NOME_ETAPA[a.para]}`),
  )
}

// Regras: primeira peça marcada tira o pedido de "novo"; falta/defeito leva a "aguardando cliente".
export function useMudarStatusItem(pedido: PedidoDetalhe | undefined) {
  const mudarStatus = useMudarStatus()
  return useAcao(
    async ({ item, para }: { item: Item; para: StatusItem }) => {
      const { error } = await supabase.from("pedido_itens").update({ status: para }).eq("id", item.id)
      if (error) throw error
      if (!pedido) return null
      const itens = pedido.pedido_itens.map((i) => (i.id === item.id ? { ...i, status: para } : i))
      if ((para === "falta" || para === "defeito") && (pedido.status === "novo" || pedido.status === "separacao")) {
        await supabase.from("pedidos").update({ status: "aguardando_cliente" }).eq("id", pedido.id)
        toast.info("Pedido aguardando resposta da cliente")
        return null
      }
      if (para === "encontrado" && pedido.status === "novo") {
        await supabase.from("pedidos").update({ status: "separacao" }).eq("id", pedido.id)
      }
      const vivos = itens.filter((i) => i.status !== "removido")
      if (para === "encontrado" && vivos.length > 0 && vivos.every((i) => i.status === "encontrado")) {
        toast.success("Todas as peças encontradas", {
          action: {
            label: "Avançar para Conferência",
            onClick: () => mudarStatus.mutate({ pedidoId: pedido.id, para: "conferencia" }),
          },
        })
      }
      return null
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

export function useSalvarCampo() {
  return useAcao(
    async ({ pedidoId, campo }: { pedidoId: string; campo: { rastreio: string | null } | { observacoes: string | null } }) => {
      const { error } = await supabase.from("pedidos").update(campo).eq("id", pedidoId)
      if (error) throw error
    },
    [["pedido"]],
  )
}

export function useObservacaoItem() {
  return useAcao(
    async ({ itemId, status, observacao }: { itemId: string; status: StatusItem; observacao?: string | null }) => {
      const { error } = await supabase
        .from("pedido_itens")
        .update({ status, ...(observacao !== undefined ? { observacao } : {}) })
        .eq("id", itemId)
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

export type DadosWhatsApp = {
  cliente_nome: string
  cliente_telefone: string
  carrinho_url: string | null
  observacoes: string | null
  itens: NovoItem[]
}

export function useCriarPedidoWhatsApp() {
  return useAcao(
    async (d: DadosWhatsApp) => {
      const { data, error } = await supabase.rpc("criar_pedido_whatsapp", { p: d })
      if (error) throw error
      return (data as { id: string; numero: string }[])[0]
    },
    TODAS,
  )
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
