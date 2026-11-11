import { useState } from "react"
import { useParams } from "react-router"
import { Check, CircleCheck, HandCoins, MessageCircle, RefreshCw, SearchX, TriangleAlert } from "lucide-react"
import Logo from "@/components/Logo"
import Foto from "@/components/Foto"
import { Button } from "@/components/ui/button"
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Separator } from "@/components/ui/separator"
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

function textoOpcao(o: Opcao) {
  return o.situacao === "paga_diferenca"
    ? `Você paga +${reais(o.diferenca)}`
    : o.situacao === "credito"
      ? `Sobra ${reais(Math.abs(o.diferenca))} de crédito`
      : "Mesmo valor"
}

function Linha({ rotulo, children, forte, grande }: { rotulo: string; children: React.ReactNode; forte?: boolean; grande?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-3 ${grande ? "text-2xl font-semibold" : forte ? "text-lg font-semibold" : "text-base"}`}>
      <span className={forte ? "" : "text-muted-foreground"}>{rotulo}</span>
      <span className="tabular-nums">{children}</span>
    </div>
  )
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
    <div className="mx-auto flex min-h-svh w-full max-w-md flex-col gap-5 overflow-x-hidden px-4 pt-3 pb-12">
      <header className="flex justify-center pt-3">
        <Logo className="h-8" />
      </header>
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
          <div className="flex flex-col gap-1">
            <h1 className="text-xl font-semibold">Pedido {data.numero.replace(/^#/, "")}</h1>
            {cliente && <p className="text-base text-muted-foreground">Olá, {cliente}</p>}
          </div>

          <p className="text-base">
            {total === 1 ? "Uma peça" : `${total} peças`} {total === 1 ? "ficou" : "ficaram"} sem estoque. Escolha o que prefere para {total === 1 ? "ela" : "cada uma"}.
          </p>

          <h2 className="text-sm font-semibold">Peças em falta</h2>
          {pecas.map((p, n) => {
            const feita = concluida || p.concluida
            return (
              <section key={p.item_id} className="flex flex-col gap-3" aria-label={`Peça ${n + 1}`}>
                <div className="flex gap-3 rounded-xl border bg-card p-3">
                  <Foto url={fotoTamanho(p.foto_url, 600)} alt={p.nome} ampliar className="size-28 shrink-0" />
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <div className="text-base leading-snug font-medium">{p.nome}</div>
                    {p.variante && <div className="text-sm text-muted-foreground">{p.variante}</div>}
                    {p.sku && <div className="font-mono text-xs text-muted-foreground">{p.sku}</div>}
                    <div className="mt-auto pt-1 text-sm tabular-nums">Você pagou {reais(p.valor_pago)}</div>
                  </div>
                </div>

                {feita ? (
                  <div className="flex items-start gap-2 rounded-xl border border-emerald-600/40 bg-emerald-50 p-3 text-sm font-medium text-emerald-950 dark:bg-emerald-950/30 dark:text-emerald-50">
                    <CircleCheck className="mt-0.5 size-5 shrink-0 text-emerald-600" />
                    <span className="min-w-0">
                      {p.nova ? (
                        <>
                          Troca confirmada: {p.nova.nome}
                          {p.nova.variante ? ` · ${p.nova.variante}` : ""}
                          {p.nova.sku && <span className="block font-mono text-xs font-normal">{p.nova.sku}</span>}
                        </>
                      ) : (
                        `Troca confirmada: crédito de ${reais(p.valor_pago)}`
                      )}
                      {p.escolha_equipe && <span className="block text-xs font-normal">Confirmada pela nossa equipe.</span>}
                    </span>
                  </div>
                ) : (
                  <>
                    {p.opcoes.length > 0 && <h3 className="text-sm font-semibold">Escolha uma opção</h3>}
                    <ul className="flex flex-col gap-2">
                      {p.opcoes.map((o) => {
                        const selecionada = p.escolha_tipo === "opcao" && p.escolha_opcao_id === o.id
                        const carregando = gravando === `${p.item_id}:${o.id}`
                        return (
                          <li key={o.id} className={cn("flex flex-col gap-2 rounded-xl border bg-card p-2.5", selecionada && "border-emerald-600 ring-1 ring-emerald-600")}>
                            <div className="flex gap-3">
                              <Foto url={fotoTamanho(o.foto_url, 300)} alt={o.nome} ampliar className="size-16 shrink-0" />
                              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                                <div className="text-sm leading-snug font-medium">{o.nome}</div>
                                {o.variante && <div className="text-xs text-muted-foreground">{o.variante}</div>}
                                {o.sku && <div className="font-mono text-xs text-muted-foreground">{o.sku}</div>}
                                <div className="text-sm font-semibold tabular-nums">{textoOpcao(o)}</div>
                              </div>
                            </div>
                            <Button
                              type="button"
                              variant={selecionada ? "secondary" : "default"}
                              className="h-10 w-full text-sm"
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
                      variant="outline"
                      className={cn("h-10 w-full text-sm", p.escolha_tipo === "credito" && "ring-2 ring-emerald-600")}
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

          <Separator />
          <section className="flex flex-col gap-1.5" aria-label="Resumo">
            <Linha rotulo="Você pagou nas peças em falta">{reais(data.resumo.total_pago)}</Linha>
            {(respondidas > 0 || concluida) && (
              <>
                <Linha rotulo="Diferença">{dif > 0 ? `+ ${reais(dif)}` : dif < 0 ? `− ${reais(-dif)}` : reais(0)}</Linha>
                <Separator className="my-1" />
                <Linha rotulo={dif > 0 ? "Você paga a mais" : dif < 0 ? "Seu crédito" : "Sem diferença a pagar"} forte grande>
                  {dif !== 0 && reais(Math.abs(dif))}
                </Linha>
              </>
            )}
            <p className="pt-2 text-sm text-muted-foreground">
              {concluida ? (
                <span className="flex items-start gap-2 font-medium text-foreground">
                  <CircleCheck className="mt-0.5 size-4 shrink-0 text-emerald-600" /> Troca concluída. Obrigada!
                </span>
              ) : tudo ? (
                "Recebemos todas as suas escolhas. Se mudar de ideia, é só escolher outra opção acima."
              ) : (
                `Faltam ${total - respondidas} ${total - respondidas === 1 ? "peça" : "peças"} para escolher. Cada toque já fica salvo.`
              )}
            </p>
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
