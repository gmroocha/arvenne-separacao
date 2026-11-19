import { useCallback, useEffect, useRef } from "react"
import { keepPreviousData, useIsMutating, useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { supabase, chamarFuncao } from "@/lib/supabase"
import type { Database } from "@/lib/banco"
import type { Json } from "@/lib/gerado/database.types"
import { juntarLidos, lerLinkCarrinho, type LidoCarrinho } from "@/lib/carrinho"
import { sincronizarEmPartes, type RespostaSync } from "@/lib/sincronizar"
import { itemDoSite } from "@/lib/itens"
import { intervaloListas } from "@/lib/tempoReal"
import { agendarAtualizacaoOperacional } from "@/lib/atualizacaoOperacional"
import { gravarPeca } from "@/lib/gravarPeca"
import { enfileirarMarca, type Destino, type RespostaLote } from "@/lib/lotePecas"
import { NOME_ETAPA, STATUS_DA_FASE, type StatusItem, type StatusPedido } from "@/lib/status"
import type { Ocorrencia } from "@/lib/ocorrencias"
import type { AcertoPedido, Membro, ModeloClube, Papel, ResponsavelPadrao, CreditoCliente, CreditoDisponivel, DestinoCredito, Alteracao, CategoriaCatalogo, Cliente, EscolhaTroca, Feedback, ClienteShopify, Endereco, Evento, FiltrosSugestao, Item, ModoSugestao, NovoItem, PecaClube, PecaRepetida, PedidoOperacao, Pedido, ResultadoBipagem, Romaneio, Sugestao, Troca, TrocaCarrinho, TrocaEscolha, TrocaOpcao, TrocaPeca, TrocaPublica, TrocaResumo, TrocaValor, ValorPago } from "@/lib/tipos"

const msgCrua = (e: unknown) => (e instanceof Error ? e.message : (e as { message?: string })?.message ?? "Erro inesperado")
// Tempo limite do banco (57014) vira um aviso compreensível; o resto segue a mensagem do banco.
export const msg = (e: unknown) =>
  /statement timeout/i.test(msgCrua(e)) ? "O banco demorou para responder e nada foi gravado. Tente de novo." : msgCrua(e)

// Banco ainda sem a migration de uma função/tabela nova: mensagem clara em vez do erro cru.
const semFuncao = (e: unknown) => /could not find the function|could not find the table|does not exist|schema cache|relationship/i.test(`${msg(e)} ${(e as { details?: string })?.details ?? ""}`)
export const msgBanco = (e: unknown) => (semFuncao(e) ? "Atualize o banco para usar esta função" : msg(e))

export type PedidoLista = Pedido
export type PedidoDetalhe = Pedido & { pedido_itens: Item[]; pedido_eventos: Evento[] }
export type VarianteSite = Omit<NovoItem, "chave" | "origem" | "peca_clube_id" | "qtd">

// Tamanho máximo das listas de uma fase; ao bater, a tela avisa que pode haver mais.
export const LIMITE_LISTA = 300

// Listas de uma fase, lidas de v_pedidos (o banco calcula total, prazo e contagens).
// Busca por número, cliente ou telefone feita no banco (V34): acha pedidos além dos primeiros da lista.
export function filtroBuscaPedidos(busca: string): string | null {
  const t = busca.trim().replace(/[%,()]/g, " ").trim()
  if (!t) return null
  const d = t.replace(/\D/g, "")
  return [`numero.ilike.%${t}%`, `cliente_nome.ilike.%${t}%`, `cliente_telefone.ilike.%${t}%`, d.length >= 3 ? `cliente_telefone.ilike.%${d}%` : null]
    .filter(Boolean)
    .join(",")
}

export function usePedidosFase(fase: "venda", busca = "") {
  const filtro = filtroBuscaPedidos(busca)
  return useQuery({
    queryKey: ["pedidos", fase, filtro ?? ""],
    refetchInterval: intervaloListas,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      let q = supabase.from("v_pedidos").select("*").in("status", STATUS_DA_FASE[fase]).limit(LIMITE_LISTA)
      if (filtro) q = q.or(filtro)
      q = q.order("pedido_em", { ascending: false })
      const { data, error } = await q
      if (error) throw error
      return data as Pedido[]
    },
  })
}

// A esteira lê somente progresso, prazo, responsáveis e regras operacionais.
export function usePedidosExpedicao(busca = "") {
  const filtro = filtroBuscaPedidos(busca)
  return useQuery({
    queryKey: ["pedidos", "expedicao", filtro ?? ""],
    // O termômetro muda com o passar das horas, sem nenhum aviso do banco: a esteira relê a cada 60 s, com ou sem canal ao vivo.
    refetchInterval: 60_000,
    placeholderData: keepPreviousData,
    queryFn: async ({ signal }) => {
      let q = supabase.from("v_pedidos_operacao").select("*")
        .in("status", STATUS_DA_FASE.expedicao).order("prazo", { ascending: true, nullsFirst: false }).limit(LIMITE_LISTA)
      if (filtro) q = q.or(filtro)
      const { data, error } = await q.abortSignal(signal)
      if (error) throw error
      return data as PedidoOperacao[]
    },
  })
}

// Pedidos do WhatsApp já postados que esperam a mensagem de rastreio (etapa "Enviar rastreio").
export function usePendentesRastreio() {
  return useQuery({
    queryKey: ["pedidos", "rastreio"],
    refetchInterval: intervaloListas,
    queryFn: async ({ signal }) => {
      const { data, error } = await supabase
        .from("v_pedidos_operacao")
        .select("*")
        .eq("pendente_rastreio", true)
        .order("status_desde", { ascending: true })
        .limit(100).abortSignal(signal)
      if (error) throw error
      return data as PedidoOperacao[]
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
        // Concluídos (status enviado) têm página própria; somadas ficam dentro do pedido principal (V72).
        .in("status", ["cancelado", "perdida"])
        .order("status_desde", { ascending: false })
        .limit(limite)
      const filtro = filtroBuscaPedidos(busca)
      if (filtro) q = q.or(filtro)
      const { data, error } = await q
      if (error) throw error
      return data as Pedido[]
    },
  })
}

// Pedidos concluídos (status "enviado"): a caminho ou entregues. Leitura direta da tabela: a página só
// precisa de cliente, rastreio e datas (nada financeiro).
const COLUNAS_CONCLUIDO = "id, numero, origem, cliente_nome, cliente_telefone, rastreio, rastreio_url, rastreio_enviado_em, postado_em, entregue_em, status_desde, shopify_url, entrega_cidade, entrega_uf" as const
export type PedidoConcluido = {
  id: string; numero: string; origem: "shopify" | "whatsapp"; cliente_nome: string | null; cliente_telefone: string | null
  rastreio: string | null; rastreio_url: string | null; rastreio_enviado_em: string | null; postado_em: string | null
  entregue_em: string | null; status_desde: string; shopify_url: string | null
  entrega_cidade: string | null; entrega_uf: string | null
}
export function useConcluidos(busca: string) {
  const filtro = filtroBuscaPedidos(busca)
  return useQuery({
    queryKey: ["pedidos", "concluidos", filtro ?? ""],
    refetchInterval: intervaloListas,
    placeholderData: keepPreviousData,
    queryFn: async ({ signal }) => {
      let q = supabase.from("pedidos").select(COLUNAS_CONCLUIDO).eq("status", "enviado").order("status_desde", { ascending: false }).limit(LIMITE_LISTA)
      if (filtro) q = q.or(filtro)
      const { data, error } = await q.abortSignal(signal)
      if (error) throw error
      return data as unknown as PedidoConcluido[]
    },
  })
}

// Contagens da barra lateral: vendas em aberto e pedidos da expedição atrasados.
export function useContagens() {
  return useQuery({
    queryKey: ["pedidos", "contagem"],
    refetchInterval: intervaloListas,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("contagens_pedidos")
      if (error) throw error
      return data as { emAberto: number; atrasados: number }
    },
  })
}

// Pedidos da expedição (ainda não enviados) para "Somar a um pedido": por número ou nome da cliente.
// Lista para somar: o que o cartão mostra e o que passa para a venda (cliente e endereço). Sem prazo/etapas/acerto.
const COLUNAS_SOMAR =
  "id, numero, status, qtd_pecas, qtd_linhas, fotos, pedido_em, cliente_id, cliente_nome, cliente_telefone, cliente_email, cliente_cpf, cliente_razao_social, cliente_ie, entrega_cep, entrega_logradouro, entrega_numero, entrega_complemento, entrega_bairro, entrega_cidade, entrega_uf" as const

export function useBuscaPedidosParaSomar(busca: string, ativo: boolean) {
  return useQuery({
    queryKey: ["pedidos", "somar", busca],
    enabled: ativo,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      // Só as colunas da lista: a v_pedidos inteira (prazo, etapas, acerto) custa ~4× mais no banco.
      let q = supabase
        .from("v_pedidos")
        .select(COLUNAS_SOMAR)
        .in("status", STATUS_DA_FASE.expedicao)
        .order("pedido_em", { ascending: false })
        .limit(20)
      const t = busca.trim().replace(/[%,()]/g, " ")
      if (t) q = q.or(`numero.ilike.%${t}%,cliente_nome.ilike.%${t}%`)
      const { data, error } = await q
      if (error) throw error
      return data as unknown as Pedido[] // só as colunas acima (as que a tela de somar usa)
    },
  })
}

