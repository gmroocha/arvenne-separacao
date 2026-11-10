import { useState } from "react"
import { useParams } from "react-router"
import { CircleCheck, Check, MessageCircle, SearchX } from "lucide-react"
import Foto from "@/components/Foto"
import { Button } from "@/components/ui/button"
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { useEscolherTroca, useTrocaPublica } from "@/lib/api"
import { reais } from "@/lib/formato"
import { fotoTamanho } from "@/lib/foto"
import type { EscolhaTroca, TrocaPublica } from "@/lib/tipos"
import { cn } from "@/lib/utils"

type Escolha = { tipo: EscolhaTroca; opcaoId: string | null }
type Opcao = TrocaPublica["opcoes"][number]

// Número da loja (só dígitos) para o link do WhatsApp. Sem ele, o botão não aparece.
const WHATSAPP_LOJA = ((import.meta.env.VITE_WHATSAPP_LOJA as string | undefined) ?? "").replace(/\D/g, "")

function Situacao({ o }: { o: Opcao }) {
  const texto =
    o.situacao === "paga_diferenca"
      ? `Você paga só mais ${reais(o.diferenca)}`
      : o.situacao === "credito"
        ? `Sobra ${reais(Math.abs(o.diferenca))} de crédito`
        : "Mesmo valor"
  return <div className="text-lg font-semibold leading-snug">{texto}</div>
}

