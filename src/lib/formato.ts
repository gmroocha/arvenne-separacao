// Todas as datas e horas do app são de São Paulo, qualquer que seja o fuso do aparelho.
const FUSO = "America/Sao_Paulo"

const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })
export const reais = (v: number | null | undefined) => (v == null ? "—" : moeda.format(v))

const dataHora = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: FUSO })
export const quando = (iso: string) => dataHora.format(new Date(iso))

const hora = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: FUSO })

// Dia (aaaa-mm-dd) em São Paulo, para comparar "hoje" sem depender do fuso do aparelho.
const diaSP = new Intl.DateTimeFormat("en-CA", { timeZone: FUSO, year: "numeric", month: "2-digit", day: "2-digit" })
const diaNumero = (d: Date) => {
  const [a, m, dia] = diaSP.format(d).split("-").map(Number)
  return Date.UTC(a, m - 1, dia) / 86400000
}

export const digitos = (t: string | null | undefined) => (t ?? "").replace(/\D/g, "")

// Telefone só vira link se tiver ao menos 10 dígitos (texto como "teste" não vira).
export const telefoneValido = (t: string | null | undefined) => digitos(t).length >= 10

// Telefone brasileiro para link do WhatsApp (wa.me/55...).
export function linkWhatsApp(telefone: string | null, texto: string): string | null {
  if (!telefoneValido(telefone)) return null
  let d = digitos(telefone)
  if (d.length <= 11) d = "55" + d
  return `https://wa.me/${d}?text=${encodeURIComponent(texto)}`
}

export function mascaraCpf(t: string): string {
  const d = digitos(t).slice(0, 11)
  return d
    .replace(/^(\d{3})(\d)/, "$1.$2")
    .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1-$2")
}

// CPF (11 dígitos) ou CNPJ (14).
export function mascaraDocumento(t: string | null | undefined): string {
  const d = digitos(t).slice(0, 14)
  if (d.length <= 11) return mascaraCpf(d)
  return d
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2")
}

// Tira o 55 (Brasil) de telefones colados com +55: 12 ou 13 dígitos começando em 55.
export function mascaraTelefone(t: string): string {
  let d = digitos(t)
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) d = d.slice(2)
  d = d.slice(0, 11)
  if (d.length <= 2) return d
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}

export function mascaraCep(t: string): string {
  const d = digitos(t).slice(0, 8)
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d
}

// Aceita "10,50", "10.50", "1.234,56", "1,234.56" e "1234". Um separador só: 1-2 dígitos depois
// é decimal, 3 é milhar. Vazio, texto, negativo e infinito -> null.
export function lerNumero(t: string): number | null {
  const x = t.trim().replace(/^R\$\s*/, "").replace(/\s/g, "")
  if (!/^\d[\d.,]*$/.test(x)) return null
  const ultimoPonto = x.lastIndexOf(".")
  const ultimaVirgula = x.lastIndexOf(",")
  const ultimo = Math.max(ultimoPonto, ultimaVirgula)
  let inteiro = x
  let decimal = ""
  if (ultimo >= 0) {
    const depois = x.slice(ultimo + 1)
    const sep = x[ultimo]
    const outro = sep === "." ? "," : "."
    const repetido = x.split(sep).length > 2
    // Separador único com 3 dígitos depois (ou repetido) é milhar; senão é decimal.
    const milhar = repetido || (!x.includes(outro) && depois.length === 3)
    if (!milhar) {
      if (depois.length > 2 || depois.length === 0) return null
      inteiro = x.slice(0, ultimo)
      decimal = depois
    }
  }
  inteiro = inteiro.replace(/[.,]/g, "")
  if (inteiro === "") return null
  const n = Number(decimal ? `${inteiro}.${decimal}` : inteiro)
  return Number.isFinite(n) && n >= 0 ? n : null
}

export const numeroParaTexto = (n: number | null | undefined) =>
  n == null ? "" : String(n).replace(".", ",")

export type PrazoFormatado = {
  texto: string
  atrasado: boolean
  uteis: number | null
  corridos: number | null
}

// Só formatação: o instante do prazo e as horas úteis vêm calculados pela view v_pedidos.
export function formatarPrazo(prazo: string | null, horasUteis: number | null, agora = Date.now()): PrazoFormatado {
  if (!prazo) return { texto: "sem prazo", atrasado: false, uteis: null, corridos: null }
  const alvo = new Date(prazo)
  const dif = alvo.getTime() - agora
  if (dif < 0) {
    const h = Math.floor(-dif / 3600000)
    const texto = h < 1 ? "atrasado" : h < 48 ? `atrasado ${h} h` : `atrasado ${Math.floor(h / 24)} d`
    return { texto, atrasado: true, uteis: null, corridos: null }
  }
  const corridos = diaNumero(alvo) - diaNumero(new Date(agora))
  const mesmoDia = corridos === 0
  if (mesmoDia) return { texto: `vence hoje ${hora.format(alvo)}`, atrasado: false, uteis: horasUteis, corridos }
  const rotuloCorridos = `${corridos} ${corridos === 1 ? "dia corrido" : "dias corridos"}`
  const texto =
    horasUteis != null
      ? `vence em ${Math.round(horasUteis)} h úteis · ${rotuloCorridos}`
      : `vence ${quando(prazo)} · ${rotuloCorridos}`
  return { texto, atrasado: false, uteis: horasUteis, corridos }
}

// Texto de campo de dinheiro: "1.234,50" (pt-BR, sempre 2 casas, sem o R$). Só formatação.
export const reaisTexto = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
