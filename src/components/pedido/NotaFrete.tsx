import { useState, type ReactNode } from "react"
import { Check, ChevronDown, Copy, ExternalLink, FileText, Store, TriangleAlert, Truck } from "lucide-react"
import Foto from "@/components/Foto"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import type { CamposPedido, PedidoDetalhe } from "@/lib/api"
import { copiar } from "@/lib/copiar"
import { digitos, lerNumero, mascaraCep, mascaraDocumento, numeroParaTexto, quando, reais } from "@/lib/formato"
import { vivas } from "@/lib/etapa"
import { cn } from "@/lib/utils"
import CampoSalvo from "./CampoSalvo"

const LINK_OLIST = import.meta.env.VITE_URL_OLIST as string | undefined
const LINK_BLING = import.meta.env.VITE_URL_BLING as string | undefined

type Patch = (campos: CamposPedido) => void
type Props = { pedido: PedidoDetalhe; patch: Patch; aoConcluir: () => void }

type Dado = { rotulo: string; valor: string | null }

// Linha "rótulo, valor, copiar". Sem valor, mostra o que falta.
function LinhaDado({ rotulo, valor }: Dado) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-2 border-b py-1 last:border-b-0 sm:min-h-9">
      <div className="min-w-0">
        <div className="text-xs text-muted-foreground">{rotulo}</div>
        {valor ? <div className="text-sm font-medium break-words tabular-nums">{valor}</div> : <div className="text-sm text-destructive">faltando</div>}
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="size-11 shrink-0 sm:size-8"
        aria-label={`Copiar ${rotulo}`}
        disabled={!valor}
        onClick={() => valor && copiar(valor, `${rotulo} copiado`)}
      >
        <Copy />
      </Button>
    </div>
  )
}

function CopiarTudo({ dados }: { dados: Dado[] }) {
  return (
    <Button
      variant="outline"
      className="h-11 w-full sm:h-8 sm:w-fit"
      onClick={() => copiar(dados.map((d) => `${d.rotulo}: ${d.valor ?? ""}`).join("\n"), "Dados copiados")}
    >
      <Copy /> Copiar tudo
    </Button>
  )
}

function Passo({
  numero, icone, titulo, feito, feitoEm, children,
}: { numero: number; icone: ReactNode; titulo: string; feito: boolean; feitoEm: string | null; children: ReactNode }) {
  return (
    <Card size="sm" className={cn(feito && "ring-primary/40")}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <span
            className={cn(
              "flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold tabular-nums",
              feito ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
            )}
          >
            {feito ? <Check className="size-4" /> : numero}
          </span>
          <span className="flex items-center gap-1.5 [&_svg]:size-4">
            {icone} {titulo}
          </span>
          <Badge variant={feito ? "default" : "outline"} className="ml-auto">
            {feito && feitoEm ? quando(feitoEm) : "Pendente"}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">{children}</CardContent>
    </Card>
  )
}

// Dado que a nota ou o frete precisam e o pedido não trouxe: preenche ali mesmo e grava no pedido.
function Faltando({ pedido, patch }: { pedido: PedidoDetalhe; patch: Patch }) {
  const campos: { chave: keyof CamposPedido; rotulo: string; mascara?: (t: string) => string; limpar?: (t: string) => string }[] = [
    { chave: "cliente_nome", rotulo: "Nome ou razão social" },
    { chave: "cliente_cpf", rotulo: "CPF ou CNPJ", mascara: mascaraDocumento, limpar: digitos },
    { chave: "entrega_cep", rotulo: "CEP", mascara: mascaraCep, limpar: digitos },
    { chave: "entrega_logradouro", rotulo: "Rua" },
    { chave: "entrega_numero", rotulo: "Número" },
    { chave: "entrega_bairro", rotulo: "Bairro" },
    { chave: "entrega_cidade", rotulo: "Cidade" },
    { chave: "entrega_uf", rotulo: "UF" },
  ]
  const faltam = campos.filter((c) => !pedido[c.chave as keyof PedidoDetalhe])
  if (faltam.length === 0) return null
  return (
    <Alert variant="destructive">
      <TriangleAlert />
      <AlertTitle>Faltam dados do pedido</AlertTitle>
      <AlertDescription className="mt-2 grid gap-2 sm:grid-cols-2">
        {faltam.map((c) => (
          <CampoSalvo
            key={c.chave}
            id={`falta-${c.chave}`}
            rotulo={c.rotulo}
            valor={null}
            mascara={c.mascara}
            aoSalvar={(v) => v && patch({ [c.chave]: c.chave === "entrega_uf" ? v.toUpperCase() : (c.limpar ? c.limpar(v) : v) } as CamposPedido)}
          />
        ))}
      </AlertDescription>
    </Alert>
  )
}