// Número e cliente de um pedido (faixa "Vai somar ao pedido ...").
export function usePedidoResumo(id: string | null | undefined) {
  return useQuery({
    queryKey: ["pedido", "resumo", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from("v_pedidos").select("id, numero, cliente_nome, status").eq("id", id!).single()
      if (error) throw error
      return data as Pick<Pedido, "id" | "numero" | "cliente_nome" | "status">
    },
  })
}

// Mudança de etapa ainda a caminho do banco para este pedido (a mais recente), ou nada.
function etapaPendente(qc: QueryClient, pedidoId: string) {
  const m = qc
    .getMutationCache()
    .findAll({ mutationKey: ["status"], status: "pending" })
    .filter((x) => (x.state.variables as { pedidoId?: string } | undefined)?.pedidoId === pedidoId)
    .at(-1)
  return m?.state.variables as { para: StatusPedido; campos?: CamposPedido } | undefined
}

export function usePedido(id: string | undefined) {
  const qc = useQueryClient()
  return useQuery({
    queryKey: ["pedido", id],
    enabled: !!id,
    // Pedido que saiu da vista (foi para outra etapa e outra responsável) não volta a aparecer por insistir.
    retry: (vezes, e) => (e as { code?: string })?.code !== "PGRST116" && vezes < 3,
    queryFn: async ({ signal }) => {
      // Um refoco/reconexão durante a fila não pode apagar as peças já marcadas na tela.
      // Ao esvaziar, a fila agenda uma única leitura do estado confirmado.
      const atual = qc.getQueryData<PedidoDetalhe>(["pedido", id])
      if (atual && qc.isMutating({ mutationKey: ["item", id], predicate: (m) => m.options.meta?.preservarPecas === true }) > 0) return atual
      const [p, i, e] = await Promise.all([
        supabase.from("v_pedidos").select("*").eq("id", id!).abortSignal(signal).single(),
        supabase.from("pedido_itens").select("*").eq("pedido_id", id!).order("ordem").abortSignal(signal),
        supabase.from("pedido_eventos").select("*").eq("pedido_id", id!).order("created_at", { ascending: false }).abortSignal(signal),
      ])
      if (p.error) throw p.error
      if (i.error) throw i.error
      if (e.error) throw e.error
      const detalhe = { ...(p.data as Pedido), pedido_itens: i.data as Item[], pedido_eventos: e.data as Evento[] } as PedidoDetalhe
      // V60: leitura feita antes de a nova etapa chegar ao banco traria a etapa antiga por cima da que a
      // pessoa acabou de confirmar (a tela "voltava"). Enquanto a mudança está a caminho, vale a nova;
      // quando ela termina, o pedido é lido de novo do banco.
      const pendente = etapaPendente(qc, id!)
      return pendente ? { ...detalhe, ...pendente.campos, status: pendente.para } : detalhe
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
      const { data, error } = await supabase.rpc("romaneio_publico", { p_token: token! })
      if (error?.code === "22P02") return null // link com token malformado
      if (error) throw error
      return (data as Romaneio | null) ?? null
    },
  })
}

// Peças repetidas entre os pedidos escolhidos (null = todos em Novo/Separação). Contagens e prazo vêm do banco.
// avancadas: soma os pedidos que já passaram da separação (nunca os concluídos) e as peças já encontradas.
export function useRepetidas(selecao: string[] | null = null, habilitado = true, avancadas = false) {
  return useQuery({
    queryKey: ["repetidas", "lista", selecao, avancadas],
    enabled: habilitado,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const { data, error } = await supabase
        // p_avancadas só vai quando ligado: a tela de sempre não depende da migration nova.
        .rpc("pecas_repetidas", avancadas ? { p_pedidos: selecao, p_avancadas: true } : { p_pedidos: selecao })
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
    // Selo da barra lateral: a view é pesada (~100 ms); não precisa voltar a cada peça marcada.
    staleTime: 60_000,
    refetchInterval: 120_000,
    queryFn: async () => {
      // Só a contagem (função leve): a view completa calcula o prazo de cada peça.
      const { data, error } = await supabase.rpc("contagem_repetidas")
      if (error) throw error
      return data ?? 0
    },
  })
}

