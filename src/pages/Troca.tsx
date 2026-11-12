import { useState } from "react"
import { useParams } from "react-router"
import { Check, CircleCheck, HandCoins, MessageCircle, PackageX, RefreshCw, SearchX, TriangleAlert } from "lucide-react"
import Foto from "@/components/Foto"
import { BolhaCheck, BolhaContador, MarcaCheck } from "@/components/comum/Bolha"
import { LinhaValor } from "@/components/comum/LinhaValor"
import { PaginaPublica } from "@/components/comum/PaginaPublica"
import { Quantidade } from "@/components/comum/Quantidade"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Progress } from "@/components/ui/progress"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Toggle } from "@/components/ui/toggle"
import { carrinhoDaPeca, useCarrinhoTroca, useEscolherTroca, useTrocaPublica } from "@/lib/api"
import { reais } from "@/lib/formato"
import { fotoTamanho } from "@/lib/foto"
import type { TrocaPublica } from "@/lib/tipos"
import { chaveModelo, numeroTamanho, separarTamanho } from "@/lib/variante"
import { cn } from "@/lib/utils"

type Peca = TrocaPublica["pecas"][number]
type Opcao = Peca["opcoes"][number]

// Número da loja (só dígitos) para o link do WhatsApp. Sem ele, o botão não aparece.
const WHATSAPP_LOJA = ((import.meta.env.VITE_WHATSAPP_LOJA as string | undefined) ?? "").replace(/\D/g, "")

// Diferença da opção em poucas palavras (o valor vem do banco: v_troca_valores).
function seloDiferenca(o: Opcao) {
  if (o.situacao === "paga_diferenca") return `paga + ${reais(o.diferenca)}`
  if (o.situacao === "credito") return `sobra ${reais(Math.abs(o.diferenca))}`
  return "mesmo valor"
}

// Mesmo modelo (mesmo produto, mesma pedra/cor e mesmo valor) em vários TAMANHOS vira um cartão só:
// "ABALONE / N°12" e "ABALONE / N°16" juntam; "MADREPÉROLA / N°16" fica em outro cartão (outra foto).
// Variante sem tamanho (cor, pedra, mm) fica sozinha. Só agrupa; os valores vêm prontos do banco.
function agrupar(opcoes: Opcao[]): Opcao[][] {
  const grupos = new Map<string, Opcao[]>()
  for (const o of opcoes) {
    const chave = separarTamanho(o.variante).tamanho ? `${chaveModelo(o.nome, o.variante)}|${o.valor}|${o.diferenca}` : `id:${o.id}`
    const g = grupos.get(chave)
    if (g) g.push(o)
    else grupos.set(chave, [o])
  }
  return [...grupos.values()].map((g) => [...g].sort((a, b) => numeroTamanho(separarTamanho(a.variante).tamanho) - numeroTamanho(separarTamanho(b.variante).tamanho)))
}

// O código (SKU) é o nome na página: o nome da Shopify é comprido demais.
const titulo = (x: { sku: string | null; nome: string }) => x.sku?.trim() || x.nome

// Código do modelo de um grupo de tamanhos: o começo comum dos SKUs (AN3597-12, AN3597-16 → AN3597).
function codigoModelo(g: Opcao[]) {
  const skus = g.map((o) => o.sku?.trim() ?? "")
  if (skus.some((x) => !x)) return g[0].nome
  let p = skus[0]
  for (const x of skus) while (!x.startsWith(p)) p = p.slice(0, -1)
  p = p.replace(/[-_.\s]+$/, "")
  return p.length >= 3 ? p : g[0].nome
}

const MAX_UNIDADES = 20 // limite do banco por peça

function Preco({ o }: { o: Opcao }) {
  return (
    <div className="mt-auto flex flex-wrap items-center gap-x-2 gap-y-1">
      <span className="text-base font-semibold tabular-nums">{reais(o.valor)}</span>
      <Badge variant="secondary" className="h-5 px-1.5 text-xs font-normal tabular-nums">
        {seloDiferenca(o)}
      </Badge>
    </div>
  )
}

