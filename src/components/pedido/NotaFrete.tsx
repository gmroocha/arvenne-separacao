import { useEffect, useRef, useState, type ReactNode } from "react"
import { toast } from "sonner"
import { Check, ChevronDown, Copy, ExternalLink, FileText, Store, TriangleAlert, Truck } from "lucide-react"
import CampoReais from "@/components/CampoReais"
import { ConcluirEtapa } from "@/components/comum/ConcluirEtapa"
import { LinhaPeca } from "@/components/comum/Peca"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldLabel } from "@/components/ui/field"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { MarcaCheck } from "@/components/comum/Bolha"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import type { CamposPedido, PedidoDetalhe } from "@/lib/api"
import { buscarCnpj } from "@/lib/cnpj"
import { copiar } from "@/lib/copiar"
import { COR_PAC, COR_SEDEX } from "@/lib/selo"
import { digitos, mascaraCep, mascaraDocumento, numeroParaTexto, quando, reais } from "@/lib/formato"
import { cn } from "@/lib/utils"
import CampoSalvo from "./CampoSalvo"

const LINK_OLIST = import.meta.env.VITE_URL_OLIST as string | undefined
const LINK_BLING = import.meta.env.VITE_URL_BLING as string | undefined

type Patch = (campos: CamposPedido) => void
type Props = { pedido: PedidoDetalhe; patch: Patch; aoConcluir?: () => void }

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
        size="icon-toque"
        className="shrink-0"
        aria-label={`Copiar ${rotulo}`}
        disabled={!valor}
        onClick={() => valor && copiar(valor, `${rotulo} copiado`)}
      >
        <Copy />
      </Button>
    </div>
  )
}

// "Frenet cobrou": campo de reais que grava ao sair; vazio limpa, texto ilegível mantém o anterior.
function FreteCusto({ custo, patch }: { custo: number | null; patch: Patch }) {
  const [v, setV] = useState(numeroParaTexto(custo))
  return (
    <Field>
      <FieldLabel htmlFor="frete-custo">Frenet cobrou (nosso custo)</FieldLabel>
      <CampoReais
        id="frete-custo"
        className="h-11 md:h-9"
        value={v}
        onValueChange={setV}
        onCommit={(n) => {
          if (n !== custo) patch({ frete_custo: n })
        }}
      />
    </Field>
  )
}

function CopiarTudo({ dados }: { dados: Dado[] }) {
  return (
    <Button
      variant="outline"
      size="toque"
      className="w-full sm:w-fit"
      onClick={() => copiar(dados.map((d) => `${d.rotulo}: ${d.valor ?? ""}`).join("\n"), "Dados copiados")}
    >
      <Copy /> Copiar tudo
    </Button>
  )
}

