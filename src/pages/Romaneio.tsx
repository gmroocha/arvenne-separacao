import { useEffect, useMemo, useRef, useState } from "react"
import { useParams } from "react-router"
import { ChevronUp, RefreshCw, SearchX, TriangleAlert } from "lucide-react"
import CarrosselPecas from "@/components/comum/CarrosselPecas"
import Foto from "@/components/Foto"
import { LinhaValor } from "@/components/comum/LinhaValor"
import { PaginaPublica } from "@/components/comum/PaginaPublica"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { useRomaneio } from "@/lib/api"
import { reais } from "@/lib/formato"
import { fotoTamanho } from "@/lib/foto"
import type { PecaRomaneio, Romaneio } from "@/lib/tipos"
import { cn } from "@/lib/utils"
import { seloRomaneio } from "@/lib/status"

// Peças em cartões com a foto em destaque. O cartão inteiro abre o carrossel na peça tocada.
function GradePecas({ pecas, inicio, aoAbrir }: { pecas: PecaRomaneio[]; inicio: number; aoAbrir: (n: number) => void }) {
  return (
    <ul className="grid grid-cols-2 gap-3">
      {pecas.map((i, n) => (
        <li key={n} className="flex">
          <button
            type="button"
            onClick={() => aoAbrir(inicio + n)}
            aria-label={`Ver ${i.sku?.trim() || i.nome}${i.variante ? `, ${i.variante}` : ""}`}
            className="flex w-full flex-col gap-2 rounded-xl bg-card p-2 text-left ring-1 ring-foreground/10 transition-colors outline-none hover:bg-muted/50 focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <Foto url={fotoTamanho(i.foto_url, 600)} alt={i.nome} className="w-full" />
            <div className="flex min-w-0 flex-1 flex-col gap-0.5 px-0.5">
              <span className="font-mono text-sm leading-tight font-semibold break-all">{i.sku?.trim() || i.nome}</span>
              {i.variante && <span className="text-sm leading-tight font-medium">{i.variante}</span>}
              <span className="line-clamp-2 text-xs leading-tight text-muted-foreground">{i.nome}</span>
              <span className="mt-auto pt-1 text-sm tabular-nums">
                {i.qtd}
                {i.preco != null ? <span className="font-medium"> × {reais(i.preco)}</span> : i.qtd === 1 ? " peça" : " peças"}
              </span>
            </div>
          </button>
        </li>
      ))}
    </ul>
  )
}

// Resumo preso no rodapé: o total sempre à vista; subtotal, descontos e frete ao tocar (ou no fim da página).
function ResumoFixo({ data, aberto, aoAlternar }: { data: Romaneio; aberto: boolean; aoAlternar: () => void }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-20 border-t bg-background/85 pb-[env(safe-area-inset-bottom)] backdrop-blur-md">
      <div className="mx-auto flex max-w-md flex-col gap-2 px-4 py-3">
        {aberto && (
          <div id="resumo-detalhes" className="flex flex-col gap-1.5 animate-in fade-in duration-200">
            <LinhaValor rotulo="Subtotal" valor={reais(data.subtotal)} />
            {data.desconto > 0 && <LinhaValor rotulo={data.cupom ? `Desconto (cupom ${data.cupom})` : "Desconto"} valor={`− ${reais(data.desconto)}`} />}
            {(data.desconto_pix ?? 0) > 0 && <LinhaValor rotulo="Desconto Pix (10%)" valor={`− ${reais(data.desconto_pix ?? 0)}`} />}
            {data.frete_tipo && (
              <LinhaValor
                rotulo={`Frete ${data.frete_tipo === "retirada" ? "(retirada)" : data.frete_tipo}`}
                valor={data.frete_cobrado > 0 ? reais(data.frete_cobrado) : "Grátis"}
              />
            )}
            {(data.valor_somado ?? 0) > 0 && (
              <>
                <LinhaValor rotulo="Total do pedido" valor={reais(data.total)} />
                <LinhaValor rotulo="Peças adicionais" valor={reais(data.valor_somado)} />
              </>
            )}
            <Separator className="my-1" />
          </div>
        )}
        <button type="button" onClick={aoAlternar} aria-expanded={aberto} aria-controls="resumo-detalhes" className="flex items-center justify-between gap-3 rounded-md text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
          <span className="flex items-center gap-1 text-sm text-muted-foreground">
            {data.valor_somado ? "Total geral" : "Total"}
            <ChevronUp className={cn("size-4 transition-transform", aberto && "rotate-180")} />
          </span>
          <span className="text-2xl font-semibold tabular-nums">{reais(data.valor_somado ? data.total_geral : data.total)}</span>
        </button>
      </div>
    </div>
  )
}

