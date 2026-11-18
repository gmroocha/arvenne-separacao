import { useState } from "react"
import { Check, ExternalLink, MapPin, MessageCircle, Send, Truck } from "lucide-react"
import { TituloSecao } from "@/components/comum/TituloSecao"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import type { CamposPedido, PedidoDetalhe } from "@/lib/api"
import { textoRastreio } from "@/lib/agente"
import { linkWhatsApp, quando } from "@/lib/formato"
import CampoSalvo from "./CampoSalvo"

type Patch = (campos: CamposPedido) => void
type Props = { pedido: PedidoDetalhe; patch: Patch }

const ITENS_EMBALAGEM = ["Caixa do tamanho certo", "Nota impressa dentro", "Caixa fechada"]

// Um botão só: marcar a embalagem como feita leva o pedido para o Frete (o banco avança sozinho).
export function Embalagem({ pedido, patch }: Props) {
  const [marcados, setMarcados] = useState<Set<number>>(new Set())
  return (
    <div className="flex flex-col gap-4">
      <TituloSecao as="h3">Embalagem</TituloSecao>
      <ul className="flex flex-col gap-2">
        {ITENS_EMBALAGEM.map((t, n) => (
          <li key={t}>
            <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl p-3 text-sm ring-1 ring-foreground/10 has-data-checked:bg-success/5 has-data-checked:text-muted-foreground has-data-checked:ring-(length:--traco) has-data-checked:ring-success/30">
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
      {pedido.embalado_em ? (
        <Button variant="ghost" size="toque" className="w-fit" onClick={() => patch({ embalado_em: null })}>
          Desfazer embalagem
        </Button>
      ) : (
        <Button size="xl" className="w-full" disabled={marcados.size < ITENS_EMBALAGEM.length} onClick={() => patch({ embalado_em: new Date().toISOString() })}>
          <Check /> Embalado
        </Button>
      )}
    </div>
  )
}

// Um botão só: "Postado" leva o pedido para Concluídos (o banco avança sozinho). O link de rastreio é colado aqui.
export function Postagem({ pedido, patch }: Props) {
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
        id="postagem-link"
        rotulo="Link de rastreio (opcional)"
        valor={pedido.rastreio_url}
        inputMode="url"
        aoSalvar={(v) => patch({ rastreio_url: v })}
      />
      {pedido.rastreio_url && (
        <Button variant="outline" size="toque" className="w-full sm:w-fit" asChild>
          <a href={pedido.rastreio_url} target="_blank" rel="noreferrer">
            <ExternalLink /> Abrir rastreio
          </a>
        </Button>
      )}
      {pedido.postado_em ? (
        <Button variant="ghost" size="toque" className="w-fit" onClick={() => patch({ postado_em: null })}>
          Desfazer postagem
        </Button>
      ) : (
        <Button size="xl" className="w-full" onClick={() => patch({ postado_em: new Date().toISOString() })}>
          <Check /> Postado
        </Button>
      )}
    </div>
  )
}

// Pedido que não é da Shopify, já postado: falta avisar a cliente. O link de rastreio, o WhatsApp com a mensagem pronta e
// "Mensagem enviada" (que leva o pedido para Concluídos) ficam todos aqui.
export function EnviarRastreio({ pedido, patch }: Props) {
  const link = pedido.rastreio_url ?? pedido.rastreio
  const wa = link ? linkWhatsApp(pedido.cliente_telefone, textoRastreio(pedido)) : null
  return (
    <div className="flex flex-col gap-4">
      <TituloSecao as="h3">
        <span className="flex items-center gap-2">
          <Send className="size-4 text-rastreio" /> Enviar rastreio à cliente
          {pedido.postado_em && <span className="font-normal text-muted-foreground">postado {quando(pedido.postado_em)}</span>}
        </span>
      </TituloSecao>
      <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-muted-foreground">
        <li>Confira o link de rastreio (cole se faltar).</li>
        <li>Abra o WhatsApp com a mensagem pronta e envie.</li>
        <li>Depois marque &quot;Mensagem enviada&quot;: o pedido vai para Concluídos.</li>
      </ul>
      <CampoSalvo id="rastreio-url" rotulo="Link de rastreio" valor={pedido.rastreio_url} inputMode="url" aoSalvar={(v) => patch({ rastreio_url: v })} />
      {wa ? (
        <Button variant="outline" size="toque" className="w-full sm:w-fit" asChild>
          <a href={wa} target="_blank" rel="noreferrer">
            <MessageCircle /> Abrir WhatsApp com a mensagem
          </a>
        </Button>
      ) : (
        <Alert>
          <AlertDescription>{link ? "Sem telefone válido para o WhatsApp." : "Cole o link de rastreio acima para montar a mensagem."}</AlertDescription>
        </Alert>
      )}
      <Button size="xl" className="w-full" onClick={() => patch({ rastreio_enviado_em: new Date().toISOString() })}>
        <Check /> Mensagem enviada
      </Button>
    </div>
  )
}

// Pedido concluído: o resumo do que saiu e quando. A cliente do WhatsApp já recebeu a mensagem; a da Shopify é avisada pela loja.
export function Enviado({ pedido, patch }: Omit<Props, "aoConcluir">) {
  const whats = pedido.origem !== "shopify"
  return (
    <div className="flex flex-col gap-4">
      <TituloSecao as="h3">Concluído{pedido.postado_em ? ` · postado em ${quando(pedido.postado_em)}` : ""}</TituloSecao>
      {pedido.rastreio_url ? (
        <Button variant="outline" size="toque" className="w-full sm:w-fit" asChild>
          <a href={pedido.rastreio_url} target="_blank" rel="noreferrer">
            <ExternalLink /> Abrir rastreio
          </a>
        </Button>
      ) : (
        // Pedido concluído à mão (sem passar pela Postagem): este é o único lugar para colar o link depois.
        <CampoSalvo id="rastreio-url" rotulo="Link de rastreio" valor={null} inputMode="url" aoSalvar={(v) => patch({ rastreio_url: v })} />
      )}
      {whats ? (
        <p className="text-sm text-muted-foreground">
          {pedido.rastreio_enviado_em ? `Mensagem de rastreio enviada ${quando(pedido.rastreio_enviado_em)}.` : "Mensagem de rastreio não registrada."}
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">A Shopify avisa a cliente automaticamente.</p>
      )}
    </div>
  )
}
