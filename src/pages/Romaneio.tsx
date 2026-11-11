import { useParams } from "react-router"
import { SearchX } from "lucide-react"
import Logo from "@/components/Logo"
import Foto from "@/components/Foto"
import { Badge } from "@/components/ui/badge"
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { useRomaneio } from "@/lib/api"
import { reais } from "@/lib/formato"
import { fotoTamanho } from "@/lib/foto"

function Linha({ rotulo, children, forte, grande }: { rotulo: string; children: React.ReactNode; forte?: boolean; grande?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-3 ${grande ? "text-2xl font-semibold" : forte ? "text-lg font-semibold" : "text-base"}`}>
      <span className={forte ? "" : "text-muted-foreground"}>{rotulo}</span>
      <span className="tabular-nums">{children}</span>
    </div>
  )
}

// Página pública (sem login) que a vendedora manda para a cliente. Atualiza sozinha.
export default function Romaneio() {
  const { token } = useParams()
  const { data, isLoading } = useRomaneio(token)

  return (
    <div className="mx-auto flex min-h-svh w-full max-w-md flex-col gap-5 px-4 pb-12 pt-3">
      <header className="flex justify-center pt-3">
        <Logo className="h-10" />
      </header>
      {isLoading ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
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
              <h1 className="text-xl font-semibold">Pedido {data.numero.replace(/^#/, "")}</h1>
              {data.fase !== "venda" && data.status !== "perdida" && <Badge variant="secondary">Pagamento confirmado</Badge>}
            </div>
            {data.cliente && !data.cliente.includes("@") && <p className="text-base text-muted-foreground">Olá, {data.cliente}</p>}
          </div>

          <ul className="flex flex-col gap-3">
            {data.itens.map((i, n) => (
              <li key={n} className="flex gap-3 rounded-xl border bg-card p-3">
                <Foto url={fotoTamanho(i.foto_url, 600)} alt={i.nome} ampliar className="size-28 shrink-0" />
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  {i.sku?.trim() ? (
                    <div className="break-words font-mono text-base font-semibold leading-snug">{i.sku.trim()}</div>
                  ) : (
                    <div className="text-base font-medium leading-snug">{i.nome}</div>
                  )}
                  {i.variante && <div className="text-sm text-muted-foreground">{i.variante}</div>}
                  <div className="mt-auto pt-1 text-sm tabular-nums">
                    Qtd {i.qtd}
                    {i.preco != null && <span className="font-medium"> × {reais(i.preco)}</span>}
                  </div>
                </div>
              </li>
            ))}
          </ul>

          <Separator />
          <div className="flex flex-col gap-1.5">
            <Linha rotulo="Subtotal">{reais(data.subtotal)}</Linha>
            {data.desconto > 0 && (
              <Linha rotulo={data.cupom ? `Desconto (cupom ${data.cupom})` : "Desconto"}>− {reais(data.desconto)}</Linha>
            )}
            {(data.desconto_pix ?? 0) > 0 && <Linha rotulo="Desconto Pix (10%)">− {reais(data.desconto_pix ?? 0)}</Linha>}
            {data.frete_tipo && (
              <Linha rotulo={`Frete ${data.frete_tipo === "retirada" ? "(retirada)" : data.frete_tipo}`}>
                {data.frete_cobrado > 0 ? reais(data.frete_cobrado) : "Grátis"}
              </Linha>
            )}
            <Separator className="my-1" />
            <Linha rotulo="Total" forte grande>
              {reais(data.total)}
            </Linha>
          </div>

          <p className="text-center text-sm text-muted-foreground">Dúvidas? Responda no WhatsApp.</p>
        </>
      )}
    </div>
  )
}
