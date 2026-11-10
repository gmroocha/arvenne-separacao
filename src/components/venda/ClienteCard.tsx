import { useState } from "react"
import { toast } from "sonner"
import { Check, Search, TriangleAlert, UserPlus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { Spinner } from "@/components/ui/spinner"
import { useBuscaClientes } from "@/lib/api"
import { digitos, mascaraCep, mascaraDocumento, mascaraTelefone } from "@/lib/formato"
import type { Cliente, ClienteShopify } from "@/lib/tipos"
import { useDebounce } from "@/lib/useDebounce"
import { buscarCnpj } from "@/lib/cnpj"
import { buscarCep } from "@/lib/viacep"
import type { FormVenda } from "./form"

type Props = {
  form: FormVenda
  aoMudar: (parcial: Partial<FormVenda>) => void
  aoSalvarCliente: () => Promise<void>
}

type Achada = (Cliente | ClienteShopify) & { origem: "local" | "shopify" }

function parcialDe(c: Achada): Partial<FormVenda> {
  const local = c.origem === "local" ? (c as Cliente) : null
  return {
    cliente_id: local?.id ?? null,
    cliente_nome: c.nome ?? "",
    cliente_cpf: c.cpf ? mascaraDocumento(c.cpf) : "",
    cliente_razao_social: local?.razao_social ?? "",
    cliente_ie: local?.ie ?? "",
    cliente_email: c.email ?? "",
    cliente_telefone: c.telefone ? mascaraTelefone(c.telefone) : "",
    entrega_cep: mascaraCep(c.cep ?? ""),
    entrega_logradouro: c.logradouro ?? "",
    entrega_numero: c.numero ?? "",
    entrega_complemento: c.complemento ?? "",
    entrega_bairro: c.bairro ?? "",
    entrega_cidade: c.cidade ?? "",
    entrega_uf: c.uf ?? "",
  }
}

function Resultado({ c, aoEscolher }: { c: Achada; aoEscolher: () => void }) {
  return (
    <button
      type="button"
      onClick={aoEscolher}
      className="flex w-full flex-col items-start rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
    >
      <span className={c.nome ? "font-medium" : "font-medium text-muted-foreground"}>{c.nome ?? "Sem nome"}</span>
      <span className="text-xs text-muted-foreground">
        {[c.telefone ? mascaraTelefone(c.telefone) : null, c.email].filter(Boolean).join(" · ") || "sem contato"}
      </span>
    </button>
  )
}

export default function ClienteCard({ form, aoMudar, aoSalvarCliente }: Props) {
  const [busca, setBusca] = useState("")
  const [mostrar, setMostrar] = useState(Boolean(form.cliente_nome || form.cliente_telefone))
  const [salvando, setSalvando] = useState(false)
  const [buscandoCep, setBuscandoCep] = useState(false)
  const [buscandoCnpj, setBuscandoCnpj] = useState(false)
  const [situacao, setSituacao] = useState<string | null>(null)
  const termo = useDebounce(busca.trim(), 300)
  const { local, shopify, carregando } = useBuscaClientes(termo)
  const escolher = (c: Achada) => {
    aoMudar(parcialDe(c))
    setMostrar(true)
    setBusca("")
  }
  const semResultado = termo.length >= 2 && !carregando && local.length === 0 && shopify.length === 0

  async function mudarCep(valor: string) {
    const cep = mascaraCep(valor)
    aoMudar({ entrega_cep: cep })
    if (cep.replace(/\D/g, "").length !== 8) return
    setBuscandoCep(true)
    try {
      const r = await buscarCep(cep)
      if (r)
        aoMudar({
          entrega_logradouro: r.logradouro ?? "",
          entrega_bairro: r.bairro ?? "",
          entrega_cidade: r.cidade ?? "",
          entrega_uf: r.uf ?? "",
        })
      else toast.error("CEP não encontrado")
    } catch {
      toast.error("Não foi possível consultar o CEP")
    } finally {
      setBuscandoCep(false)
    }
  }

  // 14 dígitos = CNPJ: busca razão social, endereço e inscrição estadual (só o número sai do app).
  async function mudarDocumento(valor: string) {
    const doc = mascaraDocumento(valor)
    aoMudar({ cliente_cpf: doc })
    setSituacao(null)
    if (digitos(doc).length !== 14) return
    setBuscandoCnpj(true)
    try {
      const r = await buscarCnpj(doc)
      if (!r) return void toast.error("CNPJ não encontrado")
      setSituacao(r.situacao)
      const e = r.endereco
      aoMudar({
        cliente_razao_social: r.razao_social,
        ...(form.cliente_nome.trim() ? {} : { cliente_nome: r.razao_social }),
        ...(r.ie ? { cliente_ie: r.ie } : {}),
        entrega_cep: mascaraCep(e.cep),
        entrega_logradouro: e.logradouro ?? "",
        entrega_numero: e.numero ?? "",
        entrega_complemento: e.complemento ?? "",
        entrega_bairro: e.bairro ?? "",
        entrega_cidade: e.cidade ?? "",
        entrega_uf: e.uf ?? "",
      })
    } catch {
      toast.error("Não foi possível consultar o CNPJ")
    } finally {
      setBuscandoCnpj(false)
    }
  }

  async function salvar() {
    if (!form.cliente_nome.trim()) return toast.error("Informe o nome da cliente")
    setSalvando(true)
    try {
      await aoSalvarCliente()
      toast.success("Cliente salva")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar a cliente")
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Cliente</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <InputGroup>
          <InputGroupAddon>{carregando ? <Spinner /> : <Search />}</InputGroupAddon>
          <InputGroupInput
            placeholder="Telefone, e-mail, nome ou CPF"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            aria-label="Buscar cliente"
          />
        </InputGroup>

        {termo.length >= 2 && (local.length > 0 || shopify.length > 0 || semResultado) && (
          <div className="flex max-h-80 flex-col gap-1 overflow-y-auto rounded-lg border p-1">
            {local.length > 0 && (
              <>
                <div className="px-2 pt-1 text-xs font-medium text-muted-foreground">Clientes cadastradas</div>
                {local.map((c) => (
                  <Resultado key={c.id} c={{ ...c, origem: "local" }} aoEscolher={() => escolher({ ...c, origem: "local" })} />
                ))}
              </>
            )}
            {shopify.length > 0 && (
              <>
                <div className="px-2 pt-1 text-xs font-medium text-muted-foreground">Shopify</div>
                {shopify.map((c) => (
                  <Resultado key={c.shopify_customer_id} c={{ ...c, origem: "shopify" }} aoEscolher={() => escolher({ ...c, origem: "shopify" })} />
                ))}
              </>
            )}
            {semResultado && <div className="px-2 py-1.5 text-sm text-muted-foreground">Nenhuma cliente encontrada.</div>}
          </div>
        )}

        {!mostrar ? (
          <Button variant="outline" className="w-fit" onClick={() => setMostrar(true)}>
            <UserPlus /> Nova cliente
          </Button>
        ) : (
          <FieldGroup className="gap-3">
            <Field>
              <FieldLabel htmlFor="c-nome">Nome</FieldLabel>
              <Input id="c-nome" value={form.cliente_nome} onChange={(e) => aoMudar({ cliente_nome: e.target.value })} />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="c-tel">Telefone</FieldLabel>
                <Input
                  id="c-tel"
                  type="tel"
                  inputMode="tel"
                  value={form.cliente_telefone}
                  onChange={(e) => aoMudar({ cliente_telefone: mascaraTelefone(e.target.value) })}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="c-cpf">CPF ou CNPJ</FieldLabel>
                <InputGroup>
                  <InputGroupInput id="c-cpf" inputMode="numeric" value={form.cliente_cpf} onChange={(e) => mudarDocumento(e.target.value)} />
                  {buscandoCnpj && (
                    <InputGroupAddon align="inline-end">
                      <Spinner />
                    </InputGroupAddon>
                  )}
                </InputGroup>
              </Field>
            </div>
            {situacao && situacao !== "ATIVA" && (
              <p className="flex items-center gap-2 text-sm text-amber-700 dark:text-amber-400">
                <TriangleAlert className="size-4 shrink-0" /> Situação cadastral do CNPJ: {situacao.toLowerCase()}
              </p>
            )}
            {(digitos(form.cliente_cpf).length === 14 || form.cliente_razao_social || form.cliente_ie) && (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="c-razao">Razão social</FieldLabel>
                  <Input id="c-razao" value={form.cliente_razao_social} onChange={(e) => aoMudar({ cliente_razao_social: e.target.value })} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="c-ie">Inscrição estadual (opcional)</FieldLabel>
                  <Input id="c-ie" value={form.cliente_ie} onChange={(e) => aoMudar({ cliente_ie: e.target.value })} />
                </Field>
              </div>
            )}
            <Field>
              <FieldLabel htmlFor="c-email">E-mail</FieldLabel>
              <Input id="c-email" type="email" value={form.cliente_email} onChange={(e) => aoMudar({ cliente_email: e.target.value })} />
            </Field>

            <div className="grid gap-3 sm:grid-cols-[140px_1fr]">
              <Field>
                <FieldLabel htmlFor="c-cep">CEP</FieldLabel>
                <InputGroup>
                  <InputGroupInput id="c-cep" inputMode="numeric" value={form.entrega_cep} onChange={(e) => mudarCep(e.target.value)} />
                  {buscandoCep && (
                    <InputGroupAddon align="inline-end">
                      <Spinner />
                    </InputGroupAddon>
                  )}
                </InputGroup>
              </Field>
              <Field>
                <FieldLabel htmlFor="c-rua">Rua</FieldLabel>
                <Input id="c-rua" value={form.entrega_logradouro} onChange={(e) => aoMudar({ entrega_logradouro: e.target.value })} />
              </Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-[100px_1fr]">
              <Field>
                <FieldLabel htmlFor="c-num">Número</FieldLabel>
                <Input id="c-num" value={form.entrega_numero} onChange={(e) => aoMudar({ entrega_numero: e.target.value })} />
              </Field>
              <Field>
                <FieldLabel htmlFor="c-comp">Complemento</FieldLabel>
                <Input id="c-comp" value={form.entrega_complemento} onChange={(e) => aoMudar({ entrega_complemento: e.target.value })} />
              </Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-[1fr_1fr_70px]">
              <Field>
                <FieldLabel htmlFor="c-bairro">Bairro</FieldLabel>
                <Input id="c-bairro" value={form.entrega_bairro} onChange={(e) => aoMudar({ entrega_bairro: e.target.value })} />
              </Field>
              <Field>
                <FieldLabel htmlFor="c-cidade">Cidade</FieldLabel>
                <Input id="c-cidade" value={form.entrega_cidade} onChange={(e) => aoMudar({ entrega_cidade: e.target.value })} />
              </Field>
              <Field>
                <FieldLabel htmlFor="c-uf">UF</FieldLabel>
                <Input
                  id="c-uf"
                  maxLength={2}
                  value={form.entrega_uf}
                  onChange={(e) => aoMudar({ entrega_uf: e.target.value.toUpperCase() })}
                />
              </Field>
            </div>
            <Button variant="outline" className="w-fit" onClick={salvar} disabled={salvando}>
              {salvando ? <Spinner /> : <Check />} Salvar no cadastro de clientes
            </Button>
          </FieldGroup>
        )}
      </CardContent>
    </Card>
  )
}
