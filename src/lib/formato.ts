const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })
export const reais = (v: number | null | undefined) => (v == null ? "—" : moeda.format(v))

const dataHora = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" })
export const quando = (iso: string) => dataHora.format(new Date(iso))

const hora = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" })

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

export function mascaraTelefone(t: string): string {
  const d = digitos(t).slice(0, 11)
  if (d.length <= 2) return d
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}

export function mascaraCep(t: string): string {
  const d = digitos(t).slice(0, 8)
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d
}

// "10,50" ou "10.5" -> 10.5; vazio -> null.
export function lerNumero(t: string): number | null {
  const n = Number(t.replace(/\./g, "").replace(",", "."))
  return t.trim() === "" || Number.isNaN(n) ? null : n
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
  const hoje = new Date(agora)
  const mesmoDia = alvo.toDateString() === hoje.toDateString()
  const meiaNoite = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const corridos = Math.round((meiaNoite(alvo) - meiaNoite(hoje)) / 86400000)
  if (mesmoDia) return { texto: `vence hoje ${hora.format(alvo)}`, atrasado: false, uteis: horasUteis, corridos }
  const rotuloCorridos = `${corridos} ${corridos === 1 ? "dia corrido" : "dias corridos"}`
  const texto =
    horasUteis != null
      ? `vence em ${Math.round(horasUteis)} h úteis · ${rotuloCorridos}`
      : `vence ${quando(prazo)} · ${rotuloCorridos}`
  return { texto, atrasado: false, uteis: horasUteis, corridos }
}