// [−] n [+]: o número já muda na hora; o banco grava em seguida. Aceita 0 (tirar a peça do carrinho).
function Passo({ qtd, aoMudar, cheio, rotulo }: { qtd: number; aoMudar: (n: number) => void; cheio: boolean; rotulo: string }) {
  return (
    <div role="group" aria-label={rotulo}>
      <Quantidade valor={qtd} min={0} max={cheio ? qtd : undefined} aoMudar={aoMudar} rotulo={rotulo} />
    </div>
  )
}

type CartaoProps = {
  o: Opcao
  qtd: number
  // Carrinho vazio: aparece o atalho "Quero esta". Com itens no carrinho, aparece o seletor de quantidade.
  vazio: boolean
  cheio: boolean
  carregando: boolean
  ocupado: boolean
  aoEscolher: () => void
  aoQtd: (n: number) => void
}

function CartaoOpcao({ o, qtd, vazio, cheio, carregando, ocupado, aoEscolher, aoQtd }: CartaoProps) {
  return (
    <li className={cn("relative flex flex-col gap-2.5 rounded-xl bg-card p-3 ring-1 ring-foreground/10", qtd > 0 && "bg-success/5 ring-success/40")}>
      <div className="flex gap-3">
        <div className="relative shrink-0">
          <Foto url={fotoTamanho(o.foto_url, 300)} alt={o.nome} ampliar className="size-16" />
          {qtd > 0 && <BolhaCheck className="pointer-events-none absolute -top-1.5 -right-1.5 ring-2 ring-card" />}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="font-mono text-sm leading-snug font-semibold">{titulo(o)}</div>
          {o.variante && <div className="text-xs text-muted-foreground">{o.variante}</div>}
          <Preco o={o} />
        </div>
      </div>
      {vazio ? (
        <Button type="button" size="xl" className="w-full" disabled={ocupado} onClick={aoEscolher}>
          {carregando ? <Spinner /> : null}
          Quero esta
        </Button>
      ) : (
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-muted-foreground">Quantas?</span>
          <Passo qtd={qtd} aoMudar={aoQtd} cheio={cheio} rotulo={titulo(o)} />
        </div>
      )}
    </li>
  )
}

// Um modelo, vários tamanhos: foto, nome e preço uma vez; cada toque no tamanho coloca mais uma no carrinho.
function CartaoModelo({
  grupo,
  qtds,
  cheio,
  aoQtd,
}: {
  grupo: Opcao[]
  qtds: Record<string, number>
  cheio: boolean
  aoQtd: (opcaoId: string, n: number) => void
}) {
  const marcados = grupo.filter((o) => (qtds[o.id] ?? 0) > 0)
  const base = marcados[0] ?? grupo[0]
  const modelo = separarTamanho(base.variante).base
  return (
    <li className={cn("relative flex flex-col gap-3 rounded-xl bg-card p-3 ring-1 ring-foreground/10", marcados.length > 0 && "bg-success/5 ring-success/40")}>
      <div className="flex gap-3">
        <div className="relative shrink-0">
          <Foto url={fotoTamanho(base.foto_url, 300)} alt={base.nome} ampliar className="size-16" />
          {marcados.length > 0 && <BolhaCheck className="pointer-events-none absolute -top-1.5 -right-1.5 ring-2 ring-card" />}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="font-mono text-sm leading-snug font-semibold">{codigoModelo(grupo)}</div>
          {modelo && <div className="text-xs text-muted-foreground">{modelo}</div>}
          <div className="text-xs text-muted-foreground">{grupo.length} tamanhos disponíveis</div>
          <Preco o={base} />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-xs text-muted-foreground">Toque no tamanho para colocar no carrinho</span>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Tamanhos">
          {grupo.map((o) => {
            const n = qtds[o.id] ?? 0
            const tam = separarTamanho(o.variante).tamanho ?? o.variante ?? o.nome
            return (
              <Toggle
                key={o.id}
                variant="outline"
                size="xl"
                pressed={n > 0}
                aria-label={n > 0 ? `Tamanho ${tam}, ${n} no carrinho. Toque para colocar mais uma` : `Tamanho ${tam}`}
                className="relative min-w-16 tabular-nums"
                disabled={cheio}
                onPressedChange={() => aoQtd(o.id, n + 1)}
              >
                {tam}
                {n > 0 && <BolhaContador n={n} className="absolute -top-2 -right-2 border border-background" />}
              </Toggle>
            )
          })}
        </div>
      </div>
      {marcados.length > 0 && (
        <div className="flex flex-col gap-2 border-t pt-3">
          {marcados.map((o) => (
            <div key={o.id} className="flex items-center justify-between gap-3">
              <span className="text-sm">Tamanho {separarTamanho(o.variante).tamanho ?? o.variante ?? o.nome}</span>
              <Passo qtd={qtds[o.id] ?? 0} aoMudar={(n) => aoQtd(o.id, n)} cheio={cheio} rotulo={`Tamanho ${separarTamanho(o.variante).tamanho ?? o.nome}`} />
            </div>
          ))}
        </div>
      )}
    </li>
  )
}

