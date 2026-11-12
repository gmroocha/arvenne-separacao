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
import { seloRomaneio } from "@/lib/status"

// Página pública (sem login) que a vendedora manda para a cliente. Atualiza sozinha.
export default function Romaneio() {
  const { token } = useParams()
  const { data, isLoading } = useRomaneio(token)
  const selo = data ? seloRomaneio(data.fase, data.status) : null

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
              {selo && <Badge variant={selo.variante}>{selo.texto}</Badge>}
            </div>
            {data.cliente && !data.cliente.includes("@") && <p className="text-base text-muted-foreground">Olá, {data.cliente}</p>}
          </div>

          {data.somada_a && (
            <p className="rounded-lg bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
              Estas peças foram somadas ao pedido {data.somada_a.replace(/^#/, "")} e vão no mesmo pacote.
            </p>
          )}

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

          {(data.adicionais?.length ?? 0) > 0 && (
            <>
              <Separator />
              <h2 className="text-sm font-semibold">Peças adicionais</h2>
              <ul className="flex flex-col gap-3">
                {data.adicionais!.map((i, n) => (
                  <li key={n}>
                    <LinhaPeca
                      tamanho="lg"
                      item={{ foto_url: i.foto_url, nome: i.nome, sku: i.sku?.trim() || i.nome, variante: i.variante }}
                      extra={<div className="pt-1 text-sm tabular-nums">Qtd {i.qtd}</div>}
                    />
                  </li>
                ))}
              </ul>
            </>
          )}

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
            <LinhaValor total={!data.valor_somado} rotulo={data.valor_somado ? "Total do pedido" : "Total"} valor={reais(data.total)} />
            {(data.valor_somado ?? 0) > 0 && (
              <>
                <LinhaValor rotulo="Peças adicionais" valor={reais(data.valor_somado)} />
                <Separator className="my-1" />
                <LinhaValor total rotulo="Total geral" valor={reais(data.total_geral)} />
              </>
            )}
          </div>

          <p className="text-center text-sm text-muted-foreground">Dúvidas? Responda no WhatsApp.</p>
        </>
      )}
    </PaginaPublica>
  )
}
