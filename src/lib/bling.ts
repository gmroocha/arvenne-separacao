import { useQuery } from "@tanstack/react-query"
import { chamarFuncao, supabase } from "@/lib/supabase"
import { semFuncao } from "@/lib/api"

// Pedido de venda da LR no Bling. Toda conversa com o Bling passa pela função Edge `bling`: o navegador nunca vê token.
// A tela não soma dinheiro: o total vem da função (preparar/gerar).

export type LinhaPedidoLr = { sku: string | null; codigo: string; qtd: number; valor?: number | null }
export type LinhaConferida = {
  sku: string | null
  codigo: string
  qtd: number
  lembrado: boolean // o código veio da lista que o app lembra
  achou: boolean
  descricao: string | null
  valor: number | null
  valor_bling: number | null
}
export type Conferencia = {
  ok: true
  ja_gerado: { numero: string | null; bling_id: number; criado_em: string } | null
  linhas: LinhaConferida[]
  total: number
}
export type Gerado = { ok: true; bling_id: number; numero: string; total: number; avisos: string[] }
export type ContatoBling = { id: number; nome: string; documento: string }

export const blingPreparar = (itens: LinhaPedidoLr[], pedidoId?: string) =>
  chamarFuncao<Conferencia>("bling", { acao: "preparar", pedido_id: pedidoId, itens })
export const blingGerar = (a: { itens: LinhaPedidoLr[]; lembrar: { sku: string; codigo: string }[]; pedidoId?: string; confirmarRepetido?: boolean }) =>
  chamarFuncao<Gerado>("bling", { acao: "gerar", pedido_id: a.pedidoId, itens: a.itens, lembrar: a.lembrar, confirmar_repetido: a.confirmarRepetido })
export const blingConectarInicio = () => chamarFuncao<{ ok: true; url: string }>("bling", { acao: "conectar_inicio" })
export const blingConectarFim = (code: string, state: string) => chamarFuncao<{ ok: true }>("bling", { acao: "conectar_fim", code, state })
export const blingContatos = (busca: string) => chamarFuncao<{ ok: true; contatos: ContatoBling[] }>("bling", { acao: "contatos", busca })
export const blingDefinirContato = (c: { id: number; nome: string }) => chamarFuncao<{ ok: true }>("bling", { acao: "definir_contato", ...c })
export const blingSalvarCodigo = (sku: string, codigo: string) => chamarFuncao<{ ok: true }>("bling", { acao: "salvar_codigo", sku, codigo })
export const blingApagarCodigo = (sku: string) => chamarFuncao<{ ok: true }>("bling", { acao: "apagar_codigo", sku })

export type SituacaoBling = { conectado: boolean; contatoDefinido: boolean; contatoNome: string | null; semBanco: boolean }

// Conexão com o Bling, sem token. "semBanco": a migration ainda não foi aplicada.
export function useBlingSituacao() {
  return useQuery({
    queryKey: ["bling", "situacao"],
    queryFn: async (): Promise<SituacaoBling> => {
      const { data, error } = await supabase.rpc("bling_situacao")
      if (error) {
        if (semFuncao(error)) return { conectado: false, contatoDefinido: false, contatoNome: null, semBanco: true }
        throw error
      }
      const r = (Array.isArray(data) ? data[0] : data) as { conectado?: boolean; contato_definido?: boolean; contato_nome?: string | null } | null
      return { conectado: !!r?.conectado, contatoDefinido: !!r?.contato_definido, contatoNome: r?.contato_nome ?? null, semBanco: false }
    },
    staleTime: 60_000,
  })
}

export type PedidoGerado = {
  id: string
  pedido_id: string | null
  bling_id: number
  bling_numero: string | null
  itens: { sku: string | null; codigo: string; qtd: number }[]
  total: number
  criado_por: string | null
  criado_em: string
}

// Pedidos já gerados no Bling: todos (gestor) ou só os do pedido (a RLS limita à funcionária).
export function useBlingPedidos(pedidoId?: string, limite = 15) {
  return useQuery({
    queryKey: ["bling", "pedidos", pedidoId ?? "todos"],
    queryFn: async (): Promise<PedidoGerado[]> => {
      let q = supabase.from("bling_pedidos").select("*").order("criado_em", { ascending: false }).limit(limite)
      if (pedidoId) q = q.eq("pedido_id", pedidoId)
      const { data, error } = await q
      if (error) {
        if (semFuncao(error)) return []
        throw error
      }
      return (data ?? []) as unknown as PedidoGerado[]
    },
  })
}

export type CodigoLembrado = { sku: string; codigo_bling: string; atualizado_por: string | null; atualizado_em: string }
export function useBlingCodigos() {
  return useQuery({
    queryKey: ["bling", "codigos"],
    queryFn: async (): Promise<CodigoLembrado[]> => {
      const { data, error } = await supabase.from("bling_codigos").select("*").order("sku")
      if (error) {
        if (semFuncao(error)) return []
        throw error
      }
      return (data ?? []) as CodigoLembrado[]
    },
  })
}

const QTD_MAX = 9999

// Lê a lista colada: uma peça por linha, como "SKU x2", "SKU 2", "2 SKU", "2x SKU" ou só "SKU" (quantidade 1).
// É o mesmo formato do "Copiar SKUs" da etapa. Códigos repetidos somam. Linhas com quantidade 0 ou inválida vão em `ignoradas`.
export function lerLista(texto: string): { linhas: { sku: string; qtd: number }[]; ignoradas: string[] } {
  const por = new Map<string, { sku: string; qtd: number }>()
  const ignoradas: string[] = []
  for (const bruta of texto.split(/\r?\n/)) {
    const linha = bruta.replace(/[\t;]+/g, " ").replace(/\s+/g, " ").trim()
    if (!linha) continue
    let sku = linha
    let qtd = 1
    let m: RegExpMatchArray | null
    if ((m = linha.match(/^(.+?)\s+[x×*]\s*(\d+)$/i))) [sku, qtd] = [m[1], Number(m[2])]
    else if ((m = linha.match(/^(\d+)\s*[x×*]\s+(.+)$/i))) [sku, qtd] = [m[2], Number(m[1])]
    else if ((m = linha.match(/^(\d+) (\S+)$/))) [sku, qtd] = [m[2], Number(m[1])]
    else if ((m = linha.match(/^(\S+) (\d+)$/))) [sku, qtd] = [m[1], Number(m[2])]
    sku = sku.trim()
    if (!sku || qtd < 1 || qtd > QTD_MAX) {
      ignoradas.push(bruta.trim())
      continue
    }
    const chave = sku.toLowerCase()
    const atual = por.get(chave)
    if (atual) atual.qtd = Math.min(QTD_MAX, atual.qtd + qtd)
    else por.set(chave, { sku, qtd })
  }
  return { linhas: [...por.values()], ignoradas }
}