// Quanto ela já escolheu em relação ao que pagou (os dois valores vêm do banco; aqui só se compara para o texto).
function LinhaEscolhido({ escolhido, pago }: { escolhido: number; pago: number }) {
  return (
    <div className="sticky top-0 z-10 flex flex-col gap-1.5 rounded-xl border bg-background/95 p-3 backdrop-blur" role="status">
      <div className="flex items-baseline justify-between gap-2 text-sm font-semibold tabular-nums">
        <span>
          Você escolheu {reais(escolhido)} de {reais(pago)}
        </span>
      </div>
      <Progress value={pago > 0 ? Math.min(100, (escolhido / pago) * 100) : 0} className="h-1.5" />
      <p className="text-xs text-muted-foreground">
        {escolhido < pago ? "A diferença vira crédito para você." : escolhido > pago ? "Você paga a diferença." : "Valor certinho, sem diferença."}
      </p>
    </div>
  )
}

// Resumo no fim da página: o valor final (pagar a mais ou crédito), depois da primeira escolha.
function Resumo({ data, respondidas }: { data: TrocaPublica; respondidas: number }) {
  const concluida = data.status === "concluida"
  const dif = data.resumo.diferenca
  const temValor = respondidas > 0 || concluida
  const coberto = data.resumo.coberto ?? 0
  const bruta = data.resumo.diferenca_bruta ?? dif + coberto
  if (!temValor) return null
  return (
    <section aria-label="Resumo" className="flex flex-col gap-3 rounded-xl border bg-card p-4">
      {concluida && (
        <div className="flex items-center gap-2 text-base font-semibold">
          <CircleCheck className="size-5 shrink-0 text-success" /> Troca concluída. Obrigada!
        </div>
      )}
      {temValor && coberto > 0 && (
        <div className="flex flex-col gap-1">
          <LinhaValor rotulo="Diferença" valor={`+ ${reais(bruta)}`} />
          <LinhaValor rotulo="A loja cobre" valor={`− ${reais(coberto)}`} />
        </div>
      )}
      {dif !== 0 ? (
        <LinhaValor total rotulo={dif > 0 ? "Você paga a mais" : "Seu crédito"} valor={reais(Math.abs(dif))} />
      ) : (
        <span className="text-base">Sem diferença a pagar</span>
      )}
    </section>
  )
}

