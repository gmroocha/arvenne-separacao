import { useState } from "react"
import { toast } from "sonner"
import CampoReais from "@/components/CampoReais"
import RespDialog from "@/components/RespDialog"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { atualizarPedido, registrarNota, type CamposPedido, type PedidoDetalhe } from "@/lib/api"
import { digitos, lerNumero, mascaraCep, mascaraDocumento, mascaraTelefone, numeroParaTexto, reais } from "@/lib/formato"
import { COR_PAC, COR_SEDEX } from "@/lib/selo"
import { useQueryClient } from "@tanstack/react-query"

type FreteTipo = "PAC" | "SEDEX" | "retirada" | "outro"
const ROTULO_FRETE: Record<FreteTipo, string> = { PAC: "PAC", SEDEX: "SEDEX", retirada: "Retirada", outro: "Outro" }

function Formulario({ pedido, aoFechar }: { pedido: PedidoDetalhe; aoFechar: () => void }) {
  const qc = useQueryClient()
  const [f, setF] = useState({
    nome: pedido.cliente_nome ?? "",
    telefone: pedido.cliente_telefone ? mascaraTelefone(pedido.cliente_telefone) : "",
    email: pedido.cliente_email ?? "",
    cpf: mascaraDocumento(pedido.cliente_cpf ?? ""),
    cep: mascaraCep(pedido.entrega_cep ?? ""),
    logradouro: pedido.entrega_logradouro ?? "",
    numero: pedido.entrega_numero ?? "",
    complemento: pedido.entrega_complemento ?? "",
    bairro: pedido.entrega_bairro ?? "",
    cidade: pedido.entrega_cidade ?? "",
    uf: pedido.entrega_uf ?? "",
    frete: (pedido.frete_tipo ?? "") as FreteTipo | "",
    custo: numeroParaTexto(pedido.frete_custo),
  })
  const [salvando, setSalvando] = useState(false)
  const mudar = (parcial: Partial<typeof f>) => setF((v) => ({ ...v, ...parcial }))
  const t = (s: string) => s.trim() || null

  async function salvar() {
    const custo = f.custo.trim() ? lerNumero(f.custo) : null
    if (f.custo.trim() && custo == null) return void toast.error("Custo do frete não entendido. Use, por exemplo, 39,90")
    const campos: CamposPedido = {
      cliente_nome: t(f.nome),
      cliente_telefone: t(digitos(f.telefone)),
      cliente_email: t(f.email),
      cliente_cpf: t(digitos(f.cpf)),
      entrega_cep: t(digitos(f.cep)),
      entrega_logradouro: t(f.logradouro),
      entrega_numero: t(f.numero),
      entrega_complemento: t(f.complemento),
      entrega_bairro: t(f.bairro),
      entrega_cidade: t(f.cidade),
      entrega_uf: t(f.uf.toUpperCase()),
      frete_tipo: (f.frete || null) as CamposPedido["frete_tipo"],
      frete_custo: custo,
    }
    // Só o que mudou vai ao banco.
    const mudados = Object.fromEntries(
      Object.entries(campos).filter(([k, v]) => v !== ((pedido as Record<string, unknown>)[k] ?? null)),
    ) as CamposPedido
    if (Object.keys(mudados).length === 0) return aoFechar()
    setSalvando(true)
    try {
      await atualizarPedido(pedido.id, mudados)
      // Frete trocado depois do pagamento fica no histórico (o que a cliente pagou não muda).
      if ("frete_tipo" in mudados || "frete_custo" in mudados) {
        const tipo = mudados.frete_tipo !== undefined ? `${pedido.frete_tipo ?? "—"} → ${mudados.frete_tipo ?? "—"}` : (pedido.frete_tipo ?? "—")
        const valor = mudados.frete_custo !== undefined && mudados.frete_custo != null ? ` · custo ${reais(mudados.frete_custo)}` : ""
        await registrarNota(pedido.id, `Frete alterado: ${tipo}${valor}`).catch(() => {})
      }
      await qc.invalidateQueries({ queryKey: ["pedido", pedido.id] })
      qc.invalidateQueries({ queryKey: ["pedidos"] })
      toast.success("Dados do pedido atualizados")
      aoFechar()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar")
    } finally {
      setSalvando(false)
    }
  }

  const campo = (id: keyof typeof f, rotulo: string, extra?: Partial<React.ComponentProps<typeof Input>>) => (
    <Field>
      <FieldLabel htmlFor={`ed-${id}`}>{rotulo}</FieldLabel>
      <Input id={`ed-${id}`} value={f[id]} onChange={(e) => mudar({ [id]: e.target.value })} {...extra} />
    </Field>
  )

  return (
    <div className="flex flex-col gap-6 pt-2">
      <FieldSet>
        <FieldLegend variant="label" className="text-muted-foreground">Cliente</FieldLegend>
        <FieldGroup className="gap-4">
          {campo("nome", "Nome")}
          <div className="grid gap-4 sm:grid-cols-2">
            {campo("telefone", "Telefone", { inputMode: "tel", onChange: (e) => mudar({ telefone: mascaraTelefone(e.target.value) }) })}
            {campo("cpf", "CPF ou CNPJ", { inputMode: "numeric", onChange: (e) => mudar({ cpf: mascaraDocumento(e.target.value) }) })}
          </div>
          {campo("email", "E-mail", { type: "email", inputMode: "email" })}
        </FieldGroup>
      </FieldSet>

      <FieldSet>
        <FieldLegend variant="label" className="text-muted-foreground">Endereço</FieldLegend>
        <FieldGroup className="gap-4">
          <div className="grid grid-cols-[8rem_1fr] gap-4">
            {campo("cep", "CEP", { inputMode: "numeric", onChange: (e) => mudar({ cep: mascaraCep(e.target.value) }) })}
            {campo("logradouro", "Rua")}
          </div>
          <div className="grid grid-cols-[6rem_1fr] gap-4">
            {campo("numero", "Número")}
            {campo("complemento", "Complemento")}
          </div>
          <div className="grid grid-cols-[1fr_1fr_4.5rem] gap-4">
            {campo("bairro", "Bairro")}
            {campo("cidade", "Cidade")}
            {campo("uf", "UF", { maxLength: 2 })}
          </div>
        </FieldGroup>
      </FieldSet>

      <FieldSet>
        <FieldLegend variant="label" className="text-muted-foreground">Frete</FieldLegend>
        <FieldGroup className="gap-4">
          <ToggleGroup type="single" variant="outline" spacing={1} className="flex-wrap" value={f.frete} onValueChange={(v) => mudar({ frete: v as FreteTipo | "" })}>
            {(Object.keys(ROTULO_FRETE) as FreteTipo[]).map((k) => (
              <ToggleGroupItem key={k} value={k} className={k === "PAC" ? COR_PAC : k === "SEDEX" ? COR_SEDEX : undefined}>
                {ROTULO_FRETE[k]}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <Field>
            <FieldLabel htmlFor="ed-custo">Custo real do frete</FieldLabel>
            <CampoReais id="ed-custo" className="sm:w-48" value={f.custo} onValueChange={(v) => mudar({ custo: v })} />
            <FieldDescription>
              A cliente pagou {reais(pedido.frete_na_conta)} de frete e isso não muda. Se o novo frete custar mais, a Arvenne paga a diferença.
            </FieldDescription>
          </Field>
        </FieldGroup>
      </FieldSet>

      <div className="flex flex-col gap-2 sm:flex-row-reverse">
        <Button size="xl" className="sm:flex-1" disabled={salvando} onClick={() => void salvar()}>
          {salvando && <Spinner />} Salvar
        </Button>
        <Button size="xl" variant="outline" disabled={salvando} onClick={aoFechar}>
          Cancelar
        </Button>
      </div>
    </div>
  )
}

// "Editar" nos dados do pedido: cliente, endereço e frete (tipo e custo real). Valores pagos não mudam aqui.
export default function EditarDadosPedido({ pedido, aberto, aoMudar }: { pedido: PedidoDetalhe; aberto: boolean; aoMudar: (a: boolean) => void }) {
  return (
    <RespDialog aberto={aberto} aoMudar={aoMudar} titulo="Editar dados do pedido" descricao="Cliente, endereço e frete. O que a cliente pagou não muda." medio>
      {aberto && <Formulario key={pedido.id} pedido={pedido} aoFechar={() => aoMudar(false)} />}
    </RespDialog>
  )
}