// Página pública (sem login) que a vendedora manda para a cliente. Atualiza sozinha.
export default function Romaneio() {
  const { token } = useParams()
  const { data, isLoading, isError, isFetching, refetch } = useRomaneio(token)
  const selo = data ? seloRomaneio(data.fase, data.status) : null
  const todas = useMemo(() => [...(data?.itens ?? []), ...(data?.adicionais ?? [])], [data])
  const [aberta, setAberta] = useState<number | null>(null)
  const [detalhes, setDetalhes] = useState(false)
  // No fim da página o resumo abre sozinho (como na troca); ao subir, volta a mostrar só o total.
  const fimRef = useRef<HTMLParagraphElement>(null)
  const [noFim, setNoFim] = useState(false)
  useEffect(() => {
    const alvo = fimRef.current
    if (!alvo || typeof IntersectionObserver === "undefined") return
    const obs = new IntersectionObserver(([e]) => setNoFim(e.isIntersecting), { rootMargin: "0px 0px -40px 0px" })
    obs.observe(alvo)
    return () => obs.disconnect()
  }, [data])

  return (
    <PaginaPublica>
      {isLoading ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : isError ? (
        <Alert variant="destructive" className="flex flex-col items-center gap-3 p-4 text-center">
          <TriangleAlert className="size-5" />
          <AlertDescription className="text-destructive">Não foi possível carregar o romaneio. Verifique a internet e tente de novo.</AlertDescription>
          <Button variant="outline" onClick={() => void refetch()} disabled={isFetching}>
            <RefreshCw /> Tentar novamente
          </Button>
        </Alert>
      ) : !data ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <SearchX />
            </EmptyMedia>
            <EmptyTitle>Romaneio não encontrado</EmptyTitle>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-semibold">Pedido {data.numero.replace(/^#/, "")}</h1>
              {selo && <Badge variant={selo.variante}>{selo.texto}</Badge>}
            </div>
            {data.cliente && !data.cliente.includes("@") && <p className="text-base text-muted-foreground">Olá, {data.cliente}</p>}
          </div>

          {data.somada_a && (
            <p className="rounded-lg bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
              Estas peças foram somadas ao pedido {data.somada_a.replace(/^#/, "")} e vão no mesmo pacote.
            </p>
          )}

          <GradePecas pecas={data.itens} inicio={0} aoAbrir={setAberta} />

          {(data.adicionais?.length ?? 0) > 0 && (
            <>
              <Separator />
              <h2 className="text-sm font-semibold">Peças adicionais</h2>
              <GradePecas pecas={data.adicionais!} inicio={data.itens.length} aoAbrir={setAberta} />
            </>
          )}

          <p ref={fimRef} className="text-center text-sm text-muted-foreground">
            Dúvidas? Responda no WhatsApp.
          </p>
          {/* Espaço para a barra do resumo, que fica presa no rodapé. */}
          <div aria-hidden className="h-40" />
          <ResumoFixo data={data} aberto={detalhes || noFim} aoAlternar={() => setDetalhes((d) => !d)} />
          <CarrosselPecas pecas={todas} aberta={aberta} aoFechar={() => setAberta(null)} />
        </>
      )}
    </PaginaPublica>
  )
}