// Página pública (sem login): a cliente escolhe a troca de cada peça em falta.
// Cada toque já grava a escolha daquela peça (sem botão final): é o mais simples e não perde nada se ela sair.
export default function Troca() {
  const { token } = useParams()
  const { data, isLoading, isError, refetch, isFetching } = useTrocaPublica(token)
  const escolher = useEscolherTroca(token)
  const carrinho = useCarrinhoTroca(token)
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

  const linkWa =
    WHATSAPP_LOJA && data
      ? `https://wa.me/${WHATSAPP_LOJA}?text=${encodeURIComponent(`Olá! Sobre a troca de peças do meu pedido ${data.numero.replace(/^#/, "")}.`)}`
      : null

  return (
    <PaginaPublica>
      {isLoading ? (
        <div className="flex flex-col gap-4" role="status" aria-label="Carregando">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="aspect-square w-full" />
        </div>
      ) : isError ? (
        <Alert variant="destructive" className="flex flex-col items-center gap-3 p-4 text-center">
          <TriangleAlert className="size-5" />
          <AlertDescription className="text-destructive">Não foi possível carregar agora. Verifique a internet e tente de novo.</AlertDescription>
          <Button variant="outline" size="xl" className="text-foreground" disabled={isFetching} onClick={() => refetch()}>
            {isFetching ? <Spinner /> : <RefreshCw />} Tentar de novo
          </Button>
        </Alert>
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
            <h1 className="text-2xl font-semibold">{cliente ? `Olá, ${cliente}! 🤍` : "Olá! 🤍"}</h1>
            <p className="text-sm text-muted-foreground">Pedido {data.numero.replace(/^#/, "")}</p>
          </div>

          <p className="text-base">
            {total === 1 ? "Uma peça do seu pedido ficou" : `${total} peças do seu pedido ficaram`} sem estoque. Escolha uma troca ou crédito para{" "}
            {total === 1 ? "ela" : "cada uma"}.
          </p>

          {(data.resumo.cobrir_ate ?? 0) > 0 && !concluida && (
            <p className="text-sm text-muted-foreground">A loja cobre até {reais(data.resumo.cobrir_ate ?? 0)} da diferença 🤍</p>
          )}

          {pecas.map((p, n) => {
            const feita = concluida || p.concluida
            const cart = carrinhoDaPeca(p)
            const qtds: Record<string, number> = Object.fromEntries(cart.map((c) => [c.opcao_id, c.qtd]))
            const unidades = cart.reduce((n, c) => n + c.qtd, 0)
            const novas = p.novas && p.novas.length > 0 ? p.novas : p.nova ? [{ ...p.nova, qtd: 0 }] : []
            return (
              <section key={p.item_id} className="flex flex-col gap-3" aria-label={`Peça ${n + 1}`}>
                {/* Entre uma peça e outra: linha e número grande, para não misturar as escolhas. */}
                {n > 0 && <Separator className="mb-3" />}
                {total > 1 && (
                  <div className="flex items-center gap-2.5">
                    {p.escolha_tipo || feita ? (
                      <MarcaCheck />
                    ) : (
                      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold text-muted-foreground tabular-nums">{n + 1}</span>
                    )}
                    <span className="text-lg font-semibold">
                      Peça {n + 1} de {total}
                    </span>
                  </div>
                )}
                {/* Peça que faltou */}
                <Alert variant="destructive" className="flex flex-col gap-2 border-destructive/30 bg-destructive/10 p-3">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-destructive">
                    <PackageX className="size-3.5" />
                    Ficou sem estoque
                  </div>
                  <div className="flex gap-3">
                    <Foto url={fotoTamanho(p.foto_url, 600)} alt={p.nome} ampliar className="size-20 shrink-0" />
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <div className="font-mono text-base leading-snug font-semibold text-foreground">{titulo(p)}</div>
                      {p.variante && <div className="text-sm text-muted-foreground">{p.variante}</div>}
                      <div className="mt-auto text-sm text-muted-foreground tabular-nums">Você pagou {reais(p.valor_pago)}</div>
                    </div>
                  </div>
                </Alert>

                {/* O que ela escolhe no lugar */}
                {feita ? (
                  <Alert variant="success" className="p-3">
                    <CircleCheck />
                    <AlertTitle className="min-w-0">
                      {novas.length > 0 ? (
                        <>
                          Troca confirmada:
                          {novas.map((n, k) => (
                            <span key={k} className="block">
                              {n.qtd > 1 ? `${n.qtd}× ` : ""}
                              {titulo(n)}
                              {n.variante ? ` · ${n.variante}` : ""}
                            </span>
                          ))}
                        </>
                      ) : (
                        `Troca confirmada: crédito de ${reais(p.valor_pago)}`
                      )}
                    </AlertTitle>
                    {p.escolha_equipe && <AlertDescription className="col-start-2 text-xs">Confirmada pela nossa equipe.</AlertDescription>}
                  </Alert>
                ) : (
                  <div className="flex flex-col gap-3 pt-1">
                    <h2 className="text-base font-semibold">{p.opcoes.length > 0 ? "Escolha o que vai no lugar dela" : "Sua opção"}</h2>
                    {unidades > 0 && p.valor_escolhido != null && <LinhaEscolhido escolhido={p.valor_escolhido} pago={p.valor_pago} />}
                    {p.opcoes.length > 0 && (
                      <>
                        {unidades > 0 && <p className="text-xs text-muted-foreground">Use + e − para escolher quantas de cada. Pode juntar peças diferentes.</p>}
                        <ul className="flex flex-col gap-3">
                          {agrupar(p.opcoes).map((g) =>
                            g.length === 1 ? (
                              <CartaoOpcao
                                key={g[0].id}
                                o={g[0]}
                                qtd={qtds[g[0].id] ?? 0}
                                vazio={unidades === 0}
                                cheio={unidades >= MAX_UNIDADES}
                                carregando={gravando === `${p.item_id}:${g[0].id}`}
                                ocupado={escolher.isPending}
                                aoEscolher={() => escolha(p.item_id, "opcao", g[0].id)}
                                aoQtd={(n) => carrinho.mutate({ itemId: p.item_id, opcaoId: g[0].id, qtd: n })}
                              />
                            ) : (
                              <CartaoModelo
                                key={g[0].id}
                                grupo={g}
                                qtds={qtds}
                                cheio={unidades >= MAX_UNIDADES}
                                aoQtd={(id, n) => carrinho.mutate({ itemId: p.item_id, opcaoId: id, qtd: n })}
                              />
                            ),
                          )}
                        </ul>
                      </>
                    )}
                    <Button
                      type="button"
                      variant={p.escolha_tipo === "credito" ? "default" : "outline"}
                      size="xl"
                      className="w-full"
                      aria-pressed={p.escolha_tipo === "credito"}
                      disabled={escolher.isPending}
                      onClick={() => {
                        if (p.escolha_tipo !== "credito") escolha(p.item_id, "credito", null)
                      }}
                    >
                      {gravando === `${p.item_id}:credito` ? <Spinner /> : p.escolha_tipo === "credito" ? <Check /> : <HandCoins />}
                      {p.escolha_tipo === "credito" ? "Crédito escolhido" : "Prefiro crédito"} de {reais(p.valor_pago)}
                    </Button>
                  </div>
                )}
              </section>
            )
          })}

          <Separator />
          <Resumo data={data} respondidas={respondidas} />

          {!concluida && (
            <div className="flex flex-col gap-2" aria-label="Suas escolhas">
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="text-muted-foreground">Suas escolhas</span>
                <span className="font-medium tabular-nums">
                  {respondidas} de {total}
                </span>
              </div>
              <Progress value={total ? (respondidas / total) * 100 : 0} className="h-1.5" />
            </div>
          )}

          {!concluida && (
            <p className="text-sm text-muted-foreground">
              {tudo
                ? "Recebemos todas as suas escolhas. Se mudar de ideia, é só escolher outra opção."
                : "Cada toque já fica salvo. Se mudar de ideia, é só escolher outra opção."}
            </p>
          )}

          {linkWa && (
            <Button asChild size="xl" variant="outline" className="w-full">
              <a href={linkWa} target="_blank" rel="noopener noreferrer">
                <MessageCircle />
                Falar no WhatsApp
              </a>
            </Button>
          )}
        </>
      )}
    </PaginaPublica>
  )
}
