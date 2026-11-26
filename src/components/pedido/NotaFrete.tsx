import { useEffect, useRef, useState, type ReactNode } from "react"
import { toast } from "sonner"
import { Check, ChevronDown, Copy, ExternalLink, FileText, StickyNote, Store, TriangleAlert } from "lucide-react"
import CampoReais from "@/components/CampoReais"
import GerarNoBling from "@/components/bling/GerarNoBling"
import type { LinhaInicial } from "@/components/bling/MontarPedidoLr"
import { LinhaPeca } from "@/components/comum/Peca"
import Foto from "@/components/Foto"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Textarea } from "@/components/ui/textarea"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { MarcaCheck } from "@/components/comum/Bolha"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import type { CamposPedido, PedidoDetalhe } from "@/lib/api"
import { buscarCnpj } from "@/lib/cnpj"
import { avisoChaveNota, chaveNotaValida, formatarChaveNota, limparChaveNota } from "@/lib/chaveNota"
import { copiar } from "@/lib/copiar"
import { COR_PAC, COR_SEDEX } from "@/lib/selo"
import { digitos, mascaraCep, mascaraDocumento, numeroParaTexto, quando, reais } from "@/lib/formato"
import { cn } from "@/lib/utils"
import CampoSalvo from "./CampoSalvo"

const LINK_OLIST = import.meta.env.VITE_URL_OLIST as string | undefined
const LINK_BLING = import.meta.env.VITE_URL_BLING as string | undefined

export type Patch = (campos: CamposPedido) => void
type Props = { pedido: PedidoDetalhe; patch: Patch }

// `copia`: o que vai para a área de transferência quando é diferente do que aparece (ex.: a chave da nota, mostrada em
// grupos de 4 e copiada só com os números).
export type Dado = { rotulo: string; valor: string | null; copia?: string }

// Linha "rótulo, valor, copiar". Sem valor, mostra o que falta.
export function LinhaDado({ rotulo, valor, copia }: Dado) {
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
        onClick={() => valor && copiar(copia ?? valor, `${rotulo} copiado`)}
      >
        <Copy />
      </Button>
    </div>
  )
}

// Chave de acesso da nota (44 números, opcional). Aceita colar com espaços e pontos; mostra em grupos de 4 para conferir.
// Só grava com 44 números (ou vazia, para apagar); com outro tamanho avisa e não grava.
function CampoChaveNota({ chave, patch }: { chave: string | null; patch: Patch }) {
  const [v, setV] = useState(formatarChaveNota(chave))
  const aviso = avisoChaveNota(v)
  const salvar = () => {
    const limpa = limparChaveNota(v)
    if (limpa === "" && chave) patch({ nf_chave: null })
    else if (chaveNotaValida(limpa) && limpa !== chave) patch({ nf_chave: limpa })
  }
  return (
    <Field>
      <FieldLabel htmlFor="nf-chave">Chave de acesso (44 números, opcional)</FieldLabel>
      <Textarea
        id="nf-chave"
        className="min-h-0 resize-none font-mono md:text-sm"
        rows={2}
        value={v}
        inputMode="numeric"
        autoComplete="off"
        aria-invalid={aviso ? true : undefined}
        aria-describedby="nf-chave-ajuda"
        onChange={(e) => setV(formatarChaveNota(e.target.value))}
        onBlur={salvar}
        onKeyDown={(e) => {
          if (e.key !== "Enter") return
          e.preventDefault()
          e.currentTarget.blur()
        }}
      />
      <FieldDescription id="nf-chave-ajuda" className={aviso ? "text-warning" : undefined}>
        {aviso ?? "Cole a chave da nota: os espaços e pontos saem sozinhos."}
      </FieldDescription>
    </Field>
  )
}

