import { useState } from "react"
import { Link2, Package, X } from "lucide-react"
import { CampoBusca } from "@/components/comum/CampoBusca"
import RespDialog from "@/components/RespDialog"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Item, ItemContent, ItemDescription, ItemMedia, ItemTitle } from "@/components/ui/item"
import { Skeleton } from "@/components/ui/skeleton"
import { useBuscaPedidosParaSomar, usePedidoResumo } from "@/lib/api"
import { mascaraCep, mascaraDocumento, mascaraTelefone } from "@/lib/formato"
import { NOME_ETAPA } from "@/lib/status"
import type { Pedido } from "@/lib/tipos"
import { useDebounce } from "@/lib/useDebounce"
import type { FormVenda } from "./form"

type Props = { form: FormVenda; aoMudar: (parcial: Partial<FormVenda>) => void }

// Cliente e endereço do pedido escolhido passam para a venda; sem frete (as peças vão no mesmo pacote).
function parcialDe(p: Pedido): Partial<FormVenda> {
  return {
    somar_em: p.id,
    cliente_id: p.cliente_id,
    cliente_nome: p.cliente_nome ?? "",
    cliente_telefone: p.cliente_telefone ? mascaraTelefone(p.cliente_telefone) : "",
    cliente_email: p.cliente_email ?? "",
    cliente_cpf: p.cliente_cpf ? mascaraDocumento(p.cliente_cpf) : "",
    cliente_razao_social: p.cliente_razao_social ?? "",
    cliente_ie: p.cliente_ie ?? "",
    entrega_cep: mascaraCep(p.entrega_cep ?? ""),
    entrega_logradouro: p.entrega_logradouro ?? "",
    entrega_numero: p.entrega_numero ?? "",
    entrega_complemento: p.entrega_complemento ?? "",
    entrega_bairro: p.entrega_bairro ?? "",
    entrega_cidade: p.entrega_cidade ?? "",
    entrega_uf: p.entrega_uf ?? "",
    frete_tipo: null,
    frete_pago_por: "cliente",
    frete_cobrado: "",
  }
}

// Botão "Somar a um pedido" (venda comum) ou a faixa "Vai somar ao pedido X" com Desfazer.
export default function SomarPedido({ form, aoMudar }: Props) {
  const [aberto, setAberto] = useState(false)
  const [busca, setBusca] = useState("")
  const termo = useDebounce(busca.trim(), 300)
  const { data, isFetching } = useBuscaPedidosParaSomar(termo, aberto)
  const alvo = usePedidoResumo(form.somar_em)

  if (form.somar_em) {
    return (
      <Card size="sm">
        <CardContent className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <Link2 className="size-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              {alvo.data ? (
                <p className="text-sm font-semibold">
                  Vai somar ao pedido {alvo.data.numero.replace(/^#/, "")} · {alvo.data.cliente_nome ?? "sem nome"}
                </p>
              ) : (
                <Skeleton className="h-5 w-48" />
              )}
              <p className="text-xs text-muted-foreground">Mesmo pacote, sem frete. As peças entram no pedido quando a venda for paga.</p>
            </div>
          </div>
          <Button variant="outline" size="toque" className="shrink-0" onClick={() => aoMudar({ somar_em: null })}>
            <X /> Desfazer
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <Button variant="outline" size="toque" className="w-fit" onClick={() => setAberto(true)}>
        <Package /> Somar a um pedido
      </Button>
      <RespDialog aberto={aberto} aoMudar={setAberto} titulo="Somar a um pedido" descricao="Escolha o pedido que ainda não saiu. As peças desta venda entram nele quando for paga.">
        <div className="flex flex-col gap-3 pt-2">
          <CampoBusca valor={busca} aoMudar={setBusca} placeholder="Número ou cliente" carregando={isFetching} autoFocus />
          <div className="flex flex-col gap-1">
            {data && data.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">Nenhum pedido em andamento encontrado.</p>}
            {data?.map((p) => (
              <Item key={p.id} asChild size="xs">
                <button
                  type="button"
                  className="text-left"
                  onClick={() => {
                    aoMudar(parcialDe(p))
                    setAberto(false)
                    setBusca("")
                  }}
                >
                  <ItemMedia variant="image">{p.fotos?.[0] ? <img src={p.fotos[0]} alt="" loading="lazy" /> : <Package />}</ItemMedia>
                  <ItemContent className="gap-0">
                    <ItemTitle>
                      {p.numero.replace(/^#/, "")} · {p.cliente_nome ?? "Sem nome"}
                    </ItemTitle>
                    <ItemDescription>
                      {NOME_ETAPA[p.status]} · {p.qtd_pecas} {p.qtd_pecas === 1 ? "peça" : "peças"}
                    </ItemDescription>
                  </ItemContent>
                </button>
              </Item>
            ))}
          </div>
        </div>
      </RespDialog>
    </>
  )
}
