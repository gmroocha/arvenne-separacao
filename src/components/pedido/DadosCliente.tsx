import { useState } from "react"
import { toast } from "sonner"
import { ChevronDown, ChevronRight, Copy, History, IdCard, Mail, Phone } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Field, FieldLabel } from "@/components/ui/field"
import { Textarea } from "@/components/ui/textarea"
import { useAtualizarPedido, type PedidoDetalhe } from "@/lib/api"
import { copiar } from "@/lib/copiar"
import { digitos, linkWhatsApp, mascaraDocumento, mascaraTelefone, quando, reais } from "@/lib/formato"
import { rotuloDesconto } from "@/lib/desconto"
import HistoricoDialog from "@/components/pedido/HistoricoDialog"
import { contarAlteracoes, useAlteracoesDoPedido } from "@/components/pedido/alteracoesContexto"
import { textoEndereco } from "@/lib/endereco"
import { useIsMobile } from "@/hooks/use-mobile"

// "Pix · R$ 90,00 · 10/11 14:32": uma parte do pagamento (o pedido ou uma venda somada).
const textoPagamento = (forma: string | null, valor: number | null, pagoEm: string | null) =>
  [forma, valor != null ? reais(valor) : null, pagoEm ? quando(pagoEm) : null].filter(Boolean).join(" · ") || "—"

function Linha({ rotulo, children }: { rotulo: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{rotulo}</span>
      <span className="text-right tabular-nums">{children}</span>
    </div>
  )
}

// Linha que abre o diálogo das peças trocadas/removidas.
function LinhaAlteracao({ rotulo, aoClicar }: { rotulo: string; aoClicar: () => void }) {
  return (
    <Button variant="ghost" size="sm" className="-mx-2 justify-between px-2 text-sm font-normal" onClick={aoClicar}>
      {rotulo} <ChevronRight className="text-muted-foreground" />
    </Button>
  )
}

// Linha de contato: ícone, valor e (opcional) botão que copia só o texto indicado.
function LinhaContato({ icone: Icone, children, copiarTexto, aviso, rotuloCopiar }: {
  icone: React.ComponentType<{ className?: string }>
  children: React.ReactNode
  copiarTexto?: string
  aviso?: string
  rotuloCopiar?: string
}) {
  return (
    <div className="flex min-h-7 items-center gap-2">
      <Icone className="size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">{children}</div>
      {copiarTexto && (
        <Button variant="ghost" size="icon-sm" aria-label={rotuloCopiar} onClick={() => copiar(copiarTexto, aviso)}>
          <Copy />
        </Button>
      )}
    </div>
  )
}

