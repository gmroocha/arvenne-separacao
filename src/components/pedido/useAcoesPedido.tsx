import { useState, type ReactNode } from "react"
import { useNavigate } from "react-router"
import { CheckCheck, ClipboardList, ExternalLink, FolderOpen, Link2, MessageCircle, RotateCcw, XCircle } from "lucide-react"
import type { GrupoAcoes } from "@/components/MenuAcoes"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useMoverEtapa, useMudarStatus, useReiniciar } from "@/lib/api"
import { mensagemRomaneio } from "@/lib/agente"
import { useReabrirConcluido } from "@/components/pedido/useReabrirConcluido"
import { copiar } from "@/lib/copiar"
import { linkWhatsApp } from "@/lib/formato"
import { ETAPAS_MOVER, ICONE_ETAPA, NOME_ETAPA, passoAtual, passoDe, passosDe, temEnviarRastreio, type StatusPedido } from "@/lib/status"
import type { Pedido } from "@/lib/tipos"

type Opcoes = {
  aoVerDados?: () => void // só nas etapas de foco, onde a lateral de dados some
  abrir?: boolean // inclui "Abrir pedido" (usado no cartão da esteira)
  aoCancelado?: () => void
}

export type PedidoMenu = Pick<Pedido, "id" | "status" | "fase" | "shopify_url" | "origem"> & {
  etapa_antes_desvio?: Pedido["etapa_antes_desvio"]
  // Romaneio (resumo público do pedido): só onde o pedido vem completo (tela do pedido).
  token_publico?: string | null
  numero?: string
  cliente_nome?: string | null
  cliente_telefone?: string | null
}

// O que o diálogo de "Mover para outra etapa" explica: o que será marcado como feito (para frente) ou zerado (para trás).
function textoMover(origem: number, destino: number, origemPedido?: string | null): string {
  const nomes = passosDe(origemPedido).map((p) => p.nome)
  if (destino > origem) {
    const feitas = nomes.slice(origem, destino).join(", ")
    return `Vai marcar como feito: ${feitas}. O que ainda não foi feito não é conferido: use só quando o trabalho já foi feito por fora. O histórico guarda que estas etapas foram puladas.`
  }
  const zeradas = nomes.slice(destino, nomes.length - 1).join(", ")
  return `Vai voltar para ${nomes[destino]} e zerar o que foi feito de lá em diante (${zeradas}). As etapas anteriores continuam como estão.`
}

