import { useState, type FormEvent } from "react"
import { toast } from "sonner"
import { KeyRound, Pencil, Plus, ShieldCheck, Trash2, UserCheck, UserPlus, UserX, Users } from "lucide-react"
import AvatarMembro from "@/components/AvatarMembro"
import { ErroConsulta } from "@/components/comum/ErroConsulta"
import { Vazio } from "@/components/comum/Vazio"
import RespDialog from "@/components/RespDialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import CampoSalvo from "@/components/pedido/CampoSalvo"
import { useCriarAcesso, useEquipe, useExcluirMembro, useMetasEtapa, usePreencherResponsaveisPadrao, useResponsaveisPadrao, useSalvarMembro, useSalvarMeta, useSalvarResponsavelPadrao, useTrocarSenha } from "@/lib/api"
import { usuarioSugerido, usuarioValido } from "@/lib/loginInterno"
import { PASSOS_TRABALHO } from "@/lib/status"
import type { Membro, Papel } from "@/lib/tipos"

const NOME_PAPEL: Record<Papel, string> = { gestor: "Gestor", funcionaria: "Funcionária" }

// Formulário de uma pessoa (nova ou existente). O e-mail é o do login dela: é ele que liga a pessoa ao "Comigo".
function FormMembro({ membro, aoSalvar }: { membro?: Membro; aoSalvar: () => void }) {
  const salvar = useSalvarMembro()
  const [nome, setNome] = useState(membro?.nome ?? "")
  const [email, setEmail] = useState(membro?.email ?? "")
  const [papel, setPapel] = useState<Papel>(membro?.papel ?? "funcionaria")
  const enviar = (e: FormEvent) => {
    e.preventDefault()
    if (!nome.trim()) return void toast.error("Informe o nome")
    salvar.mutate(
      { id: membro?.id, nome, email: email.trim() || null, papel },
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
        <FieldDescription>Só para quem entra com e-mail (o gestor). Quem entra com usuário e senha recebe o acesso em "Criar acesso".</FieldDescription>
      </Field>
      <Field>
        <FieldLabel htmlFor="time-papel">Papel</FieldLabel>
        <Select value={papel} onValueChange={(v) => setPapel(v as Papel)}>
          <SelectTrigger id="time-papel" className="h-11 w-full md:h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="funcionaria">Funcionária</SelectItem>
            <SelectItem value="gestor">Gestor</SelectItem>
          </SelectContent>
        </Select>
        <FieldDescription>Gestor vê todos os pedidos e todas as telas. Funcionária vê só os pedidos da etapa em que é responsável.</FieldDescription>
      </Field>
      <Button type="submit" size="xl" disabled={salvar.isPending}>
        {salvar.isPending && <Spinner />} Salvar
      </Button>
    </form>
  )
}

// Acesso por usuário e senha. O gestor cria; a pessoa entra no app só com o usuário e a senha (não precisa de e-mail).
function FormAcesso({ membro, aoSalvar }: { membro: Membro; aoSalvar: () => void }) {
  const criar = useCriarAcesso()
  const trocar = useTrocarSenha()
  const novo = !membro.usuario
  const [usuario, setUsuario] = useState(usuarioSugerido(membro.nome))
  const [senha, setSenha] = useState("")
  const pendente = criar.isPending || trocar.isPending
  const enviar = (e: FormEvent) => {
    e.preventDefault()
    if (novo && !usuarioValido(usuario)) return void toast.error("O usuário precisa ter de 2 a 30 letras ou números, sem espaço nem acento")
    if (senha.length < 6) return void toast.error("A senha precisa ter pelo menos 6 caracteres")
    const concluir = (texto: string) => ({ onSuccess: () => { toast.success(texto); aoSalvar() } })
    if (novo) criar.mutate({ membro: membro.id, usuario, senha }, concluir("Acesso criado. Passe o usuário e a senha para a pessoa."))
    else trocar.mutate({ membro: membro.id, senha }, concluir("Senha trocada. Passe a senha nova para a pessoa."))
  }
  return (
    <form onSubmit={enviar} className="flex flex-col gap-4 pt-2">
      {novo ? (
        <Field>
          <FieldLabel htmlFor="acesso-usuario">Usuário</FieldLabel>
          <Input id="acesso-usuario" className="h-11 md:h-9" value={usuario} maxLength={30} autoComplete="off" autoCapitalize="none" spellCheck={false} onChange={(e) => setUsuario(e.target.value.toLowerCase())} />
          <FieldDescription>Letras minúsculas e números, sem espaço nem acento. É com ele que a pessoa entra.</FieldDescription>
        </Field>
      ) : (
        <p className="text-sm text-muted-foreground">
          Usuário: <span className="font-semibold text-foreground">{membro.usuario}</span>
        </p>
      )}
      <Field>
        <FieldLabel htmlFor="acesso-senha">{novo ? "Senha" : "Senha nova"}</FieldLabel>
        <Input id="acesso-senha" className="h-11 md:h-9" value={senha} maxLength={72} autoComplete="off" autoCapitalize="none" spellCheck={false} onChange={(e) => setSenha(e.target.value)} />
        <FieldDescription>Pelo menos 6 caracteres. Anote e passe para a pessoa; ela entra com o usuário e esta senha.</FieldDescription>
      </Field>
      <Button type="submit" size="xl" disabled={pendente}>
        {pendente && <Spinner />} {novo ? "Criar acesso" : "Trocar senha"}
      </Button>
    </form>
  )
}

// Meta de tempo de cada etapa da esteira, em horas úteis (sem fim de semana nem feriado). O cartão do pedido fica verde até
// a meta, amarelo até o dobro e vermelho acima; a conta é feita no banco.
function MetasDeTempo() {
  const { data, isLoading } = useMetasEtapa()
  const salvar = useSalvarMeta()
  const metas = new Map((data ?? []).map((m) => [m.etapa, m.meta_horas_uteis]))
  if (isLoading || metas.size === 0) return null
  const aoSalvar = (etapa: string, texto: string | null) => {
    const horas = Number((texto ?? "").replace(",", "."))
    if (!texto || !Number.isFinite(horas) || horas <= 0) return void toast.error("Digite as horas da meta (um número maior que zero)")
    salvar.mutate({ etapa, horas }, { onSuccess: () => toast.success("Meta salva") })
  }
  return (
    <section aria-labelledby="metas-titulo" className="flex flex-col gap-3 border-t pt-4">
      <div className="flex flex-col gap-1">
        <h2 id="metas-titulo" className="text-base font-semibold">Metas de tempo por etapa</h2>
        <p className="text-sm text-muted-foreground">
          Quantas horas úteis (sem fim de semana nem feriado) cada etapa deve levar. O pedido fica verde até a meta, amarelo até o dobro
          e vermelho acima.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {PASSOS_TRABALHO.filter((p) => metas.has(p.id)).map((p) => (
          <CampoSalvo
            key={p.id}
            id={`meta-${p.id}`}
            rotulo={`${p.nome} (horas)`}
            valor={String(metas.get(p.id)).replace(".", ",")}
            inputMode="decimal"
            aoSalvar={(v) => aoSalvar(p.id, v)}
          />
        ))}
      </div>
    </section>
  )
}

// Quem cuida de cada etapa quando o pedido chega nela sem responsável. A funcionária só vê os pedidos da etapa em que é
// responsável; sem este padrão, pedido que chega numa etapa sem ninguém só o gestor enxerga.
const NINGUEM = "ninguem"
function QuemCuidaDeCadaEtapa({ membros }: { membros: Membro[] }) {
  const { data, isLoading } = useResponsaveisPadrao()
  const salvar = useSalvarResponsavelPadrao()
  const aplicar = usePreencherResponsaveisPadrao()
  if (isLoading || !data || data.length === 0) return null
  const atual = new Map(data.map((d) => [d.etapa, d.membro_id]))
  const ativos = membros.filter((m) => m.ativo)
  return (
    <section aria-labelledby="padrao-titulo" className="flex flex-col gap-3 border-t pt-4">
      <div className="flex flex-col gap-1">
        <h2 id="padrao-titulo" className="text-base font-semibold">Quem cuida de cada etapa</h2>
        <p className="text-sm text-muted-foreground">
          Quando um pedido chega numa etapa sem responsável, ele fica com a pessoa escolhida aqui. A funcionária vê só os pedidos da etapa
          dela. Dentro de cada pedido você ainda pode trocar a pessoa.
        </p>
      </div>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {PASSOS_TRABALHO.filter((p) => atual.has(p.id)).map((p) => {
          const id = atual.get(p.id) ?? null
          const saiu = id && !ativos.some((m) => m.id === id) ? membros.find((m) => m.id === id) : undefined
          return (
            <li key={p.id} className="flex flex-col gap-1.5">
              <FieldLabel htmlFor={`padrao-${p.id}`}>{p.nome}</FieldLabel>
              <Select value={id ?? NINGUEM} onValueChange={(v) => salvar.mutate({ etapa: p.id, membro: v === NINGUEM ? null : v }, { onSuccess: () => toast.success("Salvo") })}>
                <SelectTrigger id={`padrao-${p.id}`} className="h-11 w-full md:h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NINGUEM}>Ninguém</SelectItem>
                  {ativos.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.nome}
                    </SelectItem>
                  ))}
                  {saiu && <SelectItem value={saiu.id}>{saiu.nome} (inativo)</SelectItem>}
                </SelectContent>
              </Select>
            </li>
          )
        })}
      </ul>
      <div className="flex flex-col items-start gap-1.5">
        <Button
          variant="outline"
          size="toque"
          disabled={aplicar.isPending}
          onClick={() => aplicar.mutate(undefined, { onSuccess: (n) => toast.success(n === 0 ? "Nenhum pedido estava sem responsável" : n === 1 ? "1 pedido recebeu o responsável da etapa" : `${n} pedidos receberam o responsável da etapa`) })}
        >
          {aplicar.isPending ? <Spinner /> : <UserCheck />} Aplicar aos pedidos de hoje
        </Button>
        <p className="text-xs text-muted-foreground">Põe o responsável nos pedidos que já estão na esteira sem ninguém na etapa em que estão.</p>
      </div>
    </section>
  )
}

