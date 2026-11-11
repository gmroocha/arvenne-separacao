// Cliente mínimo do Zebra Browser Print (programa gratuito da Zebra que roda no PC e fala com a impressora).
// Em https o programa atende em https://localhost:9101; em http (desenvolvimento), em http://localhost:9100.

export type DispositivoZebra = { name: string; uid: string; connection: string; deviceType: string; provider?: string; manufacturer?: string; version?: number }

const base = () => (window.location.protocol === "https:" ? "https://localhost:9101" : "http://localhost:9100")

const TEMPO_MAX_MS = 1500
const VALIDADE_NEGATIVA_MS = 60_000 // sem programa: tenta de novo depois de 1 minuto

let guardado: { quando: number; dispositivo: DispositivoZebra | null } | null = null

async function comTempo(url: string, init?: RequestInit, ms = TEMPO_MAX_MS) {
  const ctl = new AbortController()
  const t = setTimeout(() => ctl.abort(), ms)
  try {
    return await fetch(url, { ...init, signal: ctl.signal })
  } finally {
    clearTimeout(t)
  }
}

// Procura a impressora padrão do Browser Print. Devolve null se o programa não responde ou não há impressora.
// O resultado fica em memória durante a sessão.
export async function detectar(forcar = false): Promise<DispositivoZebra | null> {
  if (!forcar && guardado && (guardado.dispositivo || Date.now() - guardado.quando < VALIDADE_NEGATIVA_MS)) return guardado.dispositivo
  let dispositivo: DispositivoZebra | null = null
  try {
    const r = await comTempo(`${base()}/default?type=printer`)
    if (r.ok) {
      const texto = (await r.text()).trim()
      if (texto) {
        const d = JSON.parse(texto) as DispositivoZebra
        if (d?.uid) dispositivo = d
      }
    }
  } catch {
    dispositivo = null
  }
  guardado = { quando: Date.now(), dispositivo }
  return dispositivo
}

// Manda o ZPL direto para a impressora. Lança erro em português se não der.
export async function imprimir(dispositivo: DispositivoZebra, zpl: string): Promise<void> {
  let r: Response
  try {
    // text/plain evita a checagem prévia (preflight) do navegador, que o Browser Print não responde.
    r = await comTempo(`${base()}/write`, { method: "POST", headers: { "Content-Type": "text/plain" }, body: JSON.stringify({ device: dispositivo, data: zpl }) }, 15_000)
  } catch {
    guardado = null
    throw new Error("Não consegui falar com a Zebra. Abra o Zebra Browser Print e aceite este site.")
  }
  if (!r.ok) {
    const detalhe = (await r.text().catch(() => "")).trim()
    throw new Error(`A Zebra recusou a impressão${detalhe ? `: ${detalhe}` : ""}. Confira se está ligada e com etiquetas.`)
  }
}
