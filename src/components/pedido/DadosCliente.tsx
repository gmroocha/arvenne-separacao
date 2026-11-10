import { useState } from "react"
import { toast } from "sonner"
import { ChevronDown, Copy } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { useAdicionarNota, useAtualizarPedido, type PedidoDetalhe } from "@/lib/api"
import { linkWhatsApp, mascaraCpf, quando, reais } from "@/lib/formato"
import { NOME_ETAPA, NOME_ITEM, type StatusItem } from "@/lib/status"
import { textoEndereco } from "@/lib/endereco"
import type { Evento } from "@/lib/tipos"
import { useIsMobile } from "@/hooks/use-mobile"

const ROTULO_EVENTO: Record<string, string> = {
  conferida: "Peça conferida", desconferida: "Conferência desfeita", etiquetada: "Peça etiquetada",
  desetiquetada: "Etiqueta desfeita", bipada: "Peça bipada", qtd: "Quantidade alterada", preco: "Preço alterado",
  nota_emitida: "Nota emitida", nota_desfeita: "Nota desfeita", frete_gerado: "Frete gerado", frete_desfeito: "Frete desfeito",
  pedido_lr: "Pedido ao fornecedor (LR)", pedido_lr_desfeito: "Pedido ao fornecedor desfeito",
  embalado: "Embalado", desembalado: "Embalagem desfeita", postado: "Postado", desfeito_postagem: "Postagem desfeita",
  pago: "Pagamento registrado", rastreio_enviado: "Rastreio enviado à cliente", reiniciado: "Reiniciado",
}

function descreverEvento(e: Evento) {
  if (ROTULO_EVENTO[e.tipo]) return [ROTULO_EVENTO[e.tipo], e.texto].filter(Boolean).join(" · ")
  if (e.tipo === "nota") return e.texto ?? ""
  if (e.tipo === "criado") return "Pedido criado"
  if (e.tipo === "status")
    return `${NOME_ETAPA[e.de as keyof typeof NOME_ETAPA] ?? e.de} → ${NOME_ETAPA[e.para as keyof typeof NOME_ETAPA] ?? e.para}`
  return `Peça ${e.texto ?? ""} → ${NOME_ITEM[e.para as StatusItem] ?? e.para}`
}

function Linha({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{rotulo}</span>
      <span className="text-right tabular-nums">{children}</span>
    </div>
  )
}

// Cliente e valores: lateral no PC, recolhível no celular.
export default function DadosCliente({ pedido, semRecolher }: { pedido: PedidoDetalhe; semRecolher?: boolean }) {
  const celular = useIsMobile() && !semRecolher
  const [aberto, setAberto] = useState(false)
  const salvar = useAtualizarPedido([["pedido"]])
  const nota = useAdicionarNota()
  const [texto, setTexto] = useState("")
  const [obs, setObs] = useState(pedido.observacoes ?? "")
  const wa = linkWhatsApp(pedido.cliente_telefone, "")
  const temEndereco = Boolean(pedido.entrega_logradouro || pedido.entrega_cep)

  return (
    <Collapsible open={celular ? aberto : true} onOpenChange={setAberto}>
      <Card size="sm">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            Cliente e valores
            {celular && (
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" aria-label="Mostrar ou esconder">
                  <ChevronDown />
                </Button>
              </CollapsibleTrigger>
            )}
          </CardTitle>
        </CardHeader>
        <CollapsibleContent>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-0.5 text-sm">
              <div className="font-medium">{pedido.cliente_nome ?? "Sem nome"}</div>
              {pedido.cliente_telefone &&
                (wa ? (
                  <a className="underline underline-offset-4" href={wa} target="_blank" rel="noreferrer">
                    {pedido.cliente_telefone}
                  </a>
                ) : (
                  <span>{pedido.cliente_telefone}</span>
                ))}
              {pedido.cliente_email && <span className="text-muted-foreground">{pedido.cliente_email}</span>}
              {pedido.cliente_cpf && <span className="text-muted-foreground tabular-nums">CPF {mascaraCpf(pedido.cliente_cpf)}</span>}
            </div>

            {temEndereco && (
              <div className="flex flex-col gap-2 text-sm">
                <div className="whitespace-pre-line text-muted-foreground">{textoEndereco(pedido).split("\n").slice(1).join("\n")}</div>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-fit"
                  onClick={() =>
                    navigator.clipboard
                      .writeText(textoEndereco(pedido))
                      .then(() => toast.success("Endereço copiado"), () => toast.error("Não foi possível copiar"))
                  }
                >
                  <Copy /> Copiar endereço
                </Button>
              </div>
            )}

            <div className="flex flex-col gap-1.5 border-t pt-3">
              <Linha rotulo="Subtotal">{reais(pedido.subtotal)}</Linha>
              {pedido.desconto > 0 && <Linha rotulo={pedido.cupom ? `Desconto (${pedido.cupom})` : "Desconto"}>− {reais(pedido.desconto)}</Linha>}
              {pedido.frete_tipo && (
                <Linha rotulo={`Frete ${pedido.frete_tipo}${pedido.frete_pago_por === "arvenne" ? " (Arvenne paga)" : ""}`}>
                  {reais(pedido.frete_na_conta)}
                </Linha>
              )}
              <Linha rotulo="Total">
                <strong>{reais(pedido.total)}</strong>
              </Linha>
            </div>

            {(pedido.forma_pagamento || pedido.pago_em) && (
              <div className="flex flex-col gap-1.5 border-t pt-3">
                <Linha rotulo="Pagamento">{pedido.forma_pagamento ?? "—"}</Linha>
                {pedido.valor_pago != null && <Linha rotulo="Valor pago">{reais(pedido.valor_pago)}</Linha>}
                {pedido.pago_em && <Linha rotulo="Pago em">{quando(pedido.pago_em)}</Linha>}
              </div>
            )}

            <Field>
              <FieldLabel htmlFor="obs">Observações</FieldLabel>
              <Textarea
                id="obs"
                value={obs}
                onChange={(e) => setObs(e.target.value)}
                onBlur={() =>
                  obs !== (pedido.observacoes ?? "") &&
                  salvar.mutate({ pedidoId: pedido.id, campos: { observacoes: obs.trim() || null } })
                }
              />
            </Field>

            <Collapsible>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="-ml-2">
                  Histórico <ChevronDown />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="flex flex-col gap-3 pt-2">
                <form
                  className="flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault()
                    if (!texto.trim()) return
                    nota.mutate({ pedidoId: pedido.id, texto: texto.trim() }, { onSuccess: () => setTexto("") })
                  }}
                >
                  <Input placeholder="Adicionar nota" value={texto} onChange={(e) => setTexto(e.target.value)} />
                  <Button type="submit" variant="outline">
                    Adicionar
                  </Button>
                </form>
                <ul className="flex flex-col gap-1.5 text-sm">
                  {pedido.pedido_eventos.map((e) => (
                    <li key={e.id}>
                      <span className="text-muted-foreground">
                        {quando(e.created_at)} · {e.usuario_email ?? "sistema"} ·{" "}
                      </span>
                      {descreverEvento(e)}
                    </li>
                  ))}
                </ul>
              </CollapsibleContent>
            </Collapsible>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  )
}
