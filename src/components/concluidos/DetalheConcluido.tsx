import { useState } from "react"
import { Link } from "react-router"
import { CircleAlert, ExternalLink } from "lucide-react"
import { LinhaPeca } from "@/components/comum/Peca"
import { TituloSecao } from "@/components/comum/TituloSecao"
import { ListaOcorrencias } from "@/components/pedido/CartaoOcorrencias"
import { OrigemBadge } from "@/components/StatusBadge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import { useIsMobile } from "@/hooks/use-mobile"
import { useDetalheConcluido, useEquipe, useOcorrencias, type DetalheConcluido as Detalhe, type PedidoConcluido } from "@/lib/api"
import { quando } from "@/lib/formato"
import { quemDoEmail } from "@/lib/historico"
import { passosTrabalhoDe } from "@/lib/status"
import type { Membro } from "@/lib/tipos"
import ProblemaEntregaDialog from "./ProblemaEntregaDialog"

// Passagens do banco que valem como cada etapa da tela (a etapa antiga "novo" é a Separação; "frete", a Embalagem).
const EQUIVALENTES: Record<string, string[]> = { separacao: ["separacao", "novo"], embalagem: ["embalagem", "frete"] }

// Quem fez a etapa e quando saiu dela: o responsável da etapa no pedido; sem ele, quem fez a saída (e-mail do histórico).
function linhaDaEtapa(etapa: string, d: Detalhe, equipe: Membro[]) {
  const passagens = d.passagens.filter((p) => (EQUIVALENTES[etapa] ?? [etapa]).includes(p.etapa) && p.saiu_em)
  const ultima = passagens.at(-1)
  const id = d.responsaveis[etapa]
  const doEmail = ultima?.saiu_por ? equipe.find((m) => m.email?.trim().toLowerCase() === ultima.saiu_por!.trim().toLowerCase()) : undefined
  // Autor mais comum entre as peças (separação, conferência, bipagem), quando a etapa não tinha responsável.
  const campo = ({ separacao: "separado_por", conferencia: "conferido_por", bipagem: "bipado_por" } as const)[etapa as "separacao"]
  const contagem = new Map<string, number>()
  if (campo) for (const i of d.itens) if (i[campo]) contagem.set(i[campo]!, (contagem.get(i[campo]!) ?? 0) + 1)
  const dasPecas = [...contagem].sort((x, y) => y[1] - x[1])[0]?.[0]
  const saiuPor = ultima?.saiu_por && ultima.saiu_por !== "sistema" ? ultima.saiu_por : null
  const nome = equipe.find((m) => m.id === id)?.nome ?? equipe.find((m) => m.id === dasPecas)?.nome ?? doEmail?.nome ?? (saiuPor ? quemDoEmail(saiuPor) : null)
  return { nome, quando: ultima?.saiu_em ?? null }
}

