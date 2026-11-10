import { useParams } from "react-router"
import { SearchX } from "lucide-react"
import Foto from "@/components/Foto"
import { Badge } from "@/components/ui/badge"
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { useRomaneio } from "@/lib/api"
import { reais } from "@/lib/formato"

function Linha({ rotulo, children, forte }: { rotulo: string; children: React.ReactNode; forte?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-3 ${forte ? "text-lg font-semibold" : "text-sm"}`}>
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
    <div className="mx-auto flex min-h-svh w-full max-w-md flex-col gap-5 p-4 pb-10">
      <header className="pt-2 text-center text-lg font-semibold tracking-wide">Arvenne</header>
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
            {data.cliente && <p className="text-muted-foreground">Olá, {data.cliente}</p>}
          </div>

          <ul className="flex flex-col gap-3">
            {data.itens.map((i, n) => (
              <li key={n} className="flex items-center gap-3">
                <Foto url={i.foto_url} alt={i.nome} className="size-16 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">{i.nome}</div>
                  {i.variante && <div className="text-sm text-muted-foreground">{i.variante}</div>}
                  <div className="text-sm text-muted-foreground tabular-nums">Quantidade: {i.qtd}</div>
                </div>
                <div className="text-sm font-medium tabular-nums">{reais(i.preco)}</div>
              </li>
            ))}
          </ul>

          <Separator />
          <div className="flex flex-col gap-1.5">
            <Linha rotulo="Subtotal">{reais(data.subtotal)}</Linha>
            {data.desconto > 0 && (
              <Linha rotulo={data.cupom ? `Desconto (cupom ${data.cupom})` : "Desconto"}>− {reais(data.desconto)}</Linha>
            )}
            {data.frete_tipo && (
              <Linha rotulo={`Frete ${data.frete_tipo === "retirada" ? "(retirada)" : data.frete_tipo}`}>
                {data.frete_cobrado > 0 ? reais(data.frete_cobrado) : "Grátis"}
              </Linha>
            )}
            <Separator className="my-1" />
            <Linha rotulo="Total" forte>
              {reais(data.total)}
            </Linha>
          </div>

          <p className="text-center text-sm text-muted-foreground">Dúvidas? Responda no WhatsApp.</p>
        </>
      )}
    </div>
  )
}
