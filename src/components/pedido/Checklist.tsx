import { useState } from "react"
import { ExternalLink, MessageCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { useAtualizarPedido, useMudarStatus, type PedidoDetalhe } from "@/lib/api"
import { textoRastreio } from "@/lib/agente"
import { linkWhatsApp } from "@/lib/formato"
import { NOME_ETAPA, proximaEtapa } from "@/lib/status"

const LINK_OLIST = import.meta.env.VITE_URL_OLIST as string | undefined
const LINK_BLING = import.meta.env.VITE_URL_BLING as string | undefined

const GUIAS: Record<string, { titulo: string; passos: string[]; links?: boolean }> = {
  faturamento: {
    titulo: "Nota, Bling e frete",
    links: true,
    passos: [
      "Conferir nome, CPF e endereço de entrega (use \"Copiar endereço\")",
      "Emitir a nota fiscal",
      "Cotar e gerar o frete no Frenet",
      "Imprimir a nota e a etiqueta de envio",
    ],
  },
  embalagem: {
    titulo: "Embalagem",
    passos: [
      "Separar a embalagem do tamanho certo",
      "Colocar as peças com a etiqueta e a proteção",
      "Incluir a nota fiscal e o cartão",
      "Fechar e colar a etiqueta de envio",
    ],
  },
  pronto_envio: {
    titulo: "Correios",
    passos: [
      "Conferir se a etiqueta de envio bate com o pedido",
      "Separar o pacote para a coleta ou a postagem",
      "Anotar o código de rastreio",
    ],
  },
}

export function CampoRastreio({ pedido }: { pedido: PedidoDetalhe }) {
  const salvar = useAtualizarPedido([["pedido"]])
  const [rastreio, setRastreio] = useState(pedido.rastreio ?? "")
  const wa = pedido.rastreio ? linkWhatsApp(pedido.cliente_telefone, textoRastreio(pedido)) : null
  return (
    <div className="flex flex-col gap-3">
      <Field>
        <FieldLabel htmlFor="rastreio">Código de rastreio</FieldLabel>
        <Input
          id="rastreio"
          value={rastreio}
          onChange={(e) => setRastreio(e.target.value)}
          onBlur={() =>
            rastreio !== (pedido.rastreio ?? "") && salvar.mutate({ pedidoId: pedido.id, campos: { rastreio: rastreio.trim() || null } })
          }
        />
      </Field>
      {wa && (
        <Button variant="outline" className="h-11 w-full sm:w-fit" asChild>
          <a href={wa} target="_blank" rel="noreferrer">
            <MessageCircle /> Enviar rastreio no WhatsApp
          </a>
        </Button>
      )}
    </div>
  )
}

// Guia da etapa: só tela, não grava no banco. "Concluir etapa" avança o pedido.
export default function Checklist({ pedido }: { pedido: PedidoDetalhe }) {
  const guia = GUIAS[pedido.status]
  const mudarStatus = useMudarStatus()
  const [marcados, setMarcados] = useState<Set<number>>(new Set())
  const proxima = proximaEtapa(pedido.status)
  if (!guia) return null

  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-sm font-semibold">{guia.titulo}</h3>
      <ul className="flex flex-col gap-2">
        {guia.passos.map((p, n) => (
          <li key={p}>
            <label className="flex cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm has-data-checked:bg-muted/50 has-data-checked:text-muted-foreground">
              <Checkbox
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
              <span className={marcados.has(n) ? "line-through" : ""}>{p}</span>
            </label>
          </li>
        ))}
      </ul>
      {guia.links && (LINK_OLIST || LINK_BLING) && (
        <div className="flex flex-wrap gap-2">
          {LINK_OLIST && (
            <Button variant="outline" asChild>
              <a href={LINK_OLIST} target="_blank" rel="noreferrer">
                <ExternalLink /> Abrir Olist
              </a>
            </Button>
          )}
          {LINK_BLING && (
            <Button variant="outline" asChild>
              <a href={LINK_BLING} target="_blank" rel="noreferrer">
                <ExternalLink /> Abrir Bling
              </a>
            </Button>
          )}
        </div>
      )}
      {pedido.status === "pronto_envio" && <CampoRastreio pedido={pedido} />}
      <Button
        className="h-11 w-full text-base"
        disabled={!proxima || mudarStatus.isPending}
        onClick={() => proxima && mudarStatus.mutate({ pedidoId: pedido.id, para: proxima })}
      >
        Concluir etapa{proxima ? ` — ir para ${NOME_ETAPA[proxima]}` : ""}
      </Button>
    </div>
  )
}
