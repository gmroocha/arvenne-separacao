import { useState } from "react"
import { Link } from "react-router"
import { ChevronDown, ListChecks, UserRound } from "lucide-react"
import AvatarMembro from "@/components/AvatarMembro"
import MenuAcoes from "@/components/MenuAcoes"
import RespDialog from "@/components/RespDialog"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { useDesignar, useEquipe, useSouGestor, type PedidoDetalhe } from "@/lib/api"
import { etapaDoResponsavel, passosTrabalhoDe } from "@/lib/status"

const NINGUEM = "ninguem"

// Botão "quem faz esta etapa" ao lado do campo de busca (cabeçalho fixo do pedido): mostra a pessoa da etapa atual;
// tocar abre a lista do time (Ninguém, cada pessoa ativa) e "Todas as etapas…" abre o diálogo com uma pessoa por etapa.
// Sem ninguém cadastrado no time (ou banco ainda sem a tabela), o botão nem aparece.
export default function Responsaveis({ pedido, className }: { pedido: PedidoDetalhe; className?: string }) {
  const [aberto, setAberto] = useState(false)
  const membros = useEquipe().data ?? []
  const designar = useDesignar(pedido.id)
  const gestor = useSouGestor() === true // só o gestor designa (o banco também recusa)
  const etapa = etapaDoResponsavel(pedido)
  if (!gestor || pedido.fase !== "expedicao" || etapa === null || membros.length === 0) return null

  const resp = pedido.responsaveis ?? {}
  const nomeDe = (id: string | undefined) => membros.find((m) => m.id === id)?.nome
  const atual = nomeDe(resp[etapa])
  const PASSOS_TRABALHO = passosTrabalhoDe(pedido.origem)
  const nomeEtapa = PASSOS_TRABALHO.find((p) => p.id === etapa)?.nome ?? ""
  const atualId = resp[etapa]
  const ativos = membros.filter((m) => m.ativo)
  const inativo = atualId && !ativos.some((m) => m.id === atualId) ? membros.find((m) => m.id === atualId) : undefined

  return (
    <>
      <MenuAcoes
        titulo={`Quem faz ${nomeEtapa}`}
        grupos={[
          {
            estilo: "ghost",
            itens: [
              { rotulo: "Ninguém", icone: UserRound, atual: !atualId, aoClicar: () => designar.mutate({ etapa, membro: null }) },
              ...ativos.map((m) => ({ rotulo: m.nome, atual: m.id === atualId, aoClicar: () => designar.mutate({ etapa, membro: m.id }) })),
              ...(inativo ? [{ rotulo: `${inativo.nome} (inativo)`, atual: true, aoClicar: () => {} }] : []),
            ],
          },
          { estilo: "ghost", itens: [{ rotulo: "Todas as etapas…", icone: ListChecks, aoClicar: () => setAberto(true) }] },
        ]}
        gatilho={
          <Button variant="outline" className={cn("h-11 shrink-0 gap-2 px-3 lg:h-9", className)} aria-label={`${nomeEtapa}: ${atual ?? "sem responsável"}. Mudar responsável`}>
            {atual ? <AvatarMembro nome={atual} className="size-5" /> : <UserRound />}
            <span className="hidden max-w-32 truncate sm:inline">{atual ?? "Designar"}</span>
            <ChevronDown className="text-muted-foreground" />
          </Button>
        }
      />
      <RespDialog aberto={aberto} aoMudar={setAberto} titulo="Quem faz cada etapa" descricao="Escolha uma pessoa para cada etapa. A mudança é salva na hora.">
        <ul className="flex flex-col gap-3 pt-2">
          {PASSOS_TRABALHO.map((p) => {
            const id = resp[p.id]
            const inativoDaEtapa = id && !ativos.some((m) => m.id === id) ? membros.find((m) => m.id === id) : undefined
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
                    {inativoDaEtapa && <SelectItem value={inativoDaEtapa.id}>{inativoDaEtapa.nome} (inativo)</SelectItem>}
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
