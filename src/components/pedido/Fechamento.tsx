import { useState } from "react"
import { Check, ExternalLink, MapPin, MessageCircle, Send, Truck } from "lucide-react"
import { ConcluirEtapa } from "@/components/comum/ConcluirEtapa"
import { TituloSecao } from "@/components/comum/TituloSecao"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import type { CamposPedido, PedidoDetalhe } from "@/lib/api"
import { textoRastreio } from "@/lib/agente"
import { linkWhatsApp, quando } from "@/lib/formato"
import { cn } from "@/lib/utils"
import CampoSalvo from "./CampoSalvo"

type Patch = (campos: CamposPedido) => void
type Props = { pedido: PedidoDetalhe; patch: Patch; aoConcluir?: () => void }

const ITENS_EMBALAGEM = ["Caixa do tamanho certo", "Nota impressa dentro", "Etiqueta de envio colada"]

export function Embalagem({ patch, aoConcluir }: Props) {
  const [marcados, setMarcados] = useState<Set<number>>(new Set())
  return (
    <div className="flex flex-col gap-4">
      <TituloSecao as="h3">Embalagem</TituloSecao>
      <ul className="flex flex-col gap-2">
        {ITENS_EMBALAGEM.map((t, n) => (
          <li key={t}>
            <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl p-3 text-sm ring-1 ring-foreground/10 has-data-checked:bg-success/5 has-data-checked:text-muted-foreground has-data-checked:ring-success/30">
              <Checkbox
                variant="success"
                checked={marcados.has(n)}
                onCheckedChange={(c) =>
                  setMarcados((s) => {
                    const novo = new Set(s)
                    if (c) novo.add(n)
                    else novo.delete(n)
                    return novo
                  })
                }
              />
              <span className={marcados.has(n) ? "line-through" : ""}>{t}</span>
            </label>
          </li>
        ))}
      </ul>
      {aoConcluir && (
        <ConcluirEtapa
          disabled={marcados.size < ITENS_EMBALAGEM.length}
          onClick={() => {
            patch({ embalado_em: new Date().toISOString() })
            aoConcluir?.()
          }}
        >
          Concluir embalagem
        </ConcluirEtapa>
      )}
    </div>
  )
}

export function Postagem({ pedido, patch, aoConcluir }: Props) {
  return (
    <div className="flex flex-col gap-4">
      <TituloSecao as="h3">
        <span className="flex items-center gap-2">
          <Truck className="size-4" /> Postagem <MapPin className="size-4 text-muted-foreground" />
          <span className="font-normal text-muted-foreground">Correios</span>
        </span>
      </TituloSecao>
      <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-muted-foreground">
        <li>Confira se a etiqueta de envio bate com o pedido.</li>
        <li>Leve o pacote aos Correios ou deixe para a coleta.</li>
      </ul>
      <CampoSalvo
        id="rastreio-url"
        rotulo="Link de rastreio"
        valor={pedido.rastreio_url}
        inputMode="url"
        placeholder="Cole o link da Frenet"
        aoSalvar={(v) => patch({ rastreio_url: v })}
      />
      {pedido.rastreio_url && (
        <Button variant="outline" size="toque" className="w-full sm:w-fit" asChild>
          <a href={pedido.rastreio_url} target="_blank" rel="noreferrer">
            <ExternalLink /> Abrir rastreio
          </a>
        </Button>
      )}
      {aoConcluir && (
        <ConcluirEtapa
          onClick={() => {
            patch({ postado_em: pedido.postado_em ?? new Date().toISOString() })
            aoConcluir?.()
          }}
        >
          Concluir postagem
        </ConcluirEtapa>
      )}
    </div>
  )
}

export function Enviado({ pedido, patch }: Omit<Props, "aoConcluir">) {
  const wa = pedido.rastreio_url || pedido.rastreio ? linkWhatsApp(pedido.cliente_telefone, textoRastreio(pedido)) : null
  const whats = pedido.origem !== "shopify"
  const feito = Boolean(pedido.rastreio_enviado_em)
  return (
    <div className="flex flex-col gap-4">
      <TituloSecao as="h3">Enviado{pedido.postado_em ? ` em ${quando(pedido.postado_em)}` : ""}</TituloSecao>
      {pedido.rastreio_url ? (
        <Button variant="outline" size="toque" className="w-full sm:w-fit" asChild>
          <a href={pedido.rastreio_url} target="_blank" rel="noreferrer">
            <ExternalLink /> Abrir rastreio
          </a>
        </Button>
      ) : (
        <CampoSalvo id="rastreio-url" rotulo="Link de rastreio" valor={null} inputMode="url" aoSalvar={(v) => patch({ rastreio_url: v })} />
      )}
      {whats ? (
        <Card size="sm" tom={feito ? "success" : undefined} className={cn(!feito && "ring-primary/40")}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Send className="size-4" /> Enviar rastreio à cliente
              <Badge variant={feito ? "success" : "outline"} className="ml-auto">
                {feito ? `Enviado ${quando(pedido.rastreio_enviado_em!)}` : "Pendente"}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {wa ? (
              <Button variant="outline" size="toque" className="w-full sm:w-fit" asChild>
                <a href={wa} target="_blank" rel="noreferrer">
                  <MessageCircle /> Abrir WhatsApp com a mensagem
                </a>
              </Button>
            ) : (
              <Alert>
                <AlertDescription>
                  {pedido.rastreio_url ? "Sem telefone válido para o WhatsApp." : "Preencha o link de rastreio acima para montar a mensagem."}
                </AlertDescription>
              </Alert>
            )}
            {feito ? (
              <Button variant="ghost" size="toque" className="w-fit" onClick={() => patch({ rastreio_enviado_em: null })}>
                Desfazer mensagem enviada
              </Button>
            ) : (
              <Button size="xl" className="w-full" onClick={() => patch({ rastreio_enviado_em: new Date().toISOString() })}>
                <Check /> Mensagem enviada
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <p className="text-sm text-muted-foreground">A Shopify avisa a cliente automaticamente.</p>
      )}
    </div>
  )
}