export default function Time() {
  const { data, isLoading, isError, isFetching, refetch } = useEquipe()
  const salvar = useSalvarMembro()
  const excluir = useExcluirMembro()
  const [excluindo, setExcluindo] = useState<Membro | null>(null)
  const [acesso, setAcesso] = useState<Membro | null>(null)
  // null = fechado; "novo" = adicionando; um Membro = editando.
  const [aberto, setAberto] = useState<Membro | "novo" | null>(null)
  const lista = data ?? []

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          Quem trabalha nos pedidos. Cada pessoa entra com o próprio usuário e senha e vê só os pedidos da etapa em que é responsável.
          Desativar pausa a pessoa e bloqueia a entrada; excluir tira de vez.
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
                    {m.nome} {m.papel === "gestor" && <Badge variant="secondary"><ShieldCheck /> {NOME_PAPEL.gestor}</Badge>} {!m.ativo && <Badge variant="outline">Inativo</Badge>}
                  </ItemTitle>
                  <ItemDescription>{m.usuario ? `Usuário: ${m.usuario}` : m.email ?? "Sem acesso ainda"}</ItemDescription>
                </ItemContent>
                <ItemActions className="w-full flex-wrap justify-between sm:w-auto">
                  <Button variant="outline" size="toque" onClick={() => setAberto(m)}>
                    <Pencil /> Editar
                  </Button>
                  <Button variant="outline" size="toque" onClick={() => setAcesso(m)}>
                    {m.usuario ? <KeyRound /> : <UserPlus />} {m.usuario ? "Trocar senha" : "Criar acesso"}
                  </Button>
                  <Button variant="ghost" size="toque" disabled={salvar.isPending} onClick={() => salvar.mutate({ id: m.id, nome: m.nome, email: m.email, ativo: !m.ativo, usuario: m.usuario })}>
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

      <QuemCuidaDeCadaEtapa membros={lista} />
      <MetasDeTempo />

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
            onClick={() => excluindo && excluir.mutate({ id: excluindo.id, usuario: excluindo.usuario }, { onSuccess: () => { toast.success("Pessoa excluída do time"); setExcluindo(null) } })}
          >
            {excluir.isPending && <Spinner />} Excluir
          </Button>
          <Button variant="outline" size="toque" onClick={() => setExcluindo(null)}>
            Voltar
          </Button>
        </div>
      </RespDialog>

      <RespDialog
        aberto={acesso !== null}
        aoMudar={(a) => !a && setAcesso(null)}
        titulo={acesso ? `${acesso.usuario ? "Trocar senha de" : "Criar acesso para"} ${acesso.nome}` : "Acesso"}
        descricao={acesso?.usuario ? "A pessoa passa a entrar com a senha nova." : "A pessoa entra no app só com o usuário e a senha, sem e-mail."}
      >
        {acesso && <FormAcesso key={acesso.id} membro={acesso} aoSalvar={() => setAcesso(null)} />}
      </RespDialog>

      <RespDialog
        aberto={aberto !== null}
        aoMudar={(a) => !a && setAberto(null)}
        titulo={aberto && aberto !== "novo" ? "Editar pessoa" : "Adicionar pessoa"}
        descricao="Nome, papel e, se a pessoa entra com e-mail, o e-mail do login."
      >
        {aberto !== null && <FormMembro key={aberto === "novo" ? "novo" : aberto.id} membro={aberto === "novo" ? undefined : aberto} aoSalvar={() => setAberto(null)} />}
      </RespDialog>
    </div>
  )
}