// Página pública (sem login) em que a cliente escolhe a troca de uma peça em falta.
export default function Troca() {
  const { token } = useParams()
  const { data, isLoading } = useTrocaPublica(token)
  const escolher = useEscolherTroca(token)
  const [local, setLocal] = useState<Escolha | null>(null)

  function escolha(e: Escolha) {
    setLocal(e)
    escolher.mutate(
      { tipo: e.tipo, opcaoId: e.opcaoId },
      { onSettled: () => setLocal(null) },
    )
  }

  const concluida = data?.status === "concluida"
  const atual: Escolha | null = local ?? (data?.escolha_tipo ? { tipo: data.escolha_tipo, opcaoId: data.escolha_opcao_id } : null)
  const ocupado = escolher.isPending
  const travado = concluida || ocupado

  const opcaoEscolhida = atual?.tipo === "opcao" ? data?.opcoes.find((o) => o.id === atual.opcaoId) : undefined
  const cliente = data?.cliente?.trim()

  const resumo = !atual
    ? null
    : atual.tipo === "credito"
      ? `Crédito de ${reais(data?.valor_credito)}`
      : atual.tipo === "whatsapp"
        ? "Vamos conversar pelo WhatsApp"
        : opcaoEscolhida
          ? [opcaoEscolhida.nome, opcaoEscolhida.variante].filter(Boolean).join(" · ")
          : null

  const linkWa =
    WHATSAPP_LOJA && data
      ? `https://wa.me/${WHATSAPP_LOJA}?text=${encodeURIComponent(`Olá! Sobre a troca de peça do meu pedido ${data.numero.replace(/^#/, "")}.`)}`
      : null

  return (
    <div className="mx-auto flex min-h-svh w-full max-w-md flex-col gap-4 overflow-x-hidden px-4 pb-12 pt-3">
      <header className="pt-2 text-center text-lg font-semibold tracking-wide">Arvenne</header>
      {isLoading ? (
        <div className="flex flex-col gap-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="aspect-square w-full" />
          <Skeleton className="h-40 w-full" />
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
            {cliente && <h1 className="text-xl font-semibold">Olá, {cliente}.</h1>}
            <p className="text-base text-muted-foreground">
              Uma peça do seu pedido {data.numero.replace(/^#/, "")} ficou sem estoque.
            </p>
          </div>

          {(concluida || atual) && (
            <div className="flex items-start gap-3 rounded-xl border border-emerald-600/40 bg-emerald-50 p-4 text-emerald-950 dark:bg-emerald-950/30 dark:text-emerald-50">
              <CircleCheck className="mt-0.5 size-5 shrink-0 text-emerald-600" />
              <div className="flex min-w-0 flex-col gap-0.5">
                <div className="text-base font-semibold">{concluida ? "Troca confirmada" : "Recebemos sua escolha"}</div>
                {resumo && <div className="text-sm">{resumo}</div>}
                {!concluida && <div className="text-sm opacity-80">Se mudar de ideia, é só escolher outra opção abaixo.</div>}
              </div>
            </div>
          )}

          <section className="flex flex-col gap-3 rounded-xl border bg-card p-4">
            <div className="text-sm text-muted-foreground">Peça sem estoque</div>
            <Foto url={fotoTamanho(data.item.foto_url, 600)} alt={data.item.nome} ampliar className="w-full" />
            <div className="flex flex-col gap-0.5">
              <div className="text-base font-medium leading-snug">{data.item.nome}</div>
              {data.item.variante && <div className="text-sm text-muted-foreground">{data.item.variante}</div>}
              {data.item.sku && <div className="font-mono text-xs text-muted-foreground">{data.item.sku}</div>}
              <div className="pt-1 text-sm tabular-nums">Você pagou {reais(data.item.valor_pago)} por ela</div>
            </div>
          </section>

          {data.opcoes.length > 0 && (
            <>
              <h2 className="pt-2 text-lg font-semibold">Escolha uma opção</h2>
              <ul className="flex flex-col gap-4">
                {data.opcoes.map((o) => {
                  const selecionada = atual?.tipo === "opcao" && atual.opcaoId === o.id
                  const carregando = ocupado && local?.opcaoId === o.id
                  return (
                    <li
                      key={o.id}
                      className={cn(
                        "flex flex-col gap-3 rounded-xl border bg-card p-4 transition-shadow",
                        selecionada && "border-emerald-600 ring-2 ring-emerald-600",
                      )}
                    >
                      <div className="relative">
                        <Foto url={fotoTamanho(o.foto_url, 600)} alt={o.nome} ampliar className="w-full" />
                        {selecionada && (
                          <span className="pointer-events-none absolute right-2 top-2 flex size-8 items-center justify-center rounded-full bg-emerald-600 text-white shadow">
                            <Check className="size-5" />
                          </span>
                        )}
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <div className="text-base font-medium leading-snug">{o.nome}</div>
                        {o.variante && <div className="text-sm text-muted-foreground">{o.variante}</div>}
                        {o.sku && <div className="font-mono text-xs text-muted-foreground">{o.sku}</div>}
                        <div className="pt-1 text-sm tabular-nums text-muted-foreground">Valor da peça {reais(o.valor)}</div>
                      </div>
                      <Situacao o={o} />
                      <Button
                        type="button"
                        size="lg"
                        variant={selecionada ? "secondary" : "default"}
                        className="h-11 w-full text-base"
                        disabled={travado || selecionada}
                        onClick={() => escolha({ tipo: "opcao", opcaoId: o.id })}
                      >
                        {carregando ? <Spinner /> : selecionada ? <Check /> : null}
                        {selecionada ? "Escolhida" : "Quero esta"}
                      </Button>
                    </li>
                  )
                })}
              </ul>
            </>
          )}

          <div className="flex flex-col gap-3 pt-2">
            <Button
              type="button"
              size="lg"
              variant="outline"
              className={cn("h-11 w-full text-base", atual?.tipo === "credito" && "border-emerald-600 ring-2 ring-emerald-600")}
              disabled={travado}
              onClick={() => escolha({ tipo: "credito", opcaoId: null })}
            >
              {ocupado && local?.tipo === "credito" ? <Spinner /> : atual?.tipo === "credito" ? <Check /> : null}
              Prefiro crédito de {reais(data.valor_credito)}
            </Button>
            {linkWa && (
              <Button asChild size="lg" variant="outline" className="h-11 w-full text-base">
                <a
                  href={linkWa}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-disabled={concluida}
                  className={cn(concluida && "pointer-events-none opacity-50")}
                  onClick={() => {
                    if (!concluida && atual?.tipo !== "whatsapp") escolha({ tipo: "whatsapp", opcaoId: null })
                  }}
                >
                  <MessageCircle />
                  Falar no WhatsApp
                </a>
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  )
}