function Conteudo({ p, aoRegistrar }: { p: PedidoConcluido; aoRegistrar: () => void }) {
  const detalhe = useDetalheConcluido(p.id)
  const ocorrencias = useOcorrencias(p.id)
  const equipe = useEquipe().data ?? []
  const nomeDe = (id: string | null) => (id ? (equipe.find((m) => m.id === id)?.nome ?? null) : null)
  const d = detalhe.data
  const lista = ocorrencias.data ?? []
  return (
    <div className="flex flex-col gap-5 px-4 pb-6">
      <section className="flex flex-col gap-2" aria-label="Pedido">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
          <span className="tabular-nums">{p.numero.replace(/^#/, "")}</span>
          <span aria-hidden>·</span>
          <OrigemBadge origem={p.origem} />
          {p.rastreio && (
            <>
              <span aria-hidden>·</span>
              <span className="font-mono break-all">{p.rastreio}</span>
            </>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {p.rastreio_url && (
            <Button variant="outline" size="toque" asChild>
              <a href={p.rastreio_url} target="_blank" rel="noreferrer">
                <ExternalLink /> Abrir rastreio
              </a>
            </Button>
          )}
          <Button variant="outline" size="toque" asChild>
            <Link to={`/pedidos/${p.id}`}>Abrir pedido</Link>
          </Button>
        </div>
      </section>

      {detalhe.isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : !d ? (
        <p className="text-sm text-muted-foreground">Não foi possível carregar os detalhes. Feche e abra de novo.</p>
      ) : (
        <>
          <section className="flex flex-col gap-2" aria-label="Peças">
            <TituloSecao as="h3" contagem={d.itens.length}>
              Peças
            </TituloSecao>
            <div className="flex flex-col gap-1.5">
              {d.itens.map((i) => {
                const feito = [
                  nomeDe(i.separado_por) && `separada por ${nomeDe(i.separado_por)}`,
                  nomeDe(i.conferido_por) && `conferida por ${nomeDe(i.conferido_por)}`,
                  nomeDe(i.bipado_por) && `bipada por ${nomeDe(i.bipado_por)}`,
                ].filter(Boolean)
                return (
                  <LinhaPeca
                    key={i.id}
                    item={{ foto_url: i.foto_url, nome: i.nome, sku: i.sku, variante: i.variante, qtd: i.qtd }}
                    tamanho="md"
                    extra={feito.length > 0 ? <div className="text-xs text-muted-foreground">{feito.join(" · ")}</div> : undefined}
                  />
                )
              })}
            </div>
          </section>

          <section className="flex flex-col gap-2" aria-label="Quem fez">
            <TituloSecao as="h3">Quem fez</TituloSecao>
            <ul className="flex flex-col divide-y rounded-lg border">
              {passosTrabalhoDe(p.origem).map((passo) => {
                const l = linhaDaEtapa(passo.id, d, equipe)
                return (
                  <li key={passo.id} className="flex items-baseline justify-between gap-3 px-3 py-2 text-sm">
                    <span className="text-muted-foreground">{passo.nome}</span>
                    <span className="text-right">
                      <span className="font-medium">{l.nome ?? "Ninguém registrado"}</span>
                      {l.quando && <span className="block text-xs text-muted-foreground tabular-nums">{quando(l.quando)}</span>}
                    </span>
                  </li>
                )
              })}
            </ul>
          </section>
        </>
      )}

      <Separator />

      <section className="flex flex-col gap-3" aria-label="Ocorrências">
        <TituloSecao as="h3" contagem={lista.filter((o) => !o.anulada_em).length}>
          Ocorrências
        </TituloSecao>
        {lista.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum problema registrado neste pedido.</p> : <ListaOcorrencias ocorrencias={lista} pedidoId={p.id} />}
        <Button variant="outline" size="xl" onClick={aoRegistrar} disabled={!d}>
          <CircleAlert /> Registrar problema na entrega
        </Button>
      </section>
    </div>
  )
}

// Sheet do pedido concluído: de baixo no celular, do lado no PC. Peças, quem fez cada etapa, ocorrências e o registro de
// problema na entrega. Sem valores em dinheiro.
export default function DetalheConcluido({ p, aberto, aoMudar }: { p: PedidoConcluido; aberto: boolean; aoMudar: (aberto: boolean) => void }) {
  const celular = useIsMobile()
  const [registrando, setRegistrando] = useState(false)
  const detalhe = useDetalheConcluido(aberto ? p.id : undefined)
  return (
    <>
      <Sheet open={aberto} onOpenChange={aoMudar}>
        <SheetContent side={celular ? "bottom" : "right"} className="overflow-y-auto data-[side=bottom]:max-h-[92svh] sm:max-w-lg">
          <SheetHeader className="pr-12">
            <SheetTitle>{p.cliente_nome ?? "Sem nome"}</SheetTitle>
            <SheetDescription>Pedido concluído: peças, quem fez cada etapa e problemas na entrega.</SheetDescription>
          </SheetHeader>
          {aberto && <Conteudo p={p} aoRegistrar={() => setRegistrando(true)} />}
        </SheetContent>
      </Sheet>
      <ProblemaEntregaDialog pedidoId={p.id} origem={p.origem} itens={detalhe.data?.itens ?? []} aberto={registrando} aoMudar={setRegistrando} />
    </>
  )
}
