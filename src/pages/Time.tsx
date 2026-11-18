import { useState, type FormEvent } from "react"
import { toast } from "sonner"
import { Pencil, Plus, Trash2, UserCheck, UserX, Users } from "lucide-react"
import AvatarMembro from "@/components/AvatarMembro"
import { ErroConsulta } from "@/components/comum/ErroConsulta"
import { Vazio } from "@/components/comum/Vazio"
import RespDialog from "@/components/RespDialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { useEquipe, useExcluirMembro, useSalvarMembro } from "@/lib/api"
import type { Membro } from "@/lib/tipos"

// Papéis (gestor/funcionária) suspensos por enquanto: todo mundo faz tudo no Time. A coluna papel fica guardada no
// banco; para voltar, ver a migration 20261124100000_papeis_suspensos.sql e o histórico deste arquivo.

// Formulário de uma pessoa (nova ou existente). O e-mail é o do login dela: é ele que liga a pessoa ao "Comigo".
function FormMembro({ membro, aoSalvar }: { membro?: Membro; aoSalvar: () => void }) {
  const salvar = useSalvarMembro()
  const [nome, setNome] = useState(membro?.nome ?? "")
  const [email, setEmail] = useState(membro?.email ?? "")
  const enviar = (e: FormEvent) => {
    e.preventDefault()
    if (!nome.trim()) return void toast.error("Informe o nome")
    salvar.mutate(
      { id: membro?.id, nome, email: email.trim() || null },
      {
        onSuccess: () => {
          toast.success(membro ? "Pessoa atualizada" : "Pessoa adicionada ao time")
          aoSalvar()
        },
      },
    )
  }
  return (
    <form onSubmit={enviar} className="flex flex-col gap-4 pt-2">
      <Field>
        <FieldLabel htmlFor="time-nome">Nome</FieldLabel>
        <Input id="time-nome" className="h-11 md:h-9" value={nome} maxLength={60} autoComplete="off" onChange={(e) => setNome(e.target.value)} />
      </Field>
      <Field>
        <FieldLabel htmlFor="time-email">E-mail do login (opcional)</FieldLabel>
        <Input id="time-email" type="email" inputMode="email" className="h-11 md:h-9" value={email} autoComplete="off" onChange={(e) => setEmail(e.target.value)} />
        <FieldDescription>Use o mesmo e-mail com que a pessoa entra no app. Assim o filtro "Comigo" da Expedição funciona.</FieldDescription>
      </Field>
      <Button type="submit" size="xl" disabled={salvar.isPending}>
        {salvar.isPending && <Spinner />} Salvar
      </Button>
    </form>
  )
}

export default function Time() {
  const { data, isLoading, isError, isFetching, refetch } = useEquipe()
  const salvar = useSalvarMembro()
  const excluir = useExcluirMembro()
  const [excluindo, setExcluindo] = useState<Membro | null>(null)
  // null = fechado; "novo" = adicionando; um Membro = editando.
  const [aberto, setAberto] = useState<Membro | "novo" | null>(null)
  const lista = data ?? []

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          Quem trabalha nos pedidos. Dentro de cada pedido você escolhe quem faz cada etapa.
          Desativar pausa a pessoa; excluir tira de vez.
        </p>
        <Button size="toque" className="shrink-0" onClick={() => setAberto("novo")}>
          <Plus /> Adicionar pessoa
        </Button>
      </div>

      {isError && <ErroConsulta aoTentar={() => void refetch()} carregando={isFetching} comDados={!!data} />}
      {isLoading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : isError && !data ? null : lista.length === 0 ? (
        <Vazio icone={Users} titulo="Ninguém no time ainda">
          Adicione as pessoas que separam e embalam os pedidos.
        </Vazio>
      ) : (
        <ItemGroup className="gap-2">
          {lista.map((m) => (
            <li key={m.id}>
              <Item variant="outline" className={m.ativo ? "" : "opacity-60"}>
                <ItemMedia>
                  <AvatarMembro nome={m.nome} size="lg" />
                </ItemMedia>
                <ItemContent>
                  <ItemTitle>
                    {m.nome} {!m.ativo && <Badge variant="outline">Inativo</Badge>}
                  </ItemTitle>
                  <ItemDescription>{m.email ?? "Sem e-mail do login"}</ItemDescription>
                </ItemContent>
                <ItemActions className="w-full flex-wrap justify-between sm:w-auto">
                  <Button variant="outline" size="toque" onClick={() => setAberto(m)}>
                    <Pencil /> Editar
                  </Button>
                  <Button variant="ghost" size="toque" disabled={salvar.isPending} onClick={() => salvar.mutate({ id: m.id, nome: m.nome, email: m.email, ativo: !m.ativo })}>
                    {m.ativo ? <UserX /> : <UserCheck />} {m.ativo ? "Desativar" : "Reativar"}
                  </Button>
                  <Button variant="ghost" size="toque" className="text-destructive hover:text-destructive" onClick={() => setExcluindo(m)}>
                    <Trash2 /> Excluir
                  </Button>
                </ItemActions>
              </Item>
            </li>
          ))}
        </ItemGroup>
      )}

      <RespDialog
        aberto={excluindo !== null}
        aoMudar={(a) => !a && setExcluindo(null)}
        titulo={excluindo ? `Excluir ${excluindo.nome}?` : "Excluir pessoa?"}
        descricao="A pessoa sai do Time e deixa de ser responsável pelos pedidos em que estava. Os pedidos e o histórico continuam como estão. Para só pausar, use Desativar."
      >
        <div className="flex flex-col gap-2 pt-2 sm:flex-row-reverse sm:justify-start">
          <Button
            variant="destructive"
            size="toque"
            disabled={excluir.isPending}
            onClick={() => excluindo && excluir.mutate(excluindo.id, { onSuccess: () => { toast.success("Pessoa excluída do time"); setExcluindo(null) } })}
          >
            {excluir.isPending && <Spinner />} Excluir
          </Button>
          <Button variant="outline" size="toque" onClick={() => setExcluindo(null)}>
            Voltar
          </Button>
        </div>
      </RespDialog>

      <RespDialog
        aberto={aberto !== null}
        aoMudar={(a) => !a && setAberto(null)}
        titulo={aberto && aberto !== "novo" ? "Editar pessoa" : "Adicionar pessoa"}
        descricao="Nome e, se quiser, o e-mail do login."
      >
        {aberto !== null && <FormMembro key={aberto === "novo" ? "novo" : aberto.id} membro={aberto === "novo" ? undefined : aberto} aoSalvar={() => setAberto(null)} />}
      </RespDialog>
    </div>
  )
}