// Passo da nota e frete. Pendente: aberto. Feito: recolhe, fica verde e mostra "Desfazer"; tocar no
// cabeçalho abre de novo para conferir os dados.
function Passo({
  numero, icone, titulo, feito, feitoEm, aoDesfazer, textoDesfazer, children,
}: {
  numero: number; icone: ReactNode; titulo: string; feito: boolean; feitoEm: string | null
  aoDesfazer: () => void; textoDesfazer: string; children: ReactNode
}) {
  const [aberto, setAberto] = useState(!feito)
  const antes = useRef(feito)
  useEffect(() => {
    if (antes.current !== feito) setAberto(!feito) // marcou: recolhe; desfez: abre
    antes.current = feito
  }, [feito])
  return (
    <Collapsible open={aberto} onOpenChange={setAberto}>
      <Card size="sm" tom={feito ? "success" : undefined}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CollapsibleTrigger asChild>
              <button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left" aria-label={`${titulo}: ${aberto ? "recolher" : "abrir"}`}>
                {feito ? (
                  <MarcaCheck />
                ) : (
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground tabular-nums">{numero}</span>
                )}
                <span className="flex min-w-0 items-center gap-1.5 [&_svg]:size-4">
                  {icone} <span className="truncate">{titulo}</span>
                </span>
                <Badge variant={feito ? "success" : "outline"} className="ml-auto shrink-0">
                  {feito && feitoEm ? quando(feitoEm) : "Pendente"}
                </Badge>
                <ChevronDown className={cn("size-4 shrink-0 transition-transform", aberto && "rotate-180")} />
              </button>
            </CollapsibleTrigger>
          </CardTitle>
        </CardHeader>
        {feito && !aberto && (
          <CardContent>
            <Button variant="ghost" size="toque" className="w-fit" onClick={aoDesfazer}>
              {textoDesfazer}
            </Button>
          </CardContent>
        )}
        <CollapsibleContent>
          <CardContent className="flex flex-col gap-4">{children}</CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
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
  const [situacao, setSituacao] = useState<string | null>(null)
  const faltam = campos.filter((c) => !pedido[c.chave as keyof PedidoDetalhe])
  // 14 dígitos no CPF/CNPJ = CNPJ: grava o documento, a razão social, a IE e o endereço que faltam.
  async function salvarDocumento(v: string | null) {
    const d = digitos(v)
    if (!d) return
    patch({ cliente_cpf: d })
    if (d.length !== 14) return
    try {
      const r = await buscarCnpj(d)
      if (!r) return void toast.error("CNPJ não encontrado")
      setSituacao(r.situacao)
      const e = r.endereco
      const novo: CamposPedido = { cliente_razao_social: r.razao_social }
      if (r.ie && !pedido.cliente_ie) novo.cliente_ie = r.ie
      if (!pedido.cliente_nome) novo.cliente_nome = r.razao_social
      if (!pedido.entrega_cep && e.cep) novo.entrega_cep = e.cep
      if (!pedido.entrega_logradouro && e.logradouro) novo.entrega_logradouro = e.logradouro
      if (!pedido.entrega_numero && e.numero) novo.entrega_numero = e.numero
      if (!pedido.entrega_complemento && e.complemento) novo.entrega_complemento = e.complemento
      if (!pedido.entrega_bairro && e.bairro) novo.entrega_bairro = e.bairro
      if (!pedido.entrega_cidade && e.cidade) novo.entrega_cidade = e.cidade
      if (!pedido.entrega_uf && e.uf) novo.entrega_uf = e.uf
      patch(novo)
    } catch {
      toast.error("Não foi possível consultar o CNPJ")
    }
  }
  const semIe = digitos(pedido.cliente_cpf).length === 14 && !pedido.cliente_ie
  if (faltam.length === 0 && !semIe) return null
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <TriangleAlert className="size-4 text-warning" /> Faltam dados do pedido
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2">
        {faltam.map((c) => (
          <CampoSalvo
            key={c.chave}
            id={`falta-${c.chave}`}
            rotulo={c.rotulo}
            valor={null}
            mascara={c.mascara}
            aoSalvar={(v) =>
              c.chave === "cliente_cpf"
                ? void salvarDocumento(v)
                : v && patch({ [c.chave]: c.chave === "entrega_uf" ? v.toUpperCase() : (c.limpar ? c.limpar(v) : v) } as CamposPedido)
            }
          />
        ))}
        {semIe && (
          <CampoSalvo id="falta-ie" rotulo="Inscrição estadual (opcional)" valor={null} aoSalvar={(v) => v && patch({ cliente_ie: v })} />
        )}
        {situacao && situacao !== "ATIVA" && (
          <p className="flex items-center gap-2 text-sm text-warning sm:col-span-2">
            <TriangleAlert className="size-4 shrink-0" /> Situação cadastral do CNPJ: {situacao.toLowerCase()}
          </p>
        )}
      </CardContent>
    </Card>
  )
}

const COR_MODALIDADE = { PAC: COR_PAC, SEDEX: COR_SEDEX } as const
type Modalidade = keyof typeof COR_MODALIDADE

