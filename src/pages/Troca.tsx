import { useState } from "react"
import { useParams } from "react-router"
import { Check, CircleCheck, HandCoins, MessageCircle, RefreshCw, SearchX, TriangleAlert } from "lucide-react"
import Foto from "@/components/Foto"
import { Button } from "@/components/ui/button"
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { useEscolherTroca, useTrocaPublica } from "@/lib/api"
import { reais } from "@/lib/formato"
import { fotoTamanho } from "@/lib/foto"
import type { TrocaPublica } from "@/lib/tipos"
import { cn } from "@/lib/utils"

type Peca = TrocaPublica["pecas"][number]
type Opcao = Peca["opcoes"][number]

// Número da loja (só dígitos) para o link do WhatsApp. Sem ele, o botão não aparece.
const WHATSAPP_LOJA = ((import.meta.env.VITE_WHATSAPP_LOJA as string | undefined) ?? "").replace(/\D/g, "")

function Situacao({ o }: { o: Opcao }) {
  const texto =
    o.situacao === "paga_diferenca"
      ? `Você paga só mais ${reais(o.diferenca)}`
      : o.situacao === "credito"
        ? `Sobra ${reais(Math.abs(o.diferenca))} de crédito`
        : "Mesmo valor"
  return <div className="text-lg leading-snug font-semibold">{texto}</div>
}