// V33: o Clube mostrava só as 30 mais recentes, sem como ver as outras. "limite" cresce com "Carregar mais".
export function usePecasClube(busca: string, incluirInativas = false, limite = 30) {
  return useQuery({
    queryKey: ["clube", busca, incluirInativas, limite],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      let q = supabase.from("pecas_clube").select("*").order("created_at", { ascending: false }).order("id").limit(limite)
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

// Página Catálogo: todas as variantes ativas copiadas da Shopify, lidas uma vez (em blocos de 1000) e filtradas
// na tela. Guardadas por 30 min; "Atualizar da Shopify" e a atualização automática renovam.
export type PecaCatalogo = { variant_id: number; sku: string | null; produto: string; variante: string | null; preco: number | null; foto_url: string | null; atualizado_em: string | null }
export function useCatalogoCompleto() {
  return useQuery({
    queryKey: ["catalogo-completo"],
    staleTime: 30 * 60_000,
    queryFn: async () => {
      const linhas: PecaCatalogo[] = []
      for (let de = 0; ; de += 1000) {
        const { data, error } = await supabase
          .from("catalogo_site")
          .select("variant_id, sku, produto, variante, preco, foto_url, atualizado_em")
          .or("status.is.null,status.eq.ACTIVE")
          .order("produto")
          .order("variant_id")
          .range(de, de + 999)
        if (error) throw error
        linhas.push(...((data ?? []) as PecaCatalogo[]))
        if ((data ?? []).length < 1000) break
      }
      return linhas
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
    // V24: produto arquivado ou rascunho não entra no carrinho; vai para "faltando".
    .or("status.is.null,status.eq.ACTIVE")
    .in("variant_id", variantIds.map((id) => {
      const n = Number(id)
      if (!Number.isSafeInteger(n) || n < 1) throw new Error("Código de variante inválido")
      return n
    }))
  if (error) throw error
  const achadas = (data as LinhaCatalogo[]).map(paraVariante)
  const ids = new Set(achadas.map((v) => String(v.shopify_variant_id)))
  return { variantes: achadas, faltando: variantIds.filter((id) => !ids.has(String(id))) }
}

// Lê um link de carrinho (do site ou compartilhado) e devolve as peças prontas para o pedido.
// "lidos" são as variantes e quantidades encontradas (servem para tentar de novo depois de atualizar o
// catálogo); "faltando" são as variantes que o catálogo ainda não conhece.
export type CarrinhoLido = { itens: NovoItem[]; faltando: string[]; lidos: LidoCarrinho[] }

export async function variantesDoCarrinho(entrada: LidoCarrinho[]): Promise<CarrinhoLido> {
  const lidos = juntarLidos(entrada)
  const { variantes, faltando } = await buscarVariantes(lidos.map((l) => l.variantId))
  const itens = variantes.map((v) => itemDoSite(v, lidos.find((l) => String(l.variantId) === String(v.shopify_variant_id))?.qtd ?? 1))
  return { itens, faltando, lidos }
}

export function useLerCarrinho() {
  return useCallback(async (entrada: string | LidoCarrinho[]): Promise<CarrinhoLido | null> => {
    let lidos: LidoCarrinho[]
    if (typeof entrada !== "string") lidos = entrada
    else {
      const link = lerLinkCarrinho(entrada)
      if (!link) return null
      if (link.tipo === "itens") lidos = link.itens
      else {
        // Link de checkout: a função Edge carrinho-ler procura o checkout na Shopify e devolve as peças.
        try {
          const r = await chamarFuncao<{ itens: { variantId: string | number; qtd: number }[] }>("carrinho-ler", { url: link.url })
          lidos = (r.itens ?? []).map((i) => ({ variantId: String(i.variantId), qtd: Number(i.qtd) || 1 }))
        } catch (e) {
          throw new Error(e instanceof Error && e.message ? e.message : "Não consegui ler esse link de checkout")
        }
        if (!lidos.length) throw new Error("Esse checkout está vazio")
      }
    }
    return variantesDoCarrinho(lidos)
  }, [])
}

// Quantas variantes o catálogo copiado tem (0 = ainda não foi carregado da Shopify) e quando foi
// a última alteração gravada nele (max atualizado_em).
export type CatalogoInfo = { total: number; atualizadoEm: string | null }
export function useCatalogoInfo() {
  return useQuery({
    queryKey: ["catalogo-info"],
    queryFn: lerCatalogoInfo,
  })
}
// atualizadoEm = início da última sincronização completa/incremental concluída (V23). A leitura avulsa
// de variantes do carrinho não conta: ela não traz as mudanças dos outros produtos.
async function lerCatalogoInfo(): Promise<CatalogoInfo> {
  const [c, m] = await Promise.all([
    supabase.from("catalogo_site").select("variant_id", { count: "exact", head: true }),
    supabase.from("catalogo_sincronizacao").select("iniciado_em").order("iniciado_em", { ascending: false }).limit(1),
  ])
  if (c.error) throw c.error
  if (m.error) throw m.error
  return { total: c.count ?? 0, atualizadoEm: m.data?.[0]?.iniciado_em ?? null }
}
// Compatibilidade: só a contagem.
export function useCatalogoTotal() {
  const q = useCatalogoInfo()
  return { ...q, data: q.data?.total }
}

// Sincroniza o catálogo: incremental (só o que mudou desde a última gravação, menos 10 min de folga) por
// padrão; completo ({}) só com o catálogo vazio ou quando pedido.
async function sincronizarCatalogo(completo = false) {
  const info = await lerCatalogoInfo().catch(() => null)
  if (completo || !info || info.total < 20 || !info.atualizadoEm) return chamarFuncao<{ variantes: number; removidas?: number }>("catalogo-sync", {})
  const desde = new Date(new Date(info.atualizadoEm).getTime() - 10 * 60_000).toISOString()
  return chamarFuncao<{ variantes: number; removidas?: number }>("catalogo-sync", { desde })
}

export function useAtualizarCatalogo() {
  return useAcao((opcoes?: { completo?: boolean }) => sincronizarCatalogo(opcoes?.completo), [["busca-site"], ["catalogo-total"], ["catalogo-info"], ["sugestoes"], ["catalogo-completo"]])
}

// Atualização automática em segundo plano: ao abrir uma tela de busca/troca, se o catálogo está parado há mais
// de 30 min, dispara a sincronização incremental (uma vez por 30 min na sessão). Não bloqueia nada.
const ATUALIZACAO_VELHA_MS = 30 * 60_000
let ultimaTentativaCatalogo = 0
export function useAtualizacaoAutomaticaCatalogo(ativo: boolean) {
  const qc = useQueryClient()
  useEffect(() => {
    if (!ativo) return
    let vivo = true
    void (async () => {
      const info = await lerCatalogoInfo().catch(() => null)
      if (!vivo || !info || info.total < 20) return // vazio: quem abre a busca carrega o completo
      const idade = info.atualizadoEm ? Date.now() - new Date(info.atualizadoEm).getTime() : Infinity
      if (idade < ATUALIZACAO_VELHA_MS || Date.now() - ultimaTentativaCatalogo < ATUALIZACAO_VELHA_MS) return
      ultimaTentativaCatalogo = Date.now()
      await sincronizarCatalogo().catch(() => {})
      for (const k of ["busca-site", "sugestoes", "catalogo-total", "catalogo-info", "catalogo-completo"]) qc.invalidateQueries({ queryKey: [k] })
    })()
    return () => {
      vivo = false
    }
  }, [ativo, qc])
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

const TODAS = [["pedidos"], ["pedido"], ["repetidas"], ["acerto"]]

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
// Espera as gravações de peça deste pedido terminarem. Sem isso, "Ir para a próxima etapa" chegava ao
// banco antes das últimas peças marcadas (a fila grava uma por vez) e o banco recusava a etapa.
export async function esperarFilaDoPedido(qc: QueryClient, pedidoId: string, limiteMs = 60_000) {
  const fim = Date.now() + limiteMs
  while (qc.isMutating({ mutationKey: ["item", pedidoId] }) > 0 && Date.now() < fim) {
    await new Promise((r) => setTimeout(r, 100))
  }
  if (qc.isMutating({ mutationKey: ["item", pedidoId] }) > 0) {
    throw new Error("Ainda há peças sendo salvas. Aguarde antes de mudar de etapa.")
  }
}

export function useMudarStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationKey: ["status"],
    mutationFn: async ({ pedidoId, para, campos }: { pedidoId: string; para: StatusPedido; campos?: CamposPedido; silencioso?: boolean }) => {
      await esperarFilaDoPedido(qc, pedidoId)
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
    | "forma_pagamento" | "valor_pago" | "pago_em" | "data_compra" | "somar_em"
    | "status" | "rastreio" | "observacoes"
    | "nf_numero" | "nf_chave" | "nf_emitida_em" | "frete_gerado_em" | "frete_peso_g" | "frete_servico" | "rastreio_url"
    | "pedido_fornecedor_numero" | "pedido_fornecedor_em" | "embalado_em" | "postado_em" | "rastreio_enviado_em"
  >
> & {
  entregue_em?: string | null // quando a cliente recebeu (só na página Concluídos)
  pago_em_estimado?: boolean // false quando a equipe corrige a data do pagamento (a Shopify não sobrescreve)
}

// Marca a venda como paga e soma as peças ao pedido principal (função somar_venda): a venda vira
// "somada" e as peças entram no pedido como adicionais. Devolve a promessa para a tela navegar depois.
export async function somarVenda(p: { venda: string; forma: string; valor: number; pagoEm: string }) {
  const { error } = await supabase.rpc("somar_venda", { p_venda: p.venda, p_forma: p.forma, p_valor: p.valor, p_pago_em: p.pagoEm })
  if (error) throw new Error(msgBanco(error))
}

export async function atualizarPedido(pedidoId: string, campos: CamposPedido) {
  const { error } = await supabase.from("pedidos").update(campos).eq("id", pedidoId)
  if (error) throw error
}

export async function corrigirFretePedido(pedidoId: string, pagoPor: "cliente" | "arvenne", cobrado: number | null, dados: CamposPedido) {
  const { error } = await supabase.rpc("corrigir_frete_pedido", { p_pedido: pedidoId, p_pago_por: pagoPor, p_cobrado: cobrado, p_dados: dados })
  if (error) throw new Error(msgBanco(error))
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

const ESTADOS_DE_PECAS: StatusPedido[] = ["novo", "separacao", "conferencia", "bipagem"]
const ZERAR_ETAPAS = { conferido_em: null, etiquetado_em: null, etiqueta_previa: false, qtd_bipada: 0, bipado_em: null } as const

// A fila local e o Broadcast compartilham o lote por cache. Só relê após as gravações
// terminarem; 600 ms de pausa local, ou 1200 ms a partir da última notificação.
function agendarReleituraPecas(qc: QueryClient, id: string) {
  agendarAtualizacaoOperacional(qc, [id], { espera: 600 })
}

// Só progresso da peça (achei, conferida, bipada): vai em lote para marcar_pecas. O resto (falta, retirar,
// restaurar, nota, quantidade) continua indo uma a uma por alterar_item.
const CAMPOS_DE_PROGRESSO = new Set<keyof ItemPatch>(["status", "conferido_em", "etiquetado_em", "etiqueta_previa", "qtd_bipada", "bipado_em"])
function soProgresso(campos: ItemPatch): boolean {
  const chaves = Object.keys(campos) as (keyof ItemPatch)[]
  if (chaves.some((k) => !CAMPOS_DE_PROGRESSO.has(k))) return false
  return campos.status === undefined || campos.status === "pendente" || campos.status === "encontrado"
}

// Resposta do banco ao lote: grava no cache sem reler o pedido. Peça que já tem marca mais nova na fila
// fica como está (a tela dela está à frente do banco).
function aplicarRespostaLote(qc: QueryClient, pedidoId: string, r: RespostaLote, emFila: Set<string>) {
  const antes = qc.getQueryData<PedidoDetalhe>(chavePedido(pedidoId))
  qc.setQueryData<PedidoDetalhe>(chavePedido(pedidoId), (old) => {
    if (!old) return old
    const porId = new Map(r.itens.map((i) => [i.id, i]))
    return {
      ...old,
      status: r.pedido.status as StatusPedido,
      status_desde: r.pedido.status_desde,
      etapa_antes_desvio: r.pedido.etapa_antes_desvio as Pedido["etapa_antes_desvio"],
      pedido_itens: old.pedido_itens.map((i) => (porId.has(i.id) && !emFila.has(i.id) ? { ...i, ...porId.get(i.id)! } as Item : i)),
      pedido_eventos: r.eventos.length ? [...(r.eventos as Evento[]).reverse(), ...old.pedido_eventos] : old.pedido_eventos,
    }
  })
  if (antes && antes.status !== r.pedido.status) {
    // A etapa do pedido mudou: as listas e os contadores ficam desatualizados e se leem ao serem abertos.
    qc.invalidateQueries({ queryKey: ["pedidos"], refetchType: "none" })
    qc.invalidateQueries({ queryKey: ["repetidas"], refetchType: "none" })
  }
}

// Todas as ações numa peça (achei, conferida, bipada, desfazer, falta, defeito...).
// O progresso (achei, conferida, bipada) muda a tela na hora e vai em lote, a cada ~400 ms, numa única
// requisição por pedido (marcar_pecas): quem calcula a etapa do pedido é o banco, na mesma transação.
// As demais ações vão por alterar_item. Efeitos no pedido:
//  - falta/defeito leva o pedido a "avisar cliente" (o banco guarda de qual etapa);
//  - resolvidos os problemas, ele volta à etapa de origem (ou à separação, se sobra peça pendente);
//  - o pedido avança sozinho quando todas as peças terminam a etapa.
export function useAcoesItem(pedidoId: string) {
  const qc = useQueryClient()
  const chave = ["item", pedidoId]

  const destino: Destino = {
    enviar: (marcas) => supabase.rpc("marcar_pecas", { p_pedido: pedidoId, p_marcas: marcas as unknown as Json }) as PromiseLike<{ data: unknown; error: { code?: string; message?: string } | null; status?: number }>,
    aoResponder: (r, emFila) => aplicarRespostaLote(qc, pedidoId, r, emFila),
    aoDescartar: (mensagem) => {
      toast.error(msg({ message: mensagem }))
      void qc.invalidateQueries({ queryKey: chavePedido(pedidoId) })
    },
  }

  const gravarOutros = useMutation({
    mutationKey: chave,
    meta: { preservarPecas: true },
    scope: { id: `pedido-${pedidoId}` },
    mutationFn: async ({ itemId, campos }: { itemId: string; campos: ItemPatch }) => {
      const { error } = await gravarPeca(() => supabase.rpc("alterar_item", { p_item: itemId, p_campos: campos }))
      if (error) throw error
    },
    onError: (e, { itemId }) => {
      const item = qc.getQueryData<PedidoDetalhe>(chavePedido(pedidoId))?.pedido_itens.find((i) => i.id === itemId)
      toast.error(`${item?.sku || item?.nome || "Peça"}: ${msg(e)}`)
    },
    onSettled: () => {
      if (qc.isMutating({ mutationKey: chave }) <= 1) agendarReleituraPecas(qc, pedidoId)
    },
  })

  // Com codigo (leitura do leitor) ou delta (+1/-1) a contagem parte do número que está na tela agora, não do
  // toque: com toques rápidos o botão ainda trazia a contagem antiga (V64). O resultado ("ok"/"excedente") é local.
  return (item: Item, campos: ItemPatch, codigo?: string, delta?: number): Promise<ResultadoBipagem | null> | void => {
    const atual = qc.getQueryData<PedidoDetalhe>(chavePedido(pedidoId))
    if (!atual) return
    const base = atual.pedido_itens.find((i) => i.id === item.id) ?? item
    const passo = codigo ? 1 : (delta ?? 0)
    const progresso = soProgresso(campos)
    let patch: ItemPatch = campos.status && campos.status !== "encontrado" ? { ...ZERAR_ETAPAS, ...campos } : { ...campos }
    if (progresso && "conferido_em" in campos) {
      patch = { ...patch, etiquetado_em: campos.conferido_em ?? null, ...(campos.conferido_em ? {} : { qtd_bipada: 0, bipado_em: null }) }
    }
    if (progresso && patch.qtd_bipada !== undefined) {
      patch.qtd_bipada = Math.min(base.qtd, Math.max(0, passo ? base.qtd_bipada + passo : patch.qtd_bipada))
    }
    const excedente = !!codigo && base.qtd_bipada >= base.qtd
    // Cancela uma leitura em andamento (ela traria o estado velho de volta) e grava sobre o que está no cache agora.
    void qc.cancelQueries({ queryKey: chavePedido(pedidoId) })
    if (campos.status) {
      const depois = atual.pedido_itens.map((i) => (i.id === item.id ? { ...i, ...patch } : i))
      const problemas = depois.some((i) => i.status === "falta" || i.status === "defeito")
      if (problemas && ESTADOS_DE_PECAS.includes(atual.status)) toast.info("Avise a cliente sobre a peça em falta")
    }
    // Troca direto, sem animação: a transição dos blocos (deslizar para o lugar) travava a tela (V65).
    if (!excedente) {
      qc.setQueryData<PedidoDetalhe>(chavePedido(pedidoId), (old) =>
        old ? { ...old, pedido_itens: old.pedido_itens.map((i) => (i.id === item.id ? { ...i, ...patch } : i)) } : old,
      )
    }
    if (!progresso) {
      void gravarOutros.mutateAsync({ itemId: item.id, campos: patch }).catch(() => null)
      return
    }
    if (excedente) return Promise.resolve("excedente" as ResultadoBipagem)
    if (campos.status) enfileirarMarca(qc, pedidoId, { item: item.id, campo: "status", valor: campos.status }, destino)
    if ("conferido_em" in campos) enfileirarMarca(qc, pedidoId, { item: item.id, campo: "conferida", valor: campos.conferido_em != null }, destino)
    if (patch.qtd_bipada !== undefined && !campos.status && !("conferido_em" in campos)) {
      enfileirarMarca(qc, pedidoId, { item: item.id, campo: "bipada", valor: patch.qtd_bipada, ...(codigo ? { codigo } : {}) }, destino)
    }
    return codigo ? Promise.resolve("ok" as ResultadoBipagem) : undefined
  }
}

// Recalcula a etapa do pedido pelas peças (marcar_pecas sem marcas). Cura pedido parado, por exemplo um que já
// estava com a etapa completa quando esta versão entrou no ar.
export function useRecalcularEtapa(pedidoId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationKey: ["recalcular", pedidoId],
    mutationFn: async () => {
      await esperarFilaDoPedido(qc, pedidoId)
      const { data, error } = await supabase.rpc("marcar_pecas", { p_pedido: pedidoId, p_marcas: [] })
      if (error) throw error
      return data as unknown as RespostaLote
    },
    onSuccess: (r) => aplicarRespostaLote(qc, pedidoId, r, new Set()),
    onError: () => void qc.invalidateQueries({ queryKey: chavePedido(pedidoId) }),
  })
}

// Falta parcial: "faltam N de M". O banco divide a linha (função marcar_falta): o resto segue na separação
// e as N em falta viram uma linha nova. Com N igual à quantidade, é a linha inteira. Como em useAcoesItem,
// a primeira peça em falta leva o pedido a "avisar cliente".
export function useMarcarFalta(pedidoId: string) {
  const qc = useQueryClient()
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
      }
    },
    onError: (e) => toast.error(msgBanco(e)),
    onSettled: () => {
      if (qc.isMutating({ mutationKey: ["item", pedidoId] }) <= 1) {
        ;[chavePedido(pedidoId), ["pedidos"], ["troca"], ["repetidas"], ["acerto"]].forEach((queryKey) => qc.invalidateQueries({ queryKey }))
      }
    },
  })
}

// "Encontrada" numa peça em falta/troca: sai da troca ainda aberta e volta como encontrada (vai para a Conferência),
// numa transação só (função encontrar_peca). Resolvidos os problemas, o pedido sai do desvio no banco.
export function useEncontrarPeca(pedidoId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationKey: ["item", pedidoId],
    scope: { id: `pedido-${pedidoId}` },
    mutationFn: async (item: Item) => {
      const { error } = await supabase.rpc("encontrar_peca", { p_item: item.id })
      if (error) throw new Error(msgBanco(error))
    },
    onError: (e) => toast.error(msg(e)),
    onSettled: () => {
      if (qc.isMutating({ mutationKey: ["item", pedidoId] }) <= 1) {
        ;[chavePedido(pedidoId), ["pedidos"], ["troca"], ["repetidas"], ["acerto"]].forEach((queryKey) => qc.invalidateQueries({ queryKey }))
      }
    },
  })
}

// Mover o pedido de etapa à mão (menu "Mover para outra etapa") e "Concluir pedido" (= mover para "enviado").
// Para frente o banco marca como feito tudo o que vem antes (e grava etapas_puladas); para trás zera o trabalho do
// destino em diante. Recusa troca em andamento, acerto pendente e peça em falta (a mensagem vem do banco).
export function useMoverEtapa(pedidoId: string, { avisar = true }: { avisar?: boolean } = {}) {
  const qc = useQueryClient()
  return useMutation({
    mutationKey: ["mover-etapa", pedidoId],
    scope: { id: `pedido-${pedidoId}` },
    mutationFn: async ({ destino }: { destino: StatusPedido }) => {
      await esperarFilaDoPedido(qc, pedidoId)
      const { data, error } = await supabase.rpc("mover_etapa", { p_pedido: pedidoId, p_destino: destino })
      if (error) throw new Error(msgBanco(error))
      return data as string
    },
    // Com avisar=false quem chamou mostra o resultado (barra da etapa: o diálogo traz o erro e o aviso de etapa concluída).
    onSuccess: (_, a) => { if (avisar) toast.success(a.destino === "enviado" ? "Pedido concluído" : `Pedido movido para ${NOME_ETAPA[a.destino]}`) },
    onError: (e) => { if (avisar) toast.error(msg(e)) },
    onSettled: () => [...TODAS, ["troca"]].forEach((queryKey) => qc.invalidateQueries({ queryKey })),
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
// Depois de gravar na venda, só os valores (v_pedidos, calculados no banco) voltam: as peças já estão certas no
// cache. Uma leitura em vez de três (pedido, peças e histórico); o histórico chega pelo tempo real.
const leiturasTotais = new WeakMap<QueryClient, Map<string, number>>()
export async function atualizarTotaisVenda(qc: QueryClient, pedidoId: string) {
  let leituras = leiturasTotais.get(qc)
  if (!leituras) { leituras = new Map(); leiturasTotais.set(qc, leituras) }
  const versao = (leituras.get(pedidoId) ?? 0) + 1
  leituras.set(pedidoId, versao)
  // Uma tentativa: em falha, o cache é recarregado e o pagamento oferece "Tentar recalcular".
  const { data, error } = await supabase.from("v_pedidos").select("*").eq("id", pedidoId).single().retry(false)
  if (error || !data) {
    if (leituras.get(pedidoId) === versao) void qc.invalidateQueries({ queryKey: chavePedido(pedidoId) })
    return null
  }
  // Uma leitura anterior de Cartão não pode sobrescrever a resposta mais nova de Pix no resumo.
  if (leituras.get(pedidoId) === versao)
    qc.setQueryData<PedidoDetalhe>(chavePedido(pedidoId), (p) => (p ? { ...p, ...(data as Pedido) } : p))
  return data as Pedido
}

// Quantas gravações da venda ainda estão a caminho (peças ou campos): o total mostra "recalculando".
export const useRecalculandoVenda = (pedidoId: string) =>
  useIsMutating({ predicate: (m) => ["item-venda", "autosave"].includes(String(m.options.mutationKey?.[0])) && m.options.mutationKey?.[1] === pedidoId }) > 0

export function useAcoesItemVenda(pedidoId: string) {
  const qc = useQueryClient()
  const chave = ["item-venda", pedidoId]
  // Última versão pedida de cada peça: cliques seguidos no "+" entram na fila, mas só o último vai ao banco.
  const versao = useRef(new Map<string, number>())
  const gravar = useMutation({
    mutationKey: chave,
    scope: { id: `pedido-${pedidoId}` },
    mutationFn: async ({ itemId, campos, v }: { itemId: string; campos: ItemPatch; v: number }) => {
      if (versao.current.get(itemId) !== v) return
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
      qc.invalidateQueries({ queryKey: chavePedido(pedidoId) })
    },
    onSettled: async () => {
      if (qc.isMutating({ mutationKey: chave }) <= 1) {
        qc.invalidateQueries({ queryKey: ["pedidos"] })
        await atualizarTotaisVenda(qc, pedidoId)
      }
    },
  })
  return (itemId: string, campos: ItemPatch) => {
    // Campos acumulados da peça: a gravação que vale leva tudo o que mudou nela desde a última.
    const v = (versao.current.get(itemId) ?? 0) + 1
    versao.current.set(itemId, v)
    const acumulado = { ...(acumulados.get(`${pedidoId}:${itemId}`) ?? {}), ...campos }
    acumulados.set(`${pedidoId}:${itemId}`, acumulado)
    gravar.mutate(
      { itemId, campos: acumulado, v },
      { onSettled: () => versao.current.get(itemId) === v && acumulados.delete(`${pedidoId}:${itemId}`) },
    )
  }
}
const acumulados = new Map<string, ItemPatch>()

// Com somar (só na venda), peça já no pedido ganha quantidade em vez de uma linha nova.
// A ordem das linhas e a soma são feitas no banco (função adicionar_itens), numa transação.
const linhasDosItens = (itens: NovoItem[]) => itens.map((i) => ({
  origem: i.origem,
  shopify_variant_id: i.shopify_variant_id,
  peca_clube_id: i.peca_clube_id,
  sku: i.sku,
  nome: i.nome,
  variante: i.variante,
  foto_url: i.foto_url,
  qtd: i.qtd,
  preco: i.preco,
  ...(i.entrada ? { entrada: i.entrada } : {}),
}))

// V06: uma chamada grava as substitutas e o acerto ou desfaz tudo.
export function useSubstituirItem() {
  return useAcao(
    async ({ itemId, itens }: { itemId: string; itens: NovoItem[] }) => {
      const { error } = await supabase.rpc("substituir_item", { p_item: itemId, p_itens: linhasDosItens(itens) })
      if (error) throw new Error(msgBanco(error))
    },
    [...TODAS, ["troca"]],
  )
}

export function useAdicionarItens() {
  return useAcao(
    async ({ pedidoId, itens, somar, jaEncontradas }: { pedidoId: string; itens: NovoItem[]; somar?: boolean; jaEncontradas?: boolean }) => {
      if (!itens.length) return
      const linhas = linhasDosItens(itens)
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

export async function registrarNota(pedidoId: string, texto: string) {
  const { data: u } = await supabase.auth.getUser()
  const { error } = await supabase.from("pedido_eventos").insert({ pedido_id: pedidoId, tipo: "nota", texto, usuario_email: u.user?.email ?? null })
  if (error) throw error
}

export function useAdicionarNota() {
  return useAcao(({ pedidoId, texto }: { pedidoId: string; texto: string }) => registrarNota(pedidoId, texto), [["pedido"]])
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

// Venda nova em aberto com a mesma cliente, frete, desconto e peças (o banco copia; nada de pagamento).
// Funções simples (sem hook): o menu de clique direito existe em cada cartão das listas.
export async function duplicarVenda(pedidoId: string) {
  const { data, error } = await supabase.rpc("duplicar_venda", { p_pedido: pedidoId })
  if (error) throw error
  return (data as { id: string; numero: string }[])[0]
}

// Some de todas as telas; o banco guarda os dados e confere se pode (não paga ou no Arquivo, sem troca).
export async function excluirPedido(pedidoId: string) {
  const { error } = await supabase.rpc("excluir_pedido", { p_pedido: pedidoId })
  if (error) throw error
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
    const parcial: Database["public"]["Tables"]["clientes"]["Update"] = Object.fromEntries(Object.entries(linha).filter(([, v]) => v != null && v !== ""))
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
    () => sincronizarEmPartes((corpo) => chamarFuncao<RespostaSync>("shopify-sync", corpo)),
    TODAS,
    (r) => {
      toast.success(r.importados ? `${r.importados} pedidos novos` : "Nenhum pedido novo")
      if (r.incompleto) toast.warning("A Shopify tem mais pedidos para ler. Clique em Sincronizar de novo para continuar.")
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

// Edita uma peça do Clube (código, nome, variante, preço, foto). Peças já lançadas em pedidos não mudam.
export function useAtualizarPecaClube() {
  return useAcao(
    async ({ id, ...d }: DadosPecaClube & { id: string }) => {
      const { data, error } = await supabase.from("pecas_clube").update(d).eq("id", id).select().single()
      if (error) throw error
      return data as PecaClube
    },
    [["clube"]],
  )
}

// Produtos com variantes do Clube (o "pai"). Poucos: vêm todos, e a tela junta as variantes pelo modelo_id.
export function useModelosClube() {
  return useQuery({
    queryKey: ["clube", "modelos"],
    queryFn: async () => {
      const { data, error } = await supabase.from("clube_modelos").select("*").order("created_at", { ascending: false }).limit(1000)
      if (error) {
        if (semFuncao(error)) return [] as ModeloClube[] // banco ainda sem a migration: tudo como peça simples
        throw error
      }
      return data as ModeloClube[]
    },
  })
}

// Todas as variantes (ativas ou não) de um produto do Clube, para editar o produto inteiro.
export function usePecasDoModelo(modeloId: string | null) {
  return useQuery({
    queryKey: ["clube", "pecas-do-modelo", modeloId],
    enabled: !!modeloId,
    queryFn: async () => {
      const { data, error } = await supabase.from("pecas_clube").select("*").eq("modelo_id", modeloId!).order("created_at").order("id")
      if (error) throw error
      return data as PecaClube[]
    },
  })
}

// Um item de salvar_modelo_clube: peça simples (sem "variantes" nem "id") ou produto com variantes. Tudo ou nada no banco.
export type ItemModeloClube = {
  id?: string
  codigo: string
  nome: string
  preco: number | null
  foto_url: string | null
  variante?: string | null
  ativo?: boolean
  variantes?: { id?: string; codigo: string; variante: string; preco: number | null }[]
}
export type ResultadoModeloClube = { modelo_id: string | null; pecas: PecaClube[] }

export function useSalvarModeloClube() {
  return useAcao(
    async (itens: ItemModeloClube | ItemModeloClube[]) => {
      const { data, error } = await supabase.rpc("salvar_modelo_clube", { p: itens as unknown as Json })
      if (error) throw new Error(msgBanco(error))
      return (data ?? []) as unknown as ResultadoModeloClube[]
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

// codigo (só na bipagem): leitura do leitor; o banco confere que é o SKU da peça. O resultado é decidido na tela.
export type AcaoItem = (item: Item, campos: ItemPatch, codigo?: string, delta?: number) => Promise<ResultadoBipagem | null> | void

// Feedbacks da equipe (página /feedbacks): guardados e visíveis a todos.
export function useFeedbacks() {
  return useQuery({
    queryKey: ["feedbacks"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("feedbacks")
        .select("*, pedidos(numero, cliente_nome, origem), peca:pedido_itens!feedbacks_item_id_fkey(nome, variante, foto_url)")
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

// Nota da peça (ex.: "peça de montagem: temos, falta montar"). Vazio apaga; o banco guarda o histórico.
export function useAnotarItem() {
  return useAcao(
    async ({ itemId, nota }: { itemId: string; nota: string }) => {
      const { error } = await supabase.rpc("anotar_item", { p_item: itemId, p_nota: nota })
      if (error) throw error
    },
    [["pedido"], ["pedidos"]],
    (_r, { nota }) => toast.success(nota.trim() ? "Nota guardada" : "Nota apagada"),
  )
}

export function useEnviarFeedback() {
  return useAcao(
    async (d: { texto: string; pagina: string; pedido_id: string | null; item_id?: string; sku?: string | null }) => {
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
const TROCAS_TUDO = [["troca"], ["alteracoes"], ["pedido"], ["pedidos"], ["repetidas"], ["acerto"]]

// Troca ativa do pedido (rascunho, enviada ou respondida) com peças, opções, valores e resumo.
// Todo dinheiro (pago, diferença, crédito) vem de v_troca_valores / v_troca_resumo.
export function useTroca(pedidoId: string | undefined) {
  return useQuery({
    queryKey: ["troca", pedidoId],
    enabled: !!pedidoId,
    queryFn: async (): Promise<Troca | null> => {
      // V39: uma viagem só (troca, peças, opções, escolhas, valores, resumo e carrinho juntos).
      const painel = await supabase.rpc("troca_painel", { p_pedido: pedidoId! })
      if (!painel.error) return ordenarPecas((painel.data as unknown as Troca | null) ?? null)
      // Banco ainda sem a função: lê pelo caminho antigo, em várias viagens.
      if (!semFuncao(painel.error)) throw painel.error
      return lerTrocaEmPartes(pedidoId!)
    },
  })
}

const ordenarPecas = (t: Troca | null): Troca | null =>
  t ? { ...t, pecas: [...t.pecas].sort((a, b) => a.created_at.localeCompare(b.created_at)).map((p) => ({ ...p, escolhas: p.escolhas ?? [], carrinho: p.carrinho ?? null })) } : null

async function lerTrocaEmPartes(pedidoId: string): Promise<Troca | null> {
  // Duas chaves ligam troca_pecas e troca_opcoes (a opção e a escolha): nomeia a certa.
  const consulta = (comEscolhas: boolean) =>
    supabase
      .from("trocas")
      .select(`*, troca_pecas(*, troca_opcoes!troca_opcoes_troca_peca_id_fkey(*)${comEscolhas ? ", troca_escolhas!troca_escolhas_troca_peca_id_fkey(*)" : ""})`)
      .eq("pedido_id", pedidoId)
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
}

// Alterações do pedido depois do pagamento (trocas, créditos, peças tiradas pela cliente e quantidades
// reduzidas), com o dinheiro pronto do banco (v_pedido_alteracoes). Só leitura.
export function useAlteracoes(pedidoId: string | undefined) {
  return useQuery({
    queryKey: ["alteracoes", pedidoId],
    enabled: !!pedidoId,
    queryFn: async (): Promise<Alteracao[]> => {
      const { data, error } = await supabase.from("v_pedido_alteracoes").select("*").eq("pedido_id", pedidoId!).order("em", { ascending: false })
      if (error) {
        if (semFuncao(error)) return [] // banco ainda sem a view
        throw error
      }
      return data as unknown as Alteracao[]
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
// Quantas variantes do catálogo já têm a marca "vender sem estoque" (null = catálogo nunca atualizado com ela).
async function contarMarcados() {
  const r = await supabase.from("catalogo_site").select("variant_id", { count: "exact", head: true }).not("vende_sem_estoque", "is", null)
  return r.error ? -1 : (r.count ?? 0)
}

// Carga completa em segundo plano (catálogo sem a marca "vender sem estoque"): uma só por sessão, sem travar a tela.
let atualizandoCatalogo: Promise<unknown> | null = null
function atualizarCatalogoUmaVez() {
  atualizandoCatalogo ??= chamarFuncao("catalogo-sync", {})
  return atualizandoCatalogo
}

export function useSugestoes(itemId: string | undefined, modo: ModoSugestao, filtros: FiltrosSugestao = {}, ativo = true, incluirPedido = false, soSemEstoque = false) {
  const qc = useQueryClient()
  const categoria = filtros.categoria ?? null
  const faixa = modo === "preco" ? (filtros.faixa === undefined ? 0.2 : filtros.faixa) : 0.2
  return useQuery({
    queryKey: ["sugestoes", itemId, modo, modo === "preco" ? categoria : null, modo === "preco" ? faixa : null, incluirPedido, soSemEstoque],
    enabled: !!itemId && ativo,
    staleTime: 5 * 60_000,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const base = {
        p_item: itemId!,
        p_modo: modo,
        p_categoria: modo === "preco" ? categoria : null,
        p_faixa: faixa,
        p_busca: null,
        p_incluir_pedido: incluirPedido,
      }
      // Catálogo ainda sem a marca "vender sem estoque": filtrar esconderia tudo, então busca sem o filtro e avisa.
      // A carga completa roda em segundo plano (sem travar o clique) e, ao terminar, refaz a consulta já filtrando.
      let usarFiltro = soSemEstoque
      let catalogoSemMarca = false
      if (soSemEstoque && (await contarMarcados()) === 0) {
        usarFiltro = false
        catalogoSemMarca = true
        void atualizarCatalogoUmaVez()
          .then(() => qc.invalidateQueries({ queryKey: ["sugestoes"] }))
          .catch(() => {})
      }
      const filtrada = supabase.rpc("sugerir_troca", usarFiltro ? { ...base, p_so_sem_estoque: true } : base)
      // Incluir peças do pedido + só vender sem estoque: o banco combina os dois filtros e esconderia a peça que já
      // está no pedido sem a marca. Busca também sem o filtro e junta só as que estão no pedido.
      const extra = usarFiltro && incluirPedido ? supabase.rpc("sugerir_troca", base) : null
      let [r, rExtra] = await Promise.all([filtrada, extra])
      let filtroIndisponivel = catalogoSemMarca
      // Banco ainda sem a migration do filtro: tenta de novo sem o parâmetro e avisa na tela.
      if (r.error && usarFiltro && /could not find the function|does not exist|p_so_sem_estoque/i.test(`${r.error.message} ${r.error.details ?? ""}`)) {
        filtroIndisponivel = true
        r = await supabase.rpc("sugerir_troca", base)
        rExtra = null
      }
      if (r.error) throw r.error
      let linhas = (r.data ?? []) as Sugestao[]
      if (rExtra && !rExtra.error) {
        const ja = new Set(linhas.map((l) => l.variant_id))
        const dopedido = ((rExtra.data ?? []) as Sugestao[]).filter((l) => l.no_pedido === true && !ja.has(l.variant_id))
        linhas = [...linhas, ...dopedido]
      }
      return { linhas, filtroIndisponivel, catalogoSemMarca }
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
      const { data, error } = await supabase.rpc("troca_valor_pago", { p_item: itemId! })
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
                    created_at: new Date().toISOString(),
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

// Marca a troca como enviada (a cliente já pode abrir o link). O pedido NÃO muda de etapa aqui: ele só vai para
// "Aguardando cliente" no botão "Cliente avisada". O evento "troca_enviada" é gravado pelo banco (gatilho).
// Reenviar não muda nada.
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
// Reembolso ou crédito escolhido junto com a peça: se o acerto do pedido ficou pendente com saldo a favor da
// cliente (troca toda resolvida), registra o destino na hora (registrar_credito, valor do banco). Senão o
// destino fica para o cartão "Acerto do pedido" (outras peças da troca ainda abertas). true = registrou.
async function registrarDestinoSePuder(pedidoId: string, destino: DestinoCredito | undefined): Promise<boolean> {
  if (!destino) return false
  const { data, error } = await supabase.from("v_pedido_acerto").select("*").eq("pedido_id", pedidoId).maybeSingle()
  if (error) throw error
  const a = data as AcertoPedido | null
  if (!a?.troca_id || a.acerto_status !== "pendente" || !(a.saldo < 0) || a.bloqueio) return false
  const { error: e2 } = await supabase.rpc("registrar_credito", { p_troca: a.troca_id, p_destino: destino })
  if (e2) throw e2
  return true
}

export function useConcluirTroca() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ troca, peca, tipo, destino }: { troca: Troca; peca: TrocaPeca; tipo: "opcao" | "credito"; destino?: DestinoCredito }) => {
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
      return tipo === "credito" ? registrarDestinoSePuder(troca.pedido_id, destino) : false
    },
    // Recarrega também se a cliente mudou a escolha ou se a resposta da rede se perdeu.
    onSettled: () => Promise.all([...TROCAS_TUDO, ["creditos"]].map((queryKey) => qc.invalidateQueries({ queryKey }))),
    onError: (e) => toast.error(msgBanco(e)),
  })
}

// A equipe aprova a escolha de uma peça (a cliente respondeu no WhatsApp) e a troca já é feita, numa
// transação só (função troca_aprovar). Funciona em troca em rascunho ou enviada.
export function useAprovarTroca() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ troca, peca, tipo, opcaoId, destino }: { troca: Troca; peca: TrocaPeca; tipo: "opcao" | "credito"; opcaoId?: string | null; destino?: DestinoCredito }) => {
      const { error } = await supabase.rpc("troca_aprovar", {
        p_troca: troca.id,
        p_peca: peca.id,
        p_tipo: tipo,
        p_opcao: tipo === "opcao" ? (opcaoId ?? null) : null,
      })
      if (error) throw error
      return tipo === "credito" ? registrarDestinoSePuder(troca.pedido_id, destino) : false
    },
    onSettled: () => Promise.all([...TROCAS_TUDO, ["acerto"], ["creditos"]].map((queryKey) => qc.invalidateQueries({ queryKey }))),
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

// Créditos da cliente registrados neste pedido (reembolso ou próximo pedido), com a situação pronta do banco.
export function useCreditosPedido(pedidoId: string | undefined) {
  return useQuery({
    queryKey: ["creditos", "pedido", pedidoId],
    enabled: !!pedidoId,
    queryFn: async () => {
      const { data, error } = await supabase.from("v_creditos_cliente").select("*").eq("pedido_id", pedidoId!).order("registrado_em")
      if (error) throw error
      return data as CreditoCliente[]
    },
  })
}

// Pedidos com reembolso ainda não feito: só para o selo nos cartões (não traz valores).
export function useReembolsosPendentes() {
  return useQuery({
    queryKey: ["creditos", "reembolsos"],
    refetchInterval: intervaloListas,
    queryFn: async () => {
      const { data, error } = await supabase.from("v_creditos_cliente").select("pedido_id").eq("situacao", "reembolso_pendente")
      if (error) throw error
      return new Set((data ?? []).flatMap((c) => (c.pedido_id ? [c.pedido_id] : [])))
    },
  })
}

// Créditos guardados de outros pedidos da mesma cliente (e os já usados neste pedido).
export function useCreditosDisponiveis(pedidoId: string | undefined) {
  return useQuery({
    queryKey: ["creditos", "disponiveis", pedidoId],
    enabled: !!pedidoId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("creditos_do_pedido", { p_pedido: pedidoId! })
      if (error) throw error
      return (data ?? []) as CreditoDisponivel[]
    },
  })
}

const CREDITOS = [["creditos"], ["acerto"], ["pedido"], ["pedidos"]]

// Registra o saldo a favor da cliente com o destino: reembolso (fica pendente) ou crédito para o próximo pedido.
export function useRegistrarCredito() {
  return useAcao(
    async ({ trocaId, destino }: { trocaId: string; destino: DestinoCredito }) => {
      const { error } = await supabase.rpc("registrar_credito", { p_troca: trocaId, p_destino: destino })
      if (error) throw error
    },
    CREDITOS,
    (_, a) => toast.success(a.destino === "reembolso" ? "Reembolso pendente registrado" : "Crédito guardado para o próximo pedido"),
  )
}

// Reembolso feito (ou desfeito).
export function useMarcarReembolsado() {
  return useAcao(
    async ({ creditoId, desfazer }: { creditoId: string; desfazer?: boolean }) => {
      const { error } = await supabase.rpc("marcar_reembolsado", { p_credito: creditoId, p_desfazer: !!desfazer })
      if (error) throw error
    },
    CREDITOS,
    (_, a) => toast.success(a.desfazer ? "Reembolso desfeito" : "Reembolso registrado"),
  )
}

// Usa o crédito guardado neste pedido da mesma cliente (ou desfaz).
export function useUsarCredito() {
  return useAcao(
    async ({ creditoId, pedidoId, desfazer }: { creditoId: string; pedidoId: string; desfazer?: boolean }) => {
      const { error } = await supabase.rpc("usar_credito", { p_credito: creditoId, p_pedido: pedidoId, p_desfazer: !!desfazer })
      if (error) throw error
    },
    CREDITOS,
    (_, a) => toast.success(a.desfazer ? "Uso do crédito desfeito" : "Crédito marcado como usado"),
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
      const { data, error } = await supabase.rpc("troca_publica", { p_token: token! })
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
      const { error } = await supabase.rpc("troca_escolher", { p_token: token!, p_item: itemId!, p_tipo: tipo, p_opcao: opcaoId ?? null })
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
      const { error } = await supabase.rpc("troca_carrinho", { p_token: token!, p_item: itemId!, p_opcao: opcaoId, p_qtd: qtd })
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

// ---------------------------------------------------------------------------
// Time Arvenne: pessoas da equipe e quem faz cada etapa do pedido.
// ---------------------------------------------------------------------------

// Lista do time. Banco ainda sem a migration (tabela inexistente): lista vazia, sem quebrar a tela.
// Sem a coluna `usuario` (migration do login por nome ainda não aplicada), lê sem ela.
export function useEquipe() {
  return useQuery({
    queryKey: ["equipe"],
    staleTime: 10 * 60_000,
    queryFn: async () => {
      let r = await supabase.from("equipe").select("id, nome, email, ativo, papel, usuario").order("nome")
      if (r.error?.code === "42703" || /usuario/i.test(r.error?.message ?? "")) {
        const sem = await supabase.from("equipe").select("id, nome, email, ativo, papel").order("nome")
        r = { ...sem, data: sem.data?.map((m) => ({ ...m, usuario: null })) ?? null } as typeof r
      }
      const { data, error } = r
      if (error) {
        if (semFuncao(error)) return [] as Membro[]
        throw error
      }
      return data as Membro[]
    },
  })
}

export function useSalvarMembro() {
  return useAcao(
    async (m: { id?: string; nome: string; email: string | null; ativo?: boolean; papel?: Papel; usuario?: string | null }) => {
      const dados = { nome: m.nome.trim(), email: m.email?.trim() || null, ...(m.ativo === undefined ? {} : { ativo: m.ativo }), ...(m.papel === undefined ? {} : { papel: m.papel }) }
      // Quem tem acesso por usuário só volta a entrar depois de desbloqueada; o bloqueio vem depois de gravar (o banco
      // pode recusar, por exemplo desativar o último gestor).
      const mudaAcesso = !!m.id && m.ativo !== undefined && !!m.usuario
      if (mudaAcesso && m.ativo) await acessoDoMembro("desbloquear", m.id!)
      const { error } = m.id ? await supabase.from("equipe").update(dados).eq("id", m.id) : await supabase.from("equipe").insert(dados)
      if (error) {
        if (error.code === "23505") throw new Error("Este e-mail já está cadastrado no time")
        if (error.code === "42501") throw new Error("Só o gestor pode mexer no time")
        throw new Error(msgBanco(error))
      }
      if (mudaAcesso && !m.ativo) await acessoDoMembro("bloquear", m.id!)
    },
    [["equipe"]],
  )
}

// Acesso por usuário e senha (função Edge equipe-acesso, só gestor).
async function acessoDoMembro(acao: "criar" | "trocar_senha" | "bloquear" | "desbloquear", membro_id: string, extra: { usuario?: string; senha?: string } = {}) {
  try {
    return await chamarFuncao<{ ok: boolean; usuario?: string }>("equipe-acesso", { acao, membro_id, ...extra })
  } catch (e) {
    const texto = msg(e)
    // Função ainda não publicada: o gateway devolve "Requested function was not found" ou erro de rede.
    if (/not found|failed to send|fetch/i.test(texto)) throw new Error("O acesso por usuário ainda não está disponível. Fale com quem cuida do sistema.")
    throw new Error(texto)
  }
}

export function useCriarAcesso() {
  return useAcao((a: { membro: string; usuario: string; senha: string }) => acessoDoMembro("criar", a.membro, { usuario: a.usuario, senha: a.senha }), [["equipe"]])
}

export function useTrocarSenha() {
  return useAcao((a: { membro: string; senha: string }) => acessoDoMembro("trocar_senha", a.membro, { senha: a.senha }), [["equipe"]])
}

// Quem cuida de cada etapa quando o pedido chega nela sem responsável. Banco sem a tabela: sem padrões.
export function useResponsaveisPadrao() {
  return useQuery({
    queryKey: ["responsavel-padrao"],
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("responsavel_padrao").select("etapa, membro_id")
      if (error) {
        if (semFuncao(error)) return [] as ResponsavelPadrao[]
        throw error
      }
      return data as ResponsavelPadrao[]
    },
  })
}

export function useSalvarResponsavelPadrao() {
  return useAcao(
    async (a: { etapa: string; membro: string | null }) => {
      const { error } = await supabase.from("responsavel_padrao").update({ membro_id: a.membro }).eq("etapa", a.etapa)
      if (error) throw new Error(error.code === "42501" ? "Só o gestor pode mudar quem cuida das etapas" : msgBanco(error))
    },
    [["responsavel-padrao"]],
  )
}

// Põe o responsável padrão nos pedidos que já estão na esteira sem ninguém na etapa atual. Devolve quantos mudaram.
export function usePreencherResponsaveisPadrao() {
  return useAcao(
    async () => {
      const { data, error } = await supabase.rpc("preencher_responsaveis_padrao")
      if (error) throw new Error(msgBanco(error))
      return Number(data ?? 0)
    },
    [["pedidos"], ["pedido"]],
  )
}

// Metas de tempo por etapa (horas úteis): o termômetro dos cartões compara o tempo na etapa com elas (conta feita no banco).
export type MetaEtapa = { etapa: string; meta_horas_uteis: number }
export function useMetasEtapa() {
  return useQuery({
    queryKey: ["metas"],
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("metas_etapa").select("etapa, meta_horas_uteis")
      if (error) {
        if (semFuncao(error)) return [] as MetaEtapa[] // banco ainda sem a migration: sem metas, sem termômetro
        throw error
      }
      return data as MetaEtapa[]
    },
  })
}

export function useSalvarMeta() {
  return useAcao(
    async (m: { etapa: string; horas: number }) => {
      const { error } = await supabase.from("metas_etapa").update({ meta_horas_uteis: m.horas }).eq("etapa", m.etapa)
      if (error) throw new Error(error.code === "42501" ? "Sem permissão para mudar as metas" : msgBanco(error))
    },
    [["metas"], ["pedidos"]],
  )
}

// Excluir de verdade: a pessoa sai do Time e dos pedidos em que era responsável. Pedidos e histórico ficam.
export function useExcluirMembro() {
  return useAcao(
    async (m: { id: string; usuario?: string | null }) => {
      // Antes de sumir do Time, tira a permissão de entrar (depois não dá mais para achar o login). Sem o bloqueio, a pessoa
      // até entra, mas não vê nenhum pedido: o banco só mostra pedidos a quem está no Time.
      if (m.usuario) await acessoDoMembro("bloquear", m.id).catch(() => undefined)
      const { error } = await supabase.rpc("excluir_membro", { p_membro: m.id })
      if (error) throw new Error(msgBanco(error))
    },
    [["equipe"], ["pedido"], ["pedidos"]],
  )
}

// E-mail de quem está logado (minúsculo), lido uma vez.
function useEmailLogado() {
  return useQuery({
    queryKey: ["login", "email"],
    staleTime: Infinity,
    queryFn: async () => ((await supabase.auth.getUser()).data.user?.email ?? "").trim().toLowerCase(),
  })
}

// Id da pessoa do Time que está logada (banco: membro_atual()). `undefined` = ainda carregando ou banco sem a função.
function useMembroAtualId() {
  return useQuery({
    queryKey: ["login", "membro"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("membro_atual")
      if (error) {
        if (semFuncao(error)) return undefined
        throw error
      }
      return (data as string | null) ?? null
    },
  })
}

// A pessoa do time que está logada: pelo login por usuário ou pelo e-mail (banco: membro_atual()). Sem a função no banco
// (migration ainda não aplicada), vale o e-mail do login. Nada se não houver cadastro.
export function useMeuMembro(): Membro | null {
  const id = useMembroAtualId().data
  const email = useEmailLogado().data
  const equipe = useEquipe().data
  if (id) return equipe?.find((m) => m.id === id) ?? null
  if (id === null || !email) return null
  return equipe?.find((m) => m.ativo && m.email?.trim().toLowerCase() === email) ?? null
}

// Sou gestor? `undefined` enquanto carrega. A RLS do banco é quem manda; a tela só esconde o que a pessoa não pode usar.
// Banco sem a função, ou erro ao perguntar: vale como gestor (o banco recusa o que não puder).
export function useSouGestor(): boolean | undefined {
  const { data } = useQuery({
    queryKey: ["login", "gestor"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("sou_gestor")
      if (error) return true
      return data !== false
    },
  })
  return data
}

// Designa (ou tira, com membro nulo) quem faz uma etapa do pedido. A tela muda na hora e volta atrás se falhar.
export function useDesignar(pedidoId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationKey: ["designar", pedidoId],
    mutationFn: async ({ etapa, membro }: { etapa: string; membro: string | null }) => {
      const { error } = await supabase.rpc("designar", { p_pedido: pedidoId, p_etapa: etapa, p_membro: membro })
      if (error) throw new Error(msgBanco(error))
    },
    onMutate: async ({ etapa, membro }) => {
      await qc.cancelQueries({ queryKey: chavePedido(pedidoId) })
      return {
        anterior: aplicarNoCache(qc, pedidoId, (p) => {
          const r = { ...(p.responsaveis ?? {}) }
          if (membro) r[etapa] = membro
          else delete r[etapa]
          return { ...p, responsaveis: r }
        }),
      }
    },
    onError: (e, _a, ctx) => {
      if (ctx?.anterior) qc.setQueryData(chavePedido(pedidoId), ctx.anterior)
      toast.error(msg(e))
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: chavePedido(pedidoId) })
      qc.invalidateQueries({ queryKey: ["pedidos"] })
    },
  })
}

// ---------------------------------------------------------------------------
// Ocorrências (Fase 3): erro na bipagem, falta indevida e problema na entrega. Quem faz o quê vem do banco
// (autor_da_etapa, responsavel_sugerido); a tela só mostra e envia. Banco sem a migration: listas vazias.
// ---------------------------------------------------------------------------
export function useOcorrencias(pedidoId: string | undefined, ativo = true) {
  return useQuery({
    queryKey: ["ocorrencias", pedidoId],
    enabled: !!pedidoId && ativo,
    queryFn: async ({ signal }) => {
      const { data, error } = await supabase.from("v_ocorrencias").select("*").eq("pedido_id", pedidoId!).order("created_at", { ascending: false }).abortSignal(signal)
      if (error) {
        if (semFuncao(error)) return [] as Ocorrencia[]
        throw error
      }
      return data as unknown as Ocorrencia[]
    },
  })
}

// Erro achado na Bipagem: a peça volta para a Separação e o pedido volta sozinho para lá (função registrar_erro_bipagem).
export function useRegistrarErroBipagem(pedidoId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationKey: ["erro-peca", pedidoId],
    scope: { id: `pedido-${pedidoId}` },
    mutationFn: async ({ item, motivo, obs, responsavel }: { item: Item; motivo: string; obs?: string; responsavel: string | null }) => {
      await esperarFilaDoPedido(qc, pedidoId) // as marcas de bipagem a caminho chegam antes
      const { error } = await supabase.rpc("registrar_erro_bipagem", { p_item: item.id, p_motivo: motivo, p_obs: obs?.trim() || null, p_responsavel: responsavel })
      if (error) throw new Error(msgBanco(error))
    },
    onSuccess: () => toast.success("Erro registrado. A peça voltou para a Separação."),
    onError: (e) => toast.error(msg(e)),
    onSettled: () => [...TODAS, ["troca"], ["ocorrencias", pedidoId]].forEach((queryKey) => qc.invalidateQueries({ queryKey })),
  })
}

// Quem provavelmente fez a etapa (sugestão, sempre editável). Sem a função no banco, nada.
export function useResponsavelSugerido(pedidoId: string | undefined, etapa: string | null, itemId: string | null, ativo = true) {
  return useQuery({
    queryKey: ["ocorrencias", "sugerido", pedidoId, etapa, itemId],
    enabled: !!pedidoId && !!etapa && ativo,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("responsavel_sugerido", { p_pedido: pedidoId!, p_etapa: etapa!, p_item: itemId })
      if (error) {
        if (semFuncao(error)) return null
        throw error
      }
      return (data as string | null) ?? null
    },
  })
}

export function useRegistrarProblemaEntrega(pedidoId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (a: { motivo: string; etapa: string | null; responsavel: string | null; item: string | null; obs?: string }) => {
      const { error } = await supabase.rpc("registrar_problema_entrega", {
        p_pedido: pedidoId, p_motivo: a.motivo, p_etapa: a.etapa, p_responsavel: a.responsavel, p_item: a.item, p_obs: a.obs?.trim() || null,
      })
      if (error) throw new Error(msgBanco(error))
    },
    onSuccess: () => toast.success("Problema registrado"),
    onError: (e) => toast.error(msg(e)),
    onSettled: () => qc.invalidateQueries({ queryKey: ["ocorrencias", pedidoId] }),
  })
}

export function useAnularOcorrencia(pedidoId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("anular_ocorrencia", { p_id: id })
      if (error) throw new Error(msgBanco(error))
    },
    onSuccess: () => toast.success("Ocorrência anulada"),
    onError: (e) => toast.error(msg(e)),
    onSettled: () => qc.invalidateQueries({ queryKey: ["ocorrencias", pedidoId] }),
  })
}

// Detalhe de um pedido concluído (Sheet de Concluídos): peças e quantas linhas o pedido tem (contagem do banco, v_pedidos).
// Quem fez cada etapa vem de quem_fez_etapas. Nada financeiro.
export type DetalheConcluido = {
  linhas: number
  itens: Pick<Item, "id" | "sku" | "nome" | "variante" | "foto_url" | "qtd" | "status" | "ordem" | "separado_por" | "conferido_por" | "bipado_por">[]
}
export function useDetalheConcluido(pedidoId: string | undefined) {
  return useQuery({
    queryKey: ["pedido", "concluido", pedidoId],
    enabled: !!pedidoId,
    queryFn: async ({ signal }) => {
      const [p, i0] = await Promise.all([
        supabase.from("v_pedidos").select("qtd_linhas").eq("id", pedidoId!).abortSignal(signal).single(),
        supabase.from("pedido_itens").select("id, sku, nome, variante, foto_url, qtd, status, ordem, separado_por, conferido_por, bipado_por").eq("pedido_id", pedidoId!).neq("status", "removido").order("ordem").abortSignal(signal),
      ])
      // Banco sem a migration da Fase 3 (colunas *_por): lê as peças sem elas.
      const i = i0.error?.code === "42703"
        ? await supabase.from("pedido_itens").select("id, sku, nome, variante, foto_url, qtd, status, ordem").eq("pedido_id", pedidoId!).neq("status", "removido").order("ordem").abortSignal(signal)
        : i0
      if (p.error) throw p.error
      if (i.error) throw i.error
      return { linhas: (p.data as { qtd_linhas: number }).qtd_linhas, itens: i.data as unknown as DetalheConcluido["itens"] } satisfies DetalheConcluido
    },
  })
}

// Quem fez cada etapa do pedido e quando saiu dela (função quem_fez_etapas, que usa a mesma regra de responsavel_sugerido).
// Banco sem a função: lista vazia.
export type QuemFezEtapa = { etapa: string; ordem: number; membro_id: string | null; nome: string | null; concluida_em: string | null }
export function useQuemFezEtapas(pedidoId: string | undefined) {
  return useQuery({
    queryKey: ["pedido", "quem-fez", pedidoId],
    enabled: !!pedidoId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("quem_fez_etapas", { p_pedido: pedidoId! })
      if (error) {
        if (semFuncao(error)) return [] as QuemFezEtapa[]
        throw error
      }
      return data as unknown as QuemFezEtapa[]
    },
  })
}