// Ações do pedido num lugar só: servem ao "⋯" do cabeçalho e ao clique direito do cartão.
// Devolve os grupos do menu e os diálogos de confirmação (renderize `dialogos` uma vez).
export function useAcoesPedido(pedido: PedidoMenu, opcoes: Opcoes = {}) {
  const navegar = useNavigate()
  const mudarStatus = useMudarStatus()
  const mover = useMoverEtapa(pedido.id)
  const reiniciar = useReiniciar(pedido.id)
  const reabrir = useReabrirConcluido(pedido) // pedido concluído: só o gestor volta para uma etapa anterior
  const [cancelando, setCancelando] = useState(false)
  const [reiniciando, setReiniciando] = useState<boolean | null>(null) // true = pedido todo, false = só a etapa
  const [movendo, setMovendo] = useState<StatusPedido | null>(null) // destino pedido em "Mover para…" ou "Concluir pedido"
  const naEsteira = pedido.fase === "expedicao"
  const origem = passoAtual(pedido)
  const destinoIdx = movendo ? passoDe(movendo, pedido.origem) : -1
  // Romaneio em qualquer etapa (venda, esteira ou concluído): copiar o link ou abrir o WhatsApp com a mensagem pronta.
  const linkRomaneio = pedido.token_publico ? `${window.location.origin}/r/${pedido.token_publico}` : null
  const waRomaneio =
    linkRomaneio && pedido.numero ? linkWhatsApp(pedido.cliente_telefone ?? null, mensagemRomaneio({ numero: pedido.numero, cliente_nome: pedido.cliente_nome ?? null }, linkRomaneio)) : null

  const grupos: GrupoAcoes[] = [
    {
      itens: [
        ...(opcoes.abrir ? [{ rotulo: "Abrir pedido", icone: FolderOpen, aoClicar: () => navegar(`/pedidos/${pedido.id}`) }] : []),
        ...(opcoes.aoVerDados ? [{ rotulo: "Ver dados do pedido", icone: ClipboardList, aoClicar: opcoes.aoVerDados }] : []),
        ...(naEsteira ? [{ rotulo: "Concluir pedido", icone: CheckCheck, aoClicar: () => setMovendo("enviado") }] : []),
      ],
    },
    {
      itens: linkRomaneio
        ? [
            { rotulo: "Copiar link do romaneio", icone: Link2, aoClicar: () => copiar(linkRomaneio, "Link do romaneio copiado") },
            ...(waRomaneio ? [{ rotulo: "Enviar romaneio no WhatsApp", icone: MessageCircle, aoClicar: () => window.open(waRomaneio, "_blank", "noreferrer") }] : []),
          ]
        : [],
    },
    {
      titulo: "Mover para outra etapa",
      estilo: "ghost",
      itens: naEsteira
        ? ETAPAS_MOVER.filter((e) => e !== "enviar_rastreio" || temEnviarRastreio(pedido.origem)).map((e) => ({
            rotulo: NOME_ETAPA[e],
            icone: ICONE_ETAPA[e],
            atual: passoDe(e, pedido.origem) === origem,
            aoClicar: () => setMovendo(e),
          }))
        : [],
    },
    reabrir.grupo,
    {
      itens:
        pedido.fase === "expedicao"
          ? [
              { rotulo: "Reiniciar etapa", icone: RotateCcw, aoClicar: () => setReiniciando(false) },
              { rotulo: "Reiniciar pedido", icone: RotateCcw, aoClicar: () => setReiniciando(true) },
            ]
          : [],
    },
    {
      itens: pedido.shopify_url
        ? [{ rotulo: "Abrir na Shopify", icone: ExternalLink, aoClicar: () => window.open(pedido.shopify_url!, "_blank", "noreferrer") }]
        : [],
    },
    {
      itens: pedido.status !== "cancelado" ? [{ rotulo: "Cancelar pedido", icone: XCircle, destrutivo: true, aoClicar: () => setCancelando(true) }] : [],
    },
  ]

  const dialogos: ReactNode = (
    <>
      {reabrir.dialogo}
      <Dialog open={movendo !== null} onOpenChange={(a) => !a && setMovendo(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{movendo === "enviado" ? "Concluir o pedido?" : movendo ? `Mover para ${NOME_ETAPA[movendo]}?` : ""}</DialogTitle>
            <DialogDescription>
              {movendo === "enviado"
                ? `Tudo o que falta (separação, conferência, bipagem, nota, embalagem e frete, postagem${temEnviarRastreio(pedido.origem) ? " e o envio do rastreio à cliente" : ""}) é marcado como feito e o pedido vai para Concluídos. O histórico guarda que estas etapas foram puladas.`
                : movendo && destinoIdx >= 0 && origem >= 0
                  ? textoMover(origem, destinoIdx, pedido.origem)
                  : ""}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMovendo(null)}>
              Voltar
            </Button>
            <Button
              onClick={() => {
                if (movendo) mover.mutate({ destino: movendo })
                setMovendo(null)
              }}
            >
              {movendo === "enviado" ? "Concluir pedido" : "Mover"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={reiniciando !== null} onOpenChange={(a) => !a && setReiniciando(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{reiniciando ? "Reiniciar o pedido do zero?" : `Reiniciar ${NOME_ETAPA[pedido.status]}?`}</DialogTitle>
            <DialogDescription>
              {reiniciando
                ? "Zera separação, conferência, bipagem, nota fiscal, embalagem e frete, postagem e rastreio, e volta o pedido para Novo. Peças removidas voltam ao pedido e a troca em andamento é cancelada."
                : "Zera só o que foi feito nesta etapa, para refazer. O pedido continua nela."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReiniciando(null)}>
              Voltar
            </Button>
            <Button
              onClick={() => {
                reiniciar.mutate({ tudo: reiniciando === true, etapa: pedido.status })
                setReiniciando(null)
              }}
            >
              Reiniciar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={cancelando} onOpenChange={setCancelando}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancelar pedido?</DialogTitle>
            <DialogDescription>O pedido sai da expedição e vai para o Arquivo.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelando(false)}>
              Voltar
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                mudarStatus.mutate({ pedidoId: pedido.id, para: "cancelado" })
                setCancelando(false)
                opcoes.aoCancelado?.()
              }}
            >
              Cancelar pedido
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
  return { grupos, dialogos }
}
