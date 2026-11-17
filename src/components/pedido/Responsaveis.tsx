import { useState } from "react"
import { Link } from "react-router"
import { UserRound } from "lucide-react"
import AvatarMembro from "@/components/AvatarMembro"
import RespDialog from "@/components/RespDialog"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useDesignar, useEquipe, type PedidoDetalhe } from "@/lib/api"
import { PASSOS_TRABALHO, etapaDoResponsavel } from "@/lib/status"

const NINGUEM = "ninguem"

// Linha "Separação: [Ana]" da etapa atual no cabeçalho do pedido; tocar abre a lista de todas as etapas.
// Sem ninguém cadastrado no time (ou banco ainda sem a tabela), a linha nem aparece.
export default function Responsaveis({ pedido }: { pedido: PedidoDetalhe }) {
  const [aberto, setAberto] = useState(false)
  const membros = useEquipe().data ?? []
  const designar = useDesignar(pedido.id)
  const etapa = etapaDoResponsavel(pedido)
  if (pedido.fase !== "expedicao" || etapa === null || membros.length === 0) return null

  const resp = pedido.responsaveis ?? {}
  const nomeDe = (id: string | undefined) => membros.find((m) => m.id === id)?.nome
  const atual = nomeDe(resp[etapa])
  const nomeEtapa = PASSOS_TRABALHO.find((p) => p.id === etapa)?.nome ?? ""

  return (
    <>
      <Button variant="ghost" size="xs" className="-ml-2 w-fit gap-1.5 text-xs text-muted-foreground" onClick={() => setAberto(true)} aria-label={`${nomeEtapa}: ${atual ?? "sem responsável"}. Mudar responsáveis`}>
        {nomeEtapa}:
        {atual ? (
          <>
            <AvatarMembro nome={atual} className="size-5" />
            <span className="font-medium text-foreground">{atual}</span>
          </>
        ) : (
          <>
            <UserRound /> Designar
          </>
        )}
      </Button>
      <RespDialog aberto={aberto} aoMudar={setAberto} titulo="Quem faz cada etapa" descricao="Escolha uma pessoa para cada etapa. A mudança é salva na hora.">
        <ul className="flex flex-col gap-3 pt-2">
          {PASSOS_TRABALHO.map((p) => {
            const id = resp[p.id]
            const ativos = membros.filter((m) => m.ativo)
            const inativo = id && !ativos.some((m) => m.id === id) ? membros.find((m) => m.id === id) : undefined
            return (
              <li key={p.id} className="flex items-center justify-between gap-3">
                <span className={p.id === etapa ? "text-sm font-semibold" : "text-sm"}>{p.nome}</span>
                <Select value={id ?? NINGUEM} onValueChange={(v) => designar.mutate({ etapa: p.id, membro: v === NINGUEM ? null : v })}>
                  <SelectTrigger className="h-11 w-44 md:h-9" aria-label={`Responsável por ${p.nome}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NINGUEM}>Ninguém</SelectItem>
                    {ativos.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.nome}
                      </SelectItem>
                    ))}
                    {inativo && <SelectItem value={inativo.id}>{inativo.nome} (inativo)</SelectItem>}
                  </SelectContent>
                </Select>
              </li>
            )
          })}
        </ul>
        <p className="pt-3 text-xs text-muted-foreground">
          Falta alguém? Cadastre em <Link to="/time" className="underline underline-offset-2">Time</Link>.
        </p>
      </RespDialog>
    </>
  )
}
