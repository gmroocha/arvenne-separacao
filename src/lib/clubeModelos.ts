// Clube com produto "pai" e variantes: código sugerido, agrupamento para a tela, validação das linhas de cadastro e o envio
// de fotos em paralelo. Só texto e organização: nenhum valor em dinheiro é calculado aqui (o preço da variante sem preço
// próprio é o do pai e a conta continua sendo do banco).
import { lerNumero } from "@/lib/formato"
import { numeroTamanho, separarTamanho } from "@/lib/variante"
import { montarVariante, type ParteVariante } from "@/lib/varianteClube"
import type { ModeloClube, PecaClube } from "@/lib/tipos"

// Uma variante em edição: as partes (tamanho, cor, outra), o código (null = sugerido pelo código do pai) e o preço (vazio = o do pai).
export type LinhaVariante = { chave: string; partes: ParteVariante[]; codigoManual: string | null; preco: string; id?: string }

export const novaLinhaVariante = (partes: ParteVariante[] = []): LinhaVariante => ({ chave: crypto.randomUUID(), partes, codigoManual: null, preco: "" })

const semAcento = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "")

// "VERDE / N°16" → "VERDE-16". Tamanho vira só o número; o resto, letras e números sem acento, em maiúsculas.
export function sufixoDaVariante(partes: ParteVariante[]): string {
  const preenchidas = partes.filter((p) => p.valor.trim())
  const limpo = (v: string) => semAcento(v).toLocaleUpperCase("pt-BR").replace(/[^A-Z0-9]/g, "")
  const outras = preenchidas.filter((p) => p.tipo !== "tamanho").map((p) => limpo(p.valor))
  const tamanhos = preenchidas.filter((p) => p.tipo === "tamanho").map((p) => p.valor.match(/\d+/)?.[0] ?? limpo(p.valor))
  return [...outras, ...tamanhos].filter(Boolean).join("-")
}

// Código sugerido da variante: BASE-SUFIXO ("AN-SOL" + "N°16" → "AN-SOL-16"). Sem sufixo, sem sugestão.
export function codigoSugerido(base: string, partes: ParteVariante[]): string {
  const b = base.trim()
  const s = sufixoDaVariante(partes)
  return b && s ? `${b}-${s}` : ""
}

export const codigoDaLinha = (base: string, l: LinhaVariante) => (l.codigoManual ?? codigoSugerido(base, l.partes)).trim()

// Linha do formulário → o que vai para salvar_modelo_clube. O preço vazio fica de fora (o banco usa o do pai).
export function variantesParaSalvar(base: string, linhas: LinhaVariante[]) {
  return linhas.map((l) => ({
    ...(l.id ? { id: l.id } : {}),
    codigo: codigoDaLinha(base, l),
    variante: montarVariante(l.partes) ?? "",
    preco: l.preco.trim() ? lerNumero(l.preco) : null,
  }))
}

// O que falta numa variante (ou null): o banco confere de novo, mas aqui a tela marca a linha antes de enviar.
export function erroDaVariante(base: string, l: LinhaVariante): string | null {
  if (!codigoDaLinha(base, l)) return "Informe o código da variante"
  if (!montarVariante(l.partes)) return "Informe a variante (tamanho, cor...)"
  if (l.preco.trim() && lerNumero(l.preco) == null) return "Preço não entendido"
  return null
}

// Erros de uma peça nova (cadastro em massa ou formulário), na ordem em que a pessoa preenche. Código repetido entre as
// variantes também é erro. Lista vazia = pode salvar.
export function errosDoProduto(p: { codigo: string; nome: string; preco: string; linhas: LinhaVariante[] }): string[] {
  const erros: string[] = []
  if (!p.codigo.trim()) erros.push("Informe o código")
  if (!p.nome.trim()) erros.push("Informe o nome")
  if (p.preco.trim() && lerNumero(p.preco) == null) erros.push("Preço não entendido")
  const vistos = new Set<string>()
  for (const l of p.linhas) {
    const e = erroDaVariante(p.codigo, l)
    if (e) erros.push(e)
    const c = codigoDaLinha(p.codigo, l).toLowerCase()
    if (c && vistos.has(c)) erros.push(`O código ${codigoDaLinha(p.codigo, l)} se repete nas variantes`)
    vistos.add(c)
  }
  return [...new Set(erros)]
}

// Quando duas variantes do mesmo produto têm o mesmo tamanho (cores diferentes), o botão mostra a variante inteira.
export function rotulosDeVariantes(variantes: (string | null | undefined)[]): string[] {
  const curtos = variantes.map((v) => separarTamanho(v).tamanho ?? (v ?? "").trim() ?? "")
  const repetido = new Set(curtos).size !== curtos.length
  return variantes.map((v, i) => (repetido ? (v ?? "").trim() || "—" : curtos[i] || "—"))
}

export type GrupoClube<P> = { chave: string; modelo: ModeloClube | null; pecas: P[] }

// Agrupa as peças do Clube por produto (modelo_id), na ordem da primeira peça de cada um; peça sem pai fica sozinha.
// Dentro do produto, as variantes seguem o tamanho (N°14 antes de N°16) e depois o texto.
export function agruparClube<P extends Pick<PecaClube, "id" | "variante" | "modelo_id">>(pecas: P[], modelos: ModeloClube[]): GrupoClube<P>[] {
  const porModelo = new Map(modelos.map((m) => [m.id, m]))
  const grupos: GrupoClube<P>[] = []
  const abertos = new Map<string, GrupoClube<P>>()
  for (const p of pecas) {
    if (!p.modelo_id) {
      grupos.push({ chave: p.id, modelo: null, pecas: [p] })
      continue
    }
    let g = abertos.get(p.modelo_id)
    if (!g) {
      g = { chave: p.modelo_id, modelo: porModelo.get(p.modelo_id) ?? null, pecas: [] }
      abertos.set(p.modelo_id, g)
      grupos.push(g)
    }
    g.pecas.push(p)
  }
  for (const g of grupos)
    g.pecas.sort((a, b) => numeroTamanho(separarTamanho(a.variante).tamanho) - numeroTamanho(separarTamanho(b.variante).tamanho) || (a.variante ?? "").localeCompare(b.variante ?? "", "pt-BR"))
  return grupos
}

// Sobe os arquivos com no máximo `limite` de cada vez, na ordem; um que falha não derruba os outros. `aoMudar` avisa cada
// um que começou, terminou ou falhou (para mostrar o progresso). Devolve o resultado de cada arquivo, na ordem de entrada.
export type ResultadoEnvio<R> = { ok: true; valor: R } | { ok: false; erro: unknown }
export async function enviarEmParalelo<T, R>(
  itens: T[],
  enviar: (item: T, indice: number) => Promise<R>,
  { limite = 3, aoMudar }: { limite?: number; aoMudar?: (indice: number, estado: "enviando" | "ok" | "erro", resultado?: ResultadoEnvio<R>) => void } = {},
): Promise<ResultadoEnvio<R>[]> {
  const resultados: ResultadoEnvio<R>[] = new Array(itens.length)
  let proximo = 0
  async function trabalhador() {
    while (proximo < itens.length) {
      const i = proximo++
      aoMudar?.(i, "enviando")
      try {
        const valor = await enviar(itens[i], i)
        resultados[i] = { ok: true, valor }
        aoMudar?.(i, "ok", resultados[i])
      } catch (erro) {
        resultados[i] = { ok: false, erro }
        aoMudar?.(i, "erro", resultados[i])
      }
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limite, itens.length)) }, trabalhador))
  return resultados
}