// PAC ou SEDEX enviado. Mostra o que a cliente escolheu e avisa quando a equipe mandou outro.
function ModalidadeFrete({
  escolhida,
  clientePediu,
  aoEscolher,
}: {
  escolhida: Modalidade | null
  clientePediu: string | null
  aoEscolher: (m: Modalidade) => void
}) {
  const diferente = escolhida && (clientePediu === "PAC" || clientePediu === "SEDEX") && clientePediu !== escolhida
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">Enviado por</span>
      <div className="flex flex-wrap items-center gap-2">
        <ToggleGroup
          type="single"
          variant="outline"
          spacing={1}
          aria-label="Modalidade do frete"
          value={escolhida ?? ""}
          onValueChange={(v) => v && v !== escolhida && aoEscolher(v as Modalidade)}
        >
          {(Object.keys(COR_MODALIDADE) as Modalidade[]).map((m) => (
            <ToggleGroupItem key={m} value={m} className={cn("h-10 min-w-24 px-4", COR_MODALIDADE[m])}>
              {m}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        {clientePediu && (
          <span className="text-sm text-muted-foreground">
            Cliente escolheu {clientePediu === "retirada" ? "retirada" : clientePediu}
          </span>
        )}
      </div>
      {diferente && <span className="text-sm text-warning">Diferente do que a cliente escolheu.</span>}
    </div>
  )
}

export default function NotaFrete({ pedido, patch, aoConcluir }: Props) {
  const [pecasAbertas, setPecasAbertas] = useState(false)
  const itens = pedido.pedido_itens.filter((i) => i.status === "encontrado")
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

  // Vendas somadas ao pedido: a nota sai em partes (pedido + cada venda) e o total da nota é o geral (da view).
  const partes = pedido.partes ?? []
  const valoresNota: Dado[] = partes.length
    ? [
        { rotulo: "Parte 1 – pedido: valor das peças", valor: reais(pedido.subtotal) },
        ...(pedido.desconto > 0 ? [{ rotulo: pedido.cupom ? `Parte 1 – pedido: desconto (${pedido.cupom})` : "Parte 1 – pedido: desconto", valor: reais(pedido.desconto) }] : []),
        { rotulo: "Parte 1 – pedido: frete cobrado", valor: pedido.frete_cobrado != null ? `${reais(pedido.frete_cobrado)}${quemPaga ? ` (${quemPaga.toLowerCase()})` : ""}` : null },
        { rotulo: "Parte 1 – pedido: total", valor: reais(pedido.total) },
        ...partes.map((p, n) => ({ rotulo: `Parte ${n + 2} – venda ${p.numero}: ${p.qtd_pecas} ${p.qtd_pecas === 1 ? "peça" : "peças"}`, valor: reais(p.somada_valor) })),
        { rotulo: "Total da nota", valor: reais(pedido.total_geral) },
      ]
    : [
        { rotulo: "Valor das peças", valor: reais(pedido.subtotal) },
        ...(pedido.desconto > 0 ? [{ rotulo: pedido.cupom ? `Desconto (${pedido.cupom})` : "Desconto", valor: reais(pedido.desconto) }] : []),
        { rotulo: "Frete cobrado", valor: pedido.frete_cobrado != null ? `${reais(pedido.frete_cobrado)}${quemPaga ? ` (${quemPaga.toLowerCase()})` : ""}` : null },
        { rotulo: "Total", valor: reais(pedido.total) },
      ]
  const numeroDaVenda = (id?: string | null) => partes.find((p) => p.id === id)?.numero

  const dadosNota: Dado[] = [
    { rotulo: "Nome ou razão social", valor: pedido.cliente_razao_social ?? pedido.cliente_nome },
    { rotulo: "CPF/CNPJ", valor: cpf },
    ...(pedido.cliente_ie ? [{ rotulo: "Inscrição estadual", valor: pedido.cliente_ie }] : []),
    { rotulo: "Endereço", valor: endereco || null },
    { rotulo: "CEP", valor: cep },
    ...valoresNota,
  ]

  const dadosFrete: Dado[] = [
    { rotulo: "CEP", valor: cep },
    { rotulo: "Valor das peças (com desconto)", valor: reais(pedido.valor_pecas_com_desconto) },
    { rotulo: "Tipo de envio", valor: pedido.frete_tipo },
    { rotulo: "CPF/CNPJ", valor: cpf },
    ...(pedido.cliente_ie ? [{ rotulo: "Inscrição estadual", valor: pedido.cliente_ie }] : []),
    { rotulo: "Nome ou razão social", valor: pedido.cliente_razao_social ?? pedido.cliente_nome },
    { rotulo: "Rua", valor: pedido.entrega_logradouro },
    { rotulo: "Número", valor: pedido.entrega_numero },
    { rotulo: "Complemento", valor: pedido.entrega_complemento },
    { rotulo: "Bairro", valor: pedido.entrega_bairro },
    { rotulo: "Cidade", valor: pedido.entrega_cidade },
    { rotulo: "UF", valor: pedido.entrega_uf },
  ]

  // Pedido LR: uma linha por código, somando as quantidades.
  const skusLr = [...itens.reduce((m, i) => m.set(i.sku ?? i.nome, (m.get(i.sku ?? i.nome) ?? 0) + i.qtd), new Map<string, number>())]
  const textoSkus = skusLr.map(([sku, qtd]) => `${sku} x${qtd}`).join("\n")
  const nf = Boolean(pedido.nf_emitida_em)
  const frete = Boolean(pedido.frete_gerado_em)
  const lr = Boolean(pedido.pedido_fornecedor_em)
  const diferenca = pedido.frete_custo != null ? pedido.frete_diferenca : null
  // Modalidade enviada: a salva ou, enquanto não houver, a que a cliente escolheu (gravada no "Frete gerado").
  const pedida = pedido.frete_tipo === "PAC" || pedido.frete_tipo === "SEDEX" ? pedido.frete_tipo : null
  const servico = pedido.frete_servico === "PAC" || pedido.frete_servico === "SEDEX" ? pedido.frete_servico : pedido.frete_servico ? null : pedida

  return (
    <div className="flex flex-col gap-4">
      <Collapsible open={pecasAbertas} onOpenChange={setPecasAbertas}>
        <CollapsibleTrigger asChild>
          <Button variant="outline" size="xl" className="w-full justify-between lg:h-9 lg:text-sm">
            <span>
              Peças do pedido <span className="text-muted-foreground tabular-nums">({pedido.qtd_pecas})</span>
            </span>
            <ChevronDown className={cn("transition-transform", pecasAbertas && "rotate-180")} />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="flex flex-col gap-1.5 pt-2">
          {itens.map((i) => (
            <LinhaPeca key={i.id} item={i} tamanho="sm">
              <span className="flex flex-col items-end text-sm tabular-nums">
                {reais(i.preco)}
                {i.adicional && numeroDaVenda(i.venda_origem_id) && (
                  <span className="text-xs text-muted-foreground">Venda {numeroDaVenda(i.venda_origem_id)}</span>
                )}
              </span>
            </LinhaPeca>
          ))}
        </CollapsibleContent>
      </Collapsible>

      <Faltando pedido={pedido} patch={patch} />

      <Passo numero={1} icone={<FileText />} titulo="Nota fiscal" feito={nf} feitoEm={pedido.nf_emitida_em} aoDesfazer={() => patch({ nf_emitida_em: null })} textoDesfazer="Desfazer nota emitida">
        <div className="flex flex-col">
          {dadosNota.map((d) => (
            <LinhaDado key={d.rotulo} {...d} />
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <CopiarTudo dados={dadosNota} />
          {LINK_BLING && (
            <Button variant="outline" size="toque" asChild>
              <a href={LINK_BLING} target="_blank" rel="noreferrer">
                <ExternalLink /> Abrir Bling
              </a>
            </Button>
          )}
          {LINK_OLIST && (
            <Button variant="outline" size="toque" asChild>
              <a href={LINK_OLIST} target="_blank" rel="noreferrer">
                <ExternalLink /> Abrir Olist
              </a>
            </Button>
          )}
        </div>
        <CampoSalvo id="nf" rotulo="Nº da nota (opcional)" valor={pedido.nf_numero} aoSalvar={(v) => patch({ nf_numero: v })} />
        {nf ? (
          <Button variant="ghost" size="toque" className="w-fit" onClick={() => patch({ nf_emitida_em: null })}>
            Desfazer nota emitida
          </Button>
        ) : (
          <Button size="xl" className="w-full" onClick={() => patch({ nf_emitida_em: agora() })}>
            <Check /> Nota emitida
          </Button>
        )}
      </Passo>

      <Passo numero={2} icone={<Truck />} titulo="Frete" feito={frete} feitoEm={pedido.frete_gerado_em} aoDesfazer={() => patch({ frete_gerado_em: null })} textoDesfazer="Desfazer frete gerado">
        <div className="flex flex-col">
          {dadosFrete.map((d) => (
            <LinhaDado key={d.rotulo} {...d} />
          ))}
        </div>
        <CopiarTudo dados={dadosFrete} />

        <ModalidadeFrete
          escolhida={servico}
          clientePediu={pedido.frete_tipo}
          aoEscolher={(v) => patch({ frete_servico: v })}
        />

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Cliente pagou de frete</span>
            <div className="flex h-11 items-center rounded-md border bg-muted/40 px-3 text-sm tabular-nums sm:h-9">
              {reais(pedido.frete_na_conta)}
              <span className="ml-1.5 truncate text-muted-foreground">
                {pedido.frete_pago_por === "arvenne" ? "· frete grátis" : pedido.origem === "shopify" ? "· no site" : "· no WhatsApp"}
              </span>
            </div>
          </div>
          <FreteCusto key={pedido.frete_custo ?? ""} custo={pedido.frete_custo} patch={patch} />
        </div>
        {/* Diferença calculada no banco (v_pedidos.frete_diferenca = o que a cliente pagou − custo da Frenet). */}
        {diferenca != null && (
          <p
            className={cn(
              "rounded-md px-3 py-2 text-sm font-medium tabular-nums",
              diferenca < 0 ? "bg-warning/10 text-warning" : "bg-muted text-foreground",
            )}
          >
            {diferenca < 0 ? `A Arvenne cobre ${reais(-diferenca)} de frete` : diferenca > 0 ? `Sobrou ${reais(diferenca)} do frete pago` : "Frete empatado: a cliente pagou o custo"}
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
          <Button variant="ghost" size="toque" className="w-fit" onClick={() => patch({ frete_gerado_em: null })}>
            Desfazer frete gerado
          </Button>
        ) : (
          <Button
            size="xl"
            className="w-full"
            onClick={() => patch({ frete_gerado_em: agora(), ...(!pedido.frete_servico && servico ? { frete_servico: servico } : {}) })}
          >
            <Check /> Frete gerado
          </Button>
        )}
      </Passo>

      <Passo numero={3} icone={<Store />} titulo="Pedido de venda LR (fornecedor)" feito={lr} feitoEm={pedido.pedido_fornecedor_em} aoDesfazer={() => patch({ pedido_fornecedor_em: null })} textoDesfazer="Desfazer pedido LR feito">
        <ul className="flex flex-col gap-1 text-sm">
          {skusLr.map(([sku, qtd]) => (
            <li key={sku} className="flex gap-2 tabular-nums">
              <span className="w-8 shrink-0 text-right font-semibold">{qtd}×</span>
              <span className="font-mono">{sku}</span>
            </li>
          ))}
        </ul>
        <Button variant="outline" size="toque" className="w-full sm:w-fit" onClick={() => copiar(textoSkus, "SKUs copiados")}>
          <Copy /> Copiar SKUs
        </Button>
        <CampoSalvo
          id="lr-numero"
          rotulo="Nº do pedido LR"
          valor={pedido.pedido_fornecedor_numero}
          aoSalvar={(v) => patch({ pedido_fornecedor_numero: v })}
        />
        {lr ? (
          <Button variant="ghost" size="toque" className="w-fit" onClick={() => patch({ pedido_fornecedor_em: null })}>
            Desfazer pedido LR feito
          </Button>
        ) : (
          <Button size="xl" className="w-full" onClick={() => patch({ pedido_fornecedor_em: agora() })}>
            <Check /> Pedido LR feito
          </Button>
        )}
      </Passo>

      {aoConcluir && (
        <ConcluirEtapa disabled={!(nf && frete && lr)} onClick={aoConcluir}>
          Concluir nota e frete
        </ConcluirEtapa>
      )}
    </div>
  )
}
