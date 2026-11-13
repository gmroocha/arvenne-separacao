import { useState } from "react"
import { Link } from "react-router"
import { MessageSquare } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useFeedbacks, useResolverFeedback } from "@/lib/api"
import { quando } from "@/lib/formato"
import type { Feedback } from "@/lib/tipos"

// /pedidos/:id já redireciona para a venda quando o pedido ainda está em venda.
function linkDaTela(f: Feedback) {
  return f.pedido_id ? `/pedidos/${f.pedido_id}` : f.pagina
}

export default function Feedbacks() {
  const [aba, setAba] = useState<"abertos" | "resolvidos">("abertos")
  const { data, isLoading } = useFeedbacks()
  const resolver = useResolverFeedback()
  const lista = (data ?? []).filter((f) => (aba === "abertos" ? !f.resolvido_em : Boolean(f.resolvido_em)))

  return (
    <Tabs value={aba} onValueChange={(v) => setAba(v as typeof aba)} className="flex flex-col gap-4">
        <TabsList variant="line">
          <TabsTrigger value="abertos">Abertos</TabsTrigger>
          <TabsTrigger value="resolvidos">Resolvidos</TabsTrigger>
        </TabsList>
      <TabsContent value={aba} className="flex flex-col gap-4">
      {isLoading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : lista.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <MessageSquare />
            </EmptyMedia>
            <EmptyTitle>{aba === "abertos" ? "Nenhum feedback aberto" : "Nenhum feedback resolvido"}</EmptyTitle>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="flex flex-col gap-2">
          {lista.map((f) => {
            const destino = linkDaTela(f)
            return (
              <Card key={f.id} size="sm">
                <CardContent className="flex flex-col gap-2">
                  <p className="text-sm whitespace-pre-wrap">{f.texto}</p>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-col text-xs text-muted-foreground">
                      <span>
                        {f.usuario_email ?? "—"} · {quando(f.created_at)}
                      </span>
                      {destino && (
                        <Button asChild variant="link" size="xs" className="h-auto w-fit p-0 text-xs">
                          <Link to={destino}>
                            {f.pedidos ? `Pedido ${f.pedidos.numero.replace(/^#/, "")}${f.pedidos.cliente_nome ? ` · ${f.pedidos.cliente_nome}` : ""}` : `Tela ${f.pagina}`}
                          </Link>
                        </Button>
                      )}
                    </div>
                    <Button
                      variant="outline"
                      size="toque"
                      disabled={resolver.isPending}
                      onClick={() => resolver.mutate({ id: f.id, resolvido: !f.resolvido_em })}
                    >
                      {f.resolvido_em ? "Reabrir" : "Resolvido"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
      </TabsContent>
    </Tabs>
  )
}