// Página pública (sem login): a cliente escolhe a troca de cada peça em falta.
// Cada toque já grava a escolha daquela peça (sem botão final): é o mais simples e não perde nada se ela sair.
export default function Troca() {
  const { token } = useParams()
  const { data, isLoading, isError, refetch, isFetching } = useTrocaPublica(token)
  const escolher = useEscolherTroca(token)
  const [gravando, setGravando] = useState<string | null>(null) // `${itemId}:${opcaoId|tipo}`

  function escolha(itemId: string, tipo: "opcao" | "credito", opcaoId: string | null) {
    setGravando(`${itemId}:${opcaoId ?? tipo}`)
    escolher.mutate({ itemId, tipo, opcaoId }, { onSettled: () => setGravando(null) })
  }

  const concluida = data?.status === "concluida"
  const cliente = data?.cliente?.trim()
  const pecas = data?.pecas ?? []
  const total = data?.resumo.pecas_total ?? pecas.length
  const respondidas = pecas.filter((p) => p.escolha_tipo).length
  const tudo = total > 0 && respondidas === total
  const dif = data?.resumo.diferenca ?? 0

  const linkWa =
    WHATSAPP_LOJA && data
      ? `https://wa.me/${WHATSAPP_LOJA}?text=${encodeURIComponent(`Olá! Sobre a troca de peças do meu pedido ${data.numero.replace(/^#/, "")}.`)}`
      : null

  return (
    <div className="mx-auto flex min-h-svh w-full max-w-md flex-col gap-4 overflow-x-hidden px-4 pt-3 pb-12">
      <header className="pt-2 text-center font-heading text-lg font-semibold tracking-wide">Arvenne</header>
      {isLoading ? (
        <div className="flex flex-col gap-4" role="status" aria-label="Carregando">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="aspect-square w-full" />
        </div>
      ) : isError ? (
        <div role="alert" className="flex flex-col items-center gap-3 rounded-xl bg-destructive/10 p-4 text-center text-sm text-destructive">
          <TriangleAlert className="size-5" />
          Não foi possível carregar agora. Verifique a internet e tente de novo.
          <Button variant="outline" className="h-11 bg-background text-foreground" disabled={isFetching} onClick={() => refetch()}>
            {isFetching ? <Spinner /> : <RefreshCw />} Tentar de novo
          </Button>
        </div>
      ) : !data ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <SearchX />
            </EmptyMedia>
            <EmptyTitle>Troca não encontrada</EmptyTitle>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          <div className="flex flex-col gap-1.5">
            {cliente && <h1 className="font-heading text-xl font-semibold">Olá, {cliente}.</h1>}
            <p className="text-base text-muted-foreground">
              {total === 1 ? "Uma peça" : `${total} peças`} do seu pedido {data.numero.replace(/^#/, "")}{" "}
              {total === 1 ? "ficou" : "ficaram"} sem estoque. Escolha o que prefere para {total === 1 ? "ela" : "cada uma"}.
            </p>
            {!concluida && total > 1 && (
              <p className="text-sm text-muted-foreground tabular-nums">
                {respondidas} de {total} escolhidas
              </p>
            )}
          </div>

          {pecas.map((p, n) => {
            const feita = concluida || p.concluida
            return (
              <section key={p.item_id} className="flex flex-col gap-3" aria-label={`Peça ${n + 1}`}>
                <div className="flex flex-col gap-3 rounded-xl bg-card p-4 ring-1 ring-border">
                  <div className="text-sm text-muted-foreground">{total > 1 ? `Peça ${n + 1} de ${total} sem estoque` : "Peça sem estoque"}</div>
                  <Foto url={fotoTamanho(p.foto_url, 600)} alt={p.nome} ampliar className="w-full" />
                  <div className="flex flex-col gap-0.5">
                    <div className="text-base leading-snug font-medium">{p.nome}</div>
                    {p.variante && <div className="text-sm text-muted-foreground">{p.variante}</div>}
                    {p.sku && <div className="font-mono text-xs text-muted-foreground">{p.sku}</div>}
                    <div className="pt-1 text-sm tabular-nums">Você pagou {reais(p.valor_pago)} por ela</div>
                  </div>
                </div>

                {feita ? (
                  <div className="flex items-center gap-2 rounded-xl border border-emerald-600/40 bg-emerald-50 p-3 text-sm font-medium text-emerald-950 dark:bg-emerald-950/30 dark:text-emerald-50">
                    <CircleCheck className="size-5 shrink-0 text-emerald-600" /> Troca desta peça confirmada
                  </div>
                ) : (
                  <>
                    {p.opcoes.length > 0 && <h2 className="font-heading text-lg font-semibold">Escolha uma opção</h2>}
                    <ul className="flex flex-col gap-4">
                      {p.opcoes.map((o) => {
                        const selecionada = p.escolha_tipo === "opcao" && p.escolha_opcao_id === o.id
                        const carregando = gravando === `${p.item_id}:${o.id}`
                        return (
                          <li
                            key={o.id}
                            className={cn(
                              "flex flex-col gap-3 rounded-xl bg-card p-4 ring-1 ring-border transition-shadow",
                              selecionada && "ring-2 ring-emerald-600",
                            )}
                          >
                            <div className="relative">
                              <Foto url={fotoTamanho(o.foto_url, 600)} alt={o.nome} ampliar className="w-full" />
                              {selecionada && (
                                <span className="pointer-events-none absolute top-2 right-2 flex size-8 items-center justify-center rounded-full bg-emerald-600 text-white shadow">
                                  <Check className="size-5" />
                                </span>
                              )}
                            </div>
                            <div className="flex flex-col gap-0.5">
                              <div className="text-base leading-snug font-medium">{o.nome}</div>
                              {o.variante && <div className="text-sm text-muted-foreground">{o.variante}</div>}
                              {o.sku && <div className="font-mono text-xs text-muted-foreground">{o.sku}</div>}
                              <div className="pt-1 text-sm text-muted-foreground tabular-nums">Valor da peça {reais(o.valor)}</div>
                            </div>
                            <Situacao o={o} />
                            <Button
                              type="button"
                              size="lg"
                              variant={selecionada ? "secondary" : "default"}
                              className="h-11 w-full text-base"
                              disabled={selecionada || escolher.isPending}
                              onClick={() => escolha(p.item_id, "opcao", o.id)}
                            >
                              {carregando ? <Spinner /> : selecionada ? <Check /> : null}
                              {selecionada ? "Escolhida" : "Quero esta"}
                            </Button>
                          </li>
                        )
                      })}
                    </ul>
                    <Button
                      type="button"
                      size="lg"
                      variant="outline"
                      className={cn("h-11 w-full text-base", p.escolha_tipo === "credito" && "ring-2 ring-emerald-600")}
                      disabled={p.escolha_tipo === "credito" || escolher.isPending}
                      onClick={() => escolha(p.item_id, "credito", null)}
                    >
                      {gravando === `${p.item_id}:credito` ? <Spinner /> : p.escolha_tipo === "credito" ? <Check /> : <HandCoins />}
                      Prefiro crédito de {reais(p.valor_pago)}
                    </Button>
                  </>
                )}
              </section>
            )
          })}

          <section className="flex flex-col gap-2 rounded-xl bg-muted/50 p-4" aria-label="Resumo">
            <h2 className="font-heading text-lg font-semibold">Resumo</h2>
            <div className="text-sm tabular-nums">Você pagou {reais(data.resumo.total_pago)} nas peças que faltaram.</div>
            {respondidas > 0 && (
              <div className="text-sm font-medium tabular-nums">
                Com as suas escolhas:{" "}
                {dif > 0 ? `você paga mais ${reais(dif)}` : dif < 0 ? `fica ${reais(-dif)} de crédito` : "sem diferença a pagar"}.
              </div>
            )}
            {concluida ? (
              <div className="flex items-start gap-2 pt-1 text-sm font-medium">
                <CircleCheck className="mt-0.5 size-4 shrink-0 text-emerald-600" /> Troca concluída. Obrigada!
              </div>
            ) : tudo ? (
              <div className="flex items-start gap-2 pt-1 text-sm font-medium">
                <CircleCheck className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                <span>Recebemos todas as suas escolhas. Se mudar de ideia, é só escolher outra opção acima.</span>
              </div>
            ) : (
              <div className="pt-1 text-sm text-muted-foreground">
                Faltam {total - respondidas} {total - respondidas === 1 ? "peça" : "peças"} para escolher. Cada toque já fica salvo.
              </div>
            )}
          </section>

          {linkWa && (
            <Button asChild size="lg" variant="outline" className="h-11 w-full text-base">
              <a href={linkWa} target="_blank" rel="noopener noreferrer">
                <MessageCircle />
                Falar no WhatsApp
              </a>
            </Button>
          )}
        </>
      )}
    </div>
  )
}
