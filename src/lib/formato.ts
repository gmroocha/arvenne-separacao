const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })
export const reais = (v: number | null | undefined) => (v == null ? "—" : moeda.format(v))

const dataHora = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" })
export const quando = (iso: string) => dataHora.format(new Date(iso))

// Telefone brasileiro para link do WhatsApp (wa.me/55...).
export function linkWhatsApp(telefone: string | null, texto: string): string | null {
  if (!telefone) return null
  let d = telefone.replace(/\D/g, "")
  if (d.length <= 11) d = "55" + d
  return `https://wa.me/${d}?text=${encodeURIComponent(texto)}`
}
