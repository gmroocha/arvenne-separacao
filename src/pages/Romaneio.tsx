import { useParams } from "react-router"
import { SearchX } from "lucide-react"
import { LinhaPeca } from "@/components/comum/Peca"
import { LinhaValor } from "@/components/comum/LinhaValor"
import { PaginaPublica } from "@/components/comum/PaginaPublica"
import { Badge } from "@/components/ui/badge"
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { useRomaneio } from "@/lib/api"
import { reais } from "@/lib/formato"

// Página pública (sem login) que a vendedora manda para a cliente. Atualiza sozinha.
export default function Romaneio() {
  const { token } = useParams()
  const { data, isLoading } = useRomaneio(token)

  return (
    <PaginaPublica>
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
              <h1 className="text-2xl font-semibold">Pedido {data.numero.replace(/^#/, "")}</h1>
              {data.fase !== "venda" && data.status !== "perdida" && <Badge variant="success">Pagamento confirmado</Badge>}
            </div>
            {data.cliente && !data.cliente.includes("@") && <p className="text-base text-muted-foreground">Olá, {data.cliente}</p>}
          </div>

          <ul className="flex flex-col gap-3">
            {data.itens.map((i, n) => (
              <li key={n}>
                <LinhaPeca
                  tamanho="lg"
                  item={{ foto_url: i.foto_url, nome: i.nome, sku: i.sku?.trim() || i.nome, variante: i.variante }}
                  extra={
                    <div className="pt-1 text-sm tabular-nums">
                      Qtd {i.qtd}
                      {i.preco != null && <span className="font-medium"> × {reais(i.preco)}</span>}
                    </div>
                  }
                />
              </li>
            ))}
          </ul>

          <Separator />
          <div className="flex flex-col gap-1.5">
            <LinhaValor rotulo="Subtotal" valor={reais(data.subtotal)} />
            {data.desconto > 0 && <LinhaValor rotulo={data.cupom ? `Desconto (cupom ${data.cupom})` : "Desconto"} valor={`− ${reais(data.desconto)}`} />}
            {(data.desconto_pix ?? 0) > 0 && <LinhaValor rotulo="Desconto Pix (10%)" valor={`− ${reais(data.desconto_pix ?? 0)}`} />}
            {data.frete_tipo && (
              <LinhaValor
                rotulo={`Frete ${data.frete_tipo === "retirada" ? "(retirada)" : data.frete_tipo}`}
                valor={data.frete_cobrado > 0 ? reais(data.frete_cobrado) : "Grátis"}
              />
            )}
            <Separator className="my-1" />
            <LinhaValor total rotulo="Total" valor={reais(data.total)} />
          </div>

          <p className="text-center text-sm text-muted-foreground">Dúvidas? Responda no WhatsApp.</p>
        </>
      )}
    </PaginaPublica>
  )
}