// "Frenet cobrou": campo de reais que grava ao sair; vazio limpa, texto ilegível mantém o anterior.
export function FreteCusto({ custo, patch }: { custo: number | null; patch: Patch }) {
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

export function CopiarTudo({ dados }: { dados: Dado[] }) {
  return (
    <Button
      variant="outline"
      size="toque"
      className="w-full sm:w-fit"
      onClick={() => copiar(dados.map((d) => `${d.rotulo}: ${d.copia ?? d.valor ?? ""}`).join("\n"), "Dados copiados")}
    >
      <Copy /> Copiar tudo
    </Button>
  )
}

// Passo da nota fiscal, do pedido LR, da embalagem e do frete. Pendente: aberto. Feito: recolhe, fica verde e mostra "Desfazer"; tocar no
// cabeçalho abre de novo para conferir os dados.
export function Passo({
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

// Dado que a nota ou o frete (etapa Embalagem e frete) precisam e o pedido não trouxe: preenche ali mesmo e grava no pedido.
export function Faltando({ pedido, patch }: { pedido: PedidoDetalhe; patch: Patch }) {
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
      <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
export type Modalidade = keyof typeof COR_MODALIDADE

// PAC ou SEDEX enviado. Mostra o que a cliente escolheu e avisa quando a equipe mandou outro.
export function ModalidadeFrete({
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

// Pedido LR: o que já foi passado para a LR fica marcado (check) neste aparelho, por pedido. Copiar marca sozinho.
// Conveniência de quem digita o pedido: não vai para o banco nem para o histórico.
function useMarcasLr(pedidoId: string) {
  const chave = `lr-marcas:${pedidoId}`
  const [marcas, setMarcas] = useState<Set<string>>(() => {
    try {
      const v = JSON.parse(localStorage.getItem(chave) ?? "[]")
      return new Set(Array.isArray(v) ? v.filter((x) => typeof x === "string") : [])
    } catch {
      return new Set()
    }
  })
  const mudar = (chaves: string[], sim: boolean) =>
    setMarcas((atual) => {
      const novo = new Set(atual)
      for (const c of chaves) {
        if (sim) novo.add(c)
        else novo.delete(c)
      }
      try {
        if (novo.size) localStorage.setItem(chave, JSON.stringify([...novo]))
        else localStorage.removeItem(chave)
      } catch {
        /* sem armazenamento: vale só nesta visita */
      }
      return novo
    })
  return { marcas, mudar }
}

// Botões "copiar código" e "copiar quantidade" de uma linha do pedido LR; os dois marcam a linha.
function CopiarLr({ codigo, qtd, aoCopiar }: { codigo: string; qtd: number; aoCopiar: () => void }) {
  return (
    <>
      <Button variant="ghost" size="icon-toque" className="shrink-0" aria-label={`Copiar código ${codigo}`} onClick={() => { copiar(codigo, "Código copiado"); aoCopiar() }}>
        <Copy />
      </Button>
      <Button variant="ghost" size="toque" className="shrink-0 px-2" aria-label={`Copiar quantidade de ${codigo}`} onClick={() => { copiar(String(qtd), "Quantidade copiada"); aoCopiar() }}>
        <Copy /> {qtd}
      </Button>
    </>
  )
}

// Nota fiscal e pedido LR: quando os dois estão feitos o pedido vai sozinho para a Embalagem e frete (o banco avança).
export default function NotaFrete({ pedido, patch }: Props) {
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
        ...(pedido.desconto_pix > 0 ? [{ rotulo: "Parte 1 – pedido: desconto Pix", valor: reais(pedido.desconto_pix) }] : []),
        { rotulo: "Parte 1 – pedido: frete cobrado", valor: pedido.frete_cobrado != null ? `${reais(pedido.frete_cobrado)}${quemPaga ? ` (${quemPaga.toLowerCase()})` : ""}` : null },
        { rotulo: "Parte 1 – pedido: total", valor: reais(pedido.total) },
        ...partes.map((p, n) => ({ rotulo: `Parte ${n + 2} – venda ${p.numero}: ${p.qtd_pecas} ${p.qtd_pecas === 1 ? "peça" : "peças"}`, valor: reais(p.somada_valor) })),
        { rotulo: "Total da nota", valor: reais(pedido.total_geral) },
        ...(pedido.total_pago != null ? [{ rotulo: "Pago pela cliente", valor: reais(pedido.total_pago) }] : []),
      ]
    : [
        { rotulo: "Valor das peças", valor: reais(pedido.subtotal) },
        ...(pedido.desconto > 0 ? [{ rotulo: pedido.cupom ? `Desconto (${pedido.cupom})` : "Desconto", valor: reais(pedido.desconto) }] : []),
        ...(pedido.desconto_pix > 0 ? [{ rotulo: "Desconto Pix", valor: reais(pedido.desconto_pix) }] : []),
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

  // Pedido LR: peças com nota ficam num bloco separado (uma linha por peça, com o recado); as outras, uma linha por
  // código somando as quantidades. "Copiar SKUs" copia só a lista sem nota.
  const comNota = itens.filter((i) => i.nota)
  const skusLr = [...itens.filter((i) => !i.nota).reduce((m, i) => m.set(i.sku ?? i.nome, (m.get(i.sku ?? i.nome) ?? 0) + i.qtd), new Map<string, number>())]
  // Peças do pedido de venda da LR para o botão "Gerar no Bling": as sem nota somadas por código; as com nota, uma linha cada (com o recado).
  const linhasBling: LinhaInicial[] = [
    ...skusLr.map(([cod, qtd]) => {
      const i = itens.find((x) => !x.nota && (x.sku ?? x.nome) === cod)
      return { sku: i?.sku ?? null, qtd, nome: i?.nome, variante: i?.variante, foto_url: i?.foto_url }
    }),
    ...comNota.map((i) => ({ sku: i.sku, qtd: i.qtd, nome: i.nome, variante: i.variante, foto_url: i.foto_url, nota: i.nota })),
  ]
  const textoSkus = skusLr.map(([sku, qtd]) => `${sku} x${qtd}`).join("\n")
  const { marcas, mudar: marcar } = useMarcasLr(pedido.id)
  const chaveSku = (sku: string) => `s:${sku}`
  const chaveNota = (id: string) => `n:${id}`
  const nf = Boolean(pedido.nf_emitida_em)
  const lr = Boolean(pedido.pedido_fornecedor_em)

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
        <CampoChaveNota key={pedido.nf_chave ?? ""} chave={pedido.nf_chave} patch={patch} />
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

      <Passo numero={2} icone={<Store />} titulo="Pedido de venda LR" feito={lr} feitoEm={pedido.pedido_fornecedor_em} aoDesfazer={() => patch({ pedido_fornecedor_em: null })} textoDesfazer="Desfazer pedido LR feito">
        <GerarNoBling pedidoId={pedido.id} linhas={linhasBling} />
        {comNota.length > 0 && (
          <Alert aria-label="Peças com nota">
            <StickyNote />
            <AlertTitle>Peças com nota ({comNota.length})</AlertTitle>
            <AlertDescription>Separadas da lista: confira o recado de cada uma antes de pedir. Não entram no "Copiar SKUs".</AlertDescription>
            <ul className="col-span-2 mt-2 flex flex-col gap-2" aria-label="Peças com nota do pedido LR">
              {comNota.map((i) => {
                const codigo = i.sku ?? i.nome
                const feito = marcas.has(chaveNota(i.id))
                return (
                  <li key={i.id} className={cn("flex items-start gap-2 rounded-lg bg-muted p-2 transition-colors", feito && "bg-success/10")}>
                    <label className="-m-1 flex size-11 shrink-0 cursor-pointer items-center justify-center">
                      <Checkbox variant="success" checked={feito} aria-label={`${codigo} passado para a LR`} onCheckedChange={(c) => marcar([chaveNota(i.id)], c === true)} />
                    </label>
                    <Foto url={i.foto_url} alt={i.nome} className="size-12 shrink-0 rounded-md" />
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="flex min-w-0 items-center gap-1.5">
                        <span className="min-w-0 truncate font-mono text-sm font-semibold">{i.sku ?? "sem código"}</span>
                        {i.qtd > 1 && <Badge variant="secondary" className="tabular-nums">{i.qtd}×</Badge>}
                      </span>
                      {i.variante && <span className="min-w-0 text-xs break-words text-muted-foreground">{i.variante}</span>}
                      <span className="text-sm font-medium break-words text-foreground">{i.nota}</span>
                      <span className="-ml-2 flex items-center">
                        <CopiarLr codigo={codigo} qtd={i.qtd} aoCopiar={() => marcar([chaveNota(i.id)], true)} />
                      </span>
                    </div>
                  </li>
                )
              })}
            </ul>
          </Alert>
        )}
        {skusLr.length > 0 && (
          <>
            <ul className="flex flex-col" aria-label="Peças do pedido LR">
              {skusLr.map(([sku, qtd]) => {
                const feito = marcas.has(chaveSku(sku))
                return (
                  <li key={sku} className={cn("-mx-2 flex min-h-11 items-center gap-1 rounded-md border-b px-2 py-1 text-sm tabular-nums transition-colors last:border-b-0 sm:min-h-9", feito && "bg-success/10")}>
                    <label className="-ml-2 flex size-11 shrink-0 cursor-pointer items-center justify-center sm:size-9">
                      <Checkbox variant="success" checked={feito} aria-label={`${sku} passado para a LR`} onCheckedChange={(c) => marcar([chaveSku(sku)], c === true)} />
                    </label>
                    <span className="w-8 shrink-0 text-right font-semibold">{qtd}×</span>
                    <span className="min-w-0 flex-1 font-mono break-all">{sku}</span>
                    <CopiarLr codigo={sku} qtd={qtd} aoCopiar={() => marcar([chaveSku(sku)], true)} />
                  </li>
                )
              })}
            </ul>
            <Button
              variant="outline"
              size="toque"
              className="w-full sm:w-fit"
              onClick={() => {
                copiar(textoSkus, "SKUs copiados")
                marcar(skusLr.map(([sku]) => chaveSku(sku)), true)
              }}
            >
              <Copy /> Copiar SKUs
            </Button>
          </>
        )}
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
    </div>
  )
}
