import type { Endereco } from "@/lib/tipos"

export type DadosCnpj = {
  razao_social: string
  situacao: string | null // "ATIVA", "BAIXADA"...
  ie: string | null // inscrição estadual (só a CNPJá traz)
  endereco: Partial<Endereco> & { cep: string }
}

const txt = (v: unknown) => (typeof v === "string" || typeof v === "number" ? String(v).trim() : "")
const obj = (v: unknown) => (v && typeof v === "object" ? (v as Record<string, unknown>) : {})

// CNPJá (gratuita, sem chave, poucas consultas por minuto): traz a inscrição estadual.
async function viaCnpja(cnpj: string): Promise<DadosCnpj | null> {
  const res = await fetch(`https://open.cnpja.com/office/${cnpj}`, { signal: AbortSignal.timeout(10_000) })
  if (!res.ok) return null
  const r = obj(await res.json())
  const nome = txt(obj(r.company).name)
  if (!nome) return null
  const a = obj(r.address)
  const uf = txt(a.state).toUpperCase()
  const regs = (Array.isArray(r.registrations) ? r.registrations : []).map(obj).filter((x) => txt(x.number))
  // Prefere a inscrição habilitada no estado do endereço; senão a primeira habilitada.
  const ativa = regs.filter((x) => x.enabled !== false)
  const reg = ativa.find((x) => txt(x.state).toUpperCase() === uf) ?? ativa[0]
  return {
    razao_social: nome,
    situacao: txt(obj(r.status).text).toUpperCase() || null,
    ie: reg ? txt(reg.number) : null,
    endereco: {
      cep: txt(a.zip).replace(/\D/g, ""),
      logradouro: txt(a.street),
      numero: txt(a.number),
      complemento: txt(a.details),
      bairro: txt(a.district),
      cidade: txt(a.municipality),
      uf,
    },
  }
}

// BrasilAPI (gratuita, sem chave): razão social e endereço, mas sem inscrição estadual.
async function viaBrasilApi(cnpj: string): Promise<DadosCnpj | null> {
  const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, { signal: AbortSignal.timeout(10_000) })
  if (res.status === 404) return null
  if (!res.ok) throw new Error("Não foi possível consultar o CNPJ")
  const r = obj(await res.json())
  const nome = txt(r.razao_social)
  if (!nome) return null
  return {
    razao_social: nome,
    situacao: txt(r.descricao_situacao_cadastral).toUpperCase() || null,
    ie: null,
    endereco: {
      cep: txt(r.cep).replace(/\D/g, ""),
      logradouro: [txt(r.descricao_tipo_de_logradouro), txt(r.logradouro)].filter(Boolean).join(" "),
      numero: txt(r.numero),
      complemento: txt(r.complemento),
      bairro: txt(r.bairro),
      cidade: txt(r.municipio),
      uf: txt(r.uf).toUpperCase(),
    },
  }
}

// Só o número do CNPJ sai daqui, nenhum outro dado da cliente. Devolve null se o CNPJ não existir.
export async function buscarCnpj(cnpj: string): Promise<DadosCnpj | null> {
  const d = cnpj.replace(/\D/g, "")
  if (d.length !== 14) return null
  try {
    const r = await viaCnpja(d)
    if (r) return r
  } catch {
    // limite de consultas ou falha de rede: cai para a BrasilAPI
  }
  return viaBrasilApi(d)
}