export default function NotaFrete({ pedido, patch, aoConcluir }: Props) {
  const [pecasAbertas, setPecasAbertas] = useState(false)
  const itens = vivas(pedido.pedido_itens)
  const ruaNumero = [pedido.entrega_logradouro, pedido.entrega_numero].filter(Boolean).join(", ")
  const endereco = [
    [ruaNumero, pedido.entrega_complemento].filter(Boolean).join(" - "),
    pedido.entrega_bairro,
    [pedido.entrega_cidade, pedido.entrega_uf].filter(Boolean).join("/"),
  ].filter(Boolean).join(", ")
  const cpf = pedido.cliente_cpf ? mascaraDocumento(pedido.cliente_cpf) : null
  const cep = pedido.entrega_cep ? mascaraCep(pedido.entrega_cep) : null
  const quemPaga = pedido.frete_pago_por === "arvenne" ? "Arvenne paga o frete" : pedido.frete_pago_por === "cliente" ? "Cliente pagou o frete" : null
  const agora = () => new Date().toISOString()

  const dadosNota: Dado[] = [
    { rotulo: "Nome ou razão social", valor: pedido.cliente_nome },
    { rotulo: "CPF/CNPJ", valor: cpf },
    { rotulo: "Endereço", valor: endereco || null },
    { rotulo: "CEP", valor: cep },
    { rotulo: "Valor das peças", valor: reais(pedido.subtotal) },
    ...(pedido.desconto > 0 ? [{ rotulo: pedido.cupom ? `Desconto (${pedido.cupom})` : "Desconto", valor: reais(pedido.desconto) }] : []),
    { rotulo: "Frete cobrado", valor: pedido.frete_cobrado != null ? `${reais(pedido.frete_cobrado)}${quemPaga ? ` (${quemPaga.toLowerCase()})` : ""}` : null },
    { rotulo: "Total", valor: reais(pedido.total) },
  ]

  const dadosFrete: Dado[] = [
    { rotulo: "CEP", valor: cep },
    { rotulo: "Valor das peças (com desconto)", valor: reais(pedido.valor_pecas_com_desconto) },
    { rotulo: "Tipo de envio", valor: pedido.frete_tipo },
    { rotulo: "CPF/CNPJ", valor: cpf },
    { rotulo: "Nome ou razão social", valor: pedido.cliente_nome },
    { rotulo: "Rua", valor: pedido.entrega_logradouro },
    { rotulo: "Número", valor: pedido.entrega_numero },
    { rotulo: "Complemento", valor: pedido.entrega_complemento },
    { rotulo: "Bairro", valor: pedido.entrega_bairro },
    { rotulo: "Cidade", valor: pedido.entrega_cidade },
    { rotulo: "UF", valor: pedido.entrega_uf },
  ]

  const textoSkus = itens.map((i) => `${i.sku ?? i.nome} x${i.qtd}`).join("\n")
  const nf = Boolean(pedido.nf_emitida_em)
  const frete = Boolean(pedido.frete_gerado_em)
  const lr = Boolean(pedido.pedido_fornecedor_em)
  const diferenca = pedido.frete_diferenca

  return (
    <div className="flex flex-col gap-4">
      <Collapsible open={pecasAbertas} onOpenChange={setPecasAbertas}>
        <CollapsibleTrigger asChild>
          <Button variant="outline" className="h-11 w-full justify-between sm:h-9">
            <span>
              Peças do pedido <span className="text-muted-foreground tabular-nums">({pedido.qtd_pecas})</span>
            </span>
            <ChevronDown className={cn("transition-transform", pecasAbertas && "rotate-180")} />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="flex flex-col gap-1.5 pt-2">
          {itens.map((i) => (
            <div key={i.id} className="flex items-center gap-2 rounded-lg border bg-card p-1.5">
              <Foto url={i.foto_url} alt={i.nome} ampliar className="size-10 shrink-0" />
              <div className="min-w-0 flex-1 text-sm leading-tight">
                <div className="font-mono font-semibold">
                  {i.qtd}× {i.sku ?? "sem código"}
                </div>
                <div className="truncate text-xs text-muted-foreground">{[i.nome, i.variante].filter(Boolean).join(" · ")}</div>
              </div>
              <div className="shrink-0 text-sm tabular-nums">{reais(i.preco)}</div>
            </div>
          ))}
        </CollapsibleContent>
      </Collapsible>

      <Passo numero={1} icone={<FileText />} titulo="Nota fiscal" feito={nf} feitoEm={pedido.nf_emitida_em}>
        <Faltando pedido={pedido} patch={patch} />
        <div className="flex flex-col">
          {dadosNota.map((d) => (
            <LinhaDado key={d.rotulo} {...d} />
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <CopiarTudo dados={dadosNota} />
          {LINK_BLING && (
            <Button variant="outline" className="h-11 sm:h-8" asChild>
              <a href={LINK_BLING} target="_blank" rel="noreferrer">
                <ExternalLink /> Abrir Bling
              </a>
            </Button>
          )}
          {LINK_OLIST && (
            <Button variant="outline" className="h-11 sm:h-8" asChild>
              <a href={LINK_OLIST} target="_blank" rel="noreferrer">
                <ExternalLink /> Abrir Olist
              </a>
            </Button>
          )}
        </div>
        <CampoSalvo id="nf" rotulo="Nº da nota (opcional)" valor={pedido.nf_numero} aoSalvar={(v) => patch({ nf_numero: v })} />
        {nf ? (
          <Button variant="ghost" className="h-11 w-fit sm:h-8" onClick={() => patch({ nf_emitida_em: null })}>
            Desfazer nota emitida
          </Button>
        ) : (
          <Button className="h-11 w-full text-base" onClick={() => patch({ nf_emitida_em: agora() })}>
            <Check /> Nota emitida
          </Button>
        )}
      </Passo>

      <Passo numero={2} icone={<Truck />} titulo="Frete" feito={frete} feitoEm={pedido.frete_gerado_em}>
        <Faltando pedido={pedido} patch={patch} />
        <div className="flex flex-col">
          {dadosFrete.map((d) => (
            <LinhaDado key={d.rotulo} {...d} />
          ))}
        </div>
        <CopiarTudo dados={dadosFrete} />

        <div className="grid gap-3 sm:grid-cols-2">
          <CampoSalvo
            id="frete-custo"
            rotulo="Valor cobrado pela Frenet (R$)"
            valor={numeroParaTexto(pedido.frete_custo) || null}
            inputMode="decimal"
            aoSalvar={(v) => patch({ frete_custo: v == null ? null : lerNumero(v) })}
          />
          <CampoSalvo id="frete-servico" rotulo="Serviço escolhido" valor={pedido.frete_servico} aoSalvar={(v) => patch({ frete_servico: v })} />
        </div>
        {pedido.frete_custo != null && (
          <p className="text-sm tabular-nums">
            Cliente pagou {reais(pedido.frete_na_conta)} · Frenet cobrou {reais(pedido.frete_custo)} ·{" "}
            <span className={cn("font-semibold", diferenca != null && diferenca < 0 && "text-destructive")}>
              diferença {reais(diferenca)}
            </span>
          </p>
        )}
        <CampoSalvo
          id="frete-link"
          rotulo="Link de rastreio (opcional)"
          valor={pedido.rastreio_url}
          inputMode="url"
          aoSalvar={(v) => patch({ rastreio_url: v })}
        />
        {frete ? (
          <Button variant="ghost" className="h-11 w-fit sm:h-8" onClick={() => patch({ frete_gerado_em: null })}>
            Desfazer frete gerado
          </Button>
        ) : (
          <Button className="h-11 w-full text-base" onClick={() => patch({ frete_gerado_em: agora() })}>
            <Check /> Frete gerado
          </Button>
        )}
      </Passo>

      <Passo numero={3} icone={<Store />} titulo="Pedido de venda LR (fornecedor)" feito={lr} feitoEm={pedido.pedido_fornecedor_em}>
        <ul className="flex flex-col gap-1 text-sm">
          {itens.map((i) => (
            <li key={i.id} className="flex gap-2 tabular-nums">
              <span className="w-8 shrink-0 text-right font-semibold">{i.qtd}×</span>
              <span className="font-mono">{i.sku ?? i.nome}</span>
            </li>
          ))}
        </ul>
        <Button variant="outline" className="h-11 w-full sm:h-8 sm:w-fit" onClick={() => copiar(textoSkus, "SKUs copiados")}>
          <Copy /> Copiar SKUs
        </Button>
        <CampoSalvo
          id="lr-numero"
          rotulo="Nº do pedido LR"
          valor={pedido.pedido_fornecedor_numero}
          aoSalvar={(v) => patch({ pedido_fornecedor_numero: v })}
        />
        {lr ? (
          <Button variant="ghost" className="h-11 w-fit sm:h-8" onClick={() => patch({ pedido_fornecedor_em: null })}>
            Desfazer pedido LR feito
          </Button>
        ) : (
          <Button className="h-11 w-full text-base" onClick={() => patch({ pedido_fornecedor_em: agora() })}>
            <Check /> Pedido LR feito
          </Button>
        )}
      </Passo>

      <Button className="h-11 w-full text-base" disabled={!(nf && frete && lr)} onClick={aoConcluir}>
        Concluir nota e frete
      </Button>
    </div>
  )
}