// Cliente e valores: lateral no PC, recolhível no celular.
export default function DadosCliente({ pedido, semRecolher }: { pedido: PedidoDetalhe; semRecolher?: boolean }) {
  const celular = useIsMobile() && !semRecolher
  const [aberto, setAberto] = useState(false)
  const salvar = useAtualizarPedido([["pedido"]])
  const [historico, setHistorico] = useState(false)
  const { alteracoes, abrir } = useAlteracoesDoPedido()
  const { trocadas, removidas } = contarAlteracoes(alteracoes)
  const desc = rotuloDesconto(pedido)
  const descLongo = desc.motivo != null && `${desc.base} · ${desc.motivo}`.length > 28
  const [obs, setObs] = useState(pedido.observacoes ?? "")
  const wa = linkWhatsApp(pedido.cliente_telefone, "")
  const partes = pedido.partes ?? []
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
            <div className="flex flex-col gap-1 text-sm">
              <div className="font-medium">{pedido.cliente_nome ?? "Sem nome"}</div>
              {pedido.cliente_telefone && (
                <LinhaContato icone={Phone} copiarTexto={digitos(pedido.cliente_telefone)} aviso="Telefone copiado" rotuloCopiar="Copiar telefone">
                  {wa ? (
                    <a className="underline underline-offset-4" href={wa} target="_blank" rel="noreferrer">
                      {mascaraTelefone(pedido.cliente_telefone)}
                    </a>
                  ) : (
                    <span>{pedido.cliente_telefone}</span>
                  )}
                </LinhaContato>
              )}
              {pedido.cliente_email && (
                <LinhaContato icone={Mail} copiarTexto={pedido.cliente_email} aviso="E-mail copiado" rotuloCopiar="Copiar e-mail">
                  <span className="break-all text-muted-foreground">{pedido.cliente_email}</span>
                </LinhaContato>
              )}
              {pedido.cliente_cpf && (
                <LinhaContato icone={IdCard}>
                  <span className="text-muted-foreground tabular-nums">{mascaraDocumento(pedido.cliente_cpf)}</span>
                </LinhaContato>
              )}
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
              {pedido.desconto_sem_cobertura > 0 && (
                <Linha
                  rotulo={
                    descLongo ? (
                      <span className="flex flex-col">
                        {desc.base}
                        <span className="text-xs">{desc.motivo}</span>
                      </span>
                    ) : (
                      [desc.base, desc.motivo].filter(Boolean).join(" · ")
                    )
                  }
                >
                  − {reais(pedido.desconto_sem_cobertura)}
                </Linha>
              )}
              {pedido.troca_coberto > 0 && (
                <Linha rotulo="Arvenne cobriu na troca">
                  <span className="text-warning">− {reais(pedido.troca_coberto)}</span>
                </Linha>
              )}
              {pedido.desconto_pix > 0 && <Linha rotulo="Desconto Pix (10%)">− {reais(pedido.desconto_pix)}</Linha>}
              {pedido.frete_tipo && (
                <Linha rotulo={`Frete ${pedido.frete_tipo}${pedido.frete_pago_por === "arvenne" ? " (Arvenne paga)" : ""}`}>
                  {reais(pedido.frete_na_conta)}
                </Linha>
              )}
              <Linha rotulo={partes.length ? "Total do pedido" : "Total"}>
                <strong>{reais(pedido.total)}</strong>
              </Linha>
              {partes.map((p) => (
                <Linha key={p.id} rotulo={`Venda ${p.numero} · ${p.qtd_pecas} ${p.qtd_pecas === 1 ? "peça" : "peças"}`}>
                  {reais(p.somada_valor)}
                </Linha>
              ))}
              {partes.length > 0 && (
                <Linha rotulo="Total geral">
                  <strong>{reais(pedido.total_geral)}</strong>
                </Linha>
              )}
            </div>

            {alteracoes.length > 0 && abrir && (
              <div className="flex flex-col border-t pt-2">
                {trocadas > 0 && <LinhaAlteracao rotulo={`Peças trocadas (${trocadas})`} aoClicar={() => abrir({ comValores: true })} />}
                {removidas > 0 && <LinhaAlteracao rotulo={`Peças removidas (${removidas})`} aoClicar={() => abrir({ comValores: true })} />}
              </div>
            )}

            {partes.length > 0 && (
              <div className="flex flex-col gap-1.5 border-t pt-3">
                <Linha rotulo="Pedido">{textoPagamento(pedido.forma_pagamento, pedido.valor_pago, pedido.pago_em)}</Linha>
                {partes.map((p) => (
                  <Linha key={p.id} rotulo={`Venda ${p.numero}`}>
                    {textoPagamento(p.forma_pagamento, p.valor_pago, p.pago_em)}
                  </Linha>
                ))}
                {pedido.total_pago != null && (
                  <Linha rotulo="Pago após acertos">
                    <strong>{reais(pedido.total_pago)}</strong>
                  </Linha>
                )}
              </div>
            )}

            {partes.length === 0 && (pedido.forma_pagamento || pedido.pago_em) && (
              <div className="flex flex-col gap-1.5 border-t pt-3">
                <Linha rotulo="Pagamento">{pedido.forma_pagamento ?? "—"}</Linha>
                {pedido.valor_pago != null && pedido.valor_pago !== pedido.total_pago && <Linha rotulo="Pagamento inicial">{reais(pedido.valor_pago)}</Linha>}
                <Linha rotulo="Pago após acertos">{pedido.total_pago != null ? reais(pedido.total_pago) : "A conferir"}</Linha>
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

            <Button variant="outline" size="sm" className="w-fit" onClick={() => setHistorico(true)}>
              <History /> Histórico
            </Button>
            <HistoricoDialog aberto={historico} aoMudar={setHistorico} pedidoId={pedido.id} eventos={pedido.pedido_eventos} />
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  )
}
