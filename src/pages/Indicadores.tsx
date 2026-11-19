import { useState } from "react"
import { Link } from "react-router"
import { ChartNoAxesColumn, ChevronRight, Info, Trophy } from "lucide-react"
import { ErroConsulta } from "@/components/comum/ErroConsulta"
import { Vazio } from "@/components/comum/Vazio"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { msgBanco } from "@/lib/api"
import {
  PERIODOS, horas, intervaloDe, numero, percentual, rotuloMes,
  useFilaIndicadores, usePessoasIndicadores, usePontuacaoMes, useResumoIndicadores,
  type EtapaDaFila, type Periodo, type PessoaIndicadores, type Pontuacao, type ResumoIndicadores,
} from "@/lib/indicadores"
import { NOME_ETAPA, tempoDesde, type StatusPedido } from "@/lib/status"

const nomeEtapa = (e: string) => (e === "novo" ? "Fila" : (NOME_ETAPA[e as StatusPedido] ?? e))

function Numero({ rotulo, valor, nota }: { rotulo: string; valor: string; nota: string }) {
  return (
    <Card size="sm" data-slot="indicador">
      <CardContent className="flex flex-col gap-1">
        <p className="text-xs text-muted-foreground">{rotulo}</p>
        <p className="text-2xl font-semibold tabular-nums leading-tight">{valor}</p>
        <p className="text-xs text-muted-foreground">{nota}</p>
      </CardContent>
    </Card>
  )
}

function Topo({ r }: { r: ResumoIndicadores }) {
  const gargalo = r.gargalo
  const meta = gargalo ? r.tempos.find((t) => t.etapa === gargalo.etapa)?.meta : null
  return (
    <section aria-label="Resultado do período" className="grid grid-cols-2 gap-3 lg:grid-cols-3">
      <Numero rotulo="Enviados no prazo" valor={percentual(r.prazo_pct)} nota={r.prazo_total ? `${numero(r.prazo_dentro)} de ${numero(r.prazo_total)} ${r.prazo_total === 1 ? "pedido" : "pedidos"} (48 h úteis)` : "Nenhum pedido enviado"} />
      <Numero rotulo="Enviados" valor={`${numero(r.enviados_pedidos)} ${r.enviados_pedidos === 1 ? "pedido" : "pedidos"}`} nota={`${numero(r.enviados_pecas)} ${r.enviados_pecas === 1 ? "peça" : "peças"}`} />
      <Numero
        rotulo="Erros a cada 100 peças"
        valor={numero(r.erros_por_100, 1)}
        nota={r.pecas_separadas ? `${numero(r.erros_bipagem + r.faltas_indevidas)} em ${numero(r.pecas_separadas)} peças separadas` : "Nenhuma peça separada"}
      />
      <Numero rotulo="Problemas na cliente" valor={numero(r.problemas_cliente)} nota="Depois do pedido enviado" />
      <Numero rotulo="Erros pegos antes da cliente" valor={percentual(r.pegos_antes_pct)} nota={`${numero(r.erros_bipagem)} na bipagem, ${numero(r.problemas_cliente)} na cliente`} />
      <Numero
        rotulo="Gargalo"
        valor={gargalo ? nomeEtapa(gargalo.etapa) : "—"}
        nota={gargalo ? `Média de ${horas(gargalo.horas)} úteis${meta ? ` (meta ${horas(meta)})` : ""}` : "Sem etapas concluídas"}
      />
    </section>
  )
}

// Barra empilhada pelas cores do termômetro; a largura total é proporcional à maior fila.
function LinhaFila({ e, maior }: { e: EtapaDaFila; maior: number }) {
  const largura = maior > 0 ? (e.total / maior) * 100 : 0
  const semCor = e.total - e.verde - e.amarelo - e.vermelho
  const seg = (n: number) => (e.total > 0 ? `${(n / e.total) * 100}%` : "0%")
  return (
    <li>
      <Link
        to={e.etapa === "novo" ? "/?etapa=novo" : `/?etapa=${e.etapa}`}
        className="flex min-h-12 flex-col gap-1.5 rounded-lg px-1 py-2 hover:bg-muted/60 focus-visible:outline-2"
        aria-label={`${nomeEtapa(e.etapa)}: ${e.total} pedidos`}
      >
        <div className="flex items-center gap-2">
          <span className={e.total === 0 ? "text-sm text-muted-foreground" : "text-sm font-medium"}>{nomeEtapa(e.etapa)}</span>
          <span className="text-sm font-semibold tabular-nums">{numero(e.total)}</span>
          <span className="ml-auto flex items-center gap-2 text-xs tabular-nums text-muted-foreground">
            {e.verde > 0 && <span className="inline-flex items-center gap-1"><span className="size-2 rounded-full bg-success" aria-hidden />{e.verde}<span className="sr-only"> dentro da meta</span></span>}
            {e.amarelo > 0 && <span className="inline-flex items-center gap-1"><span className="size-2 rounded-full bg-warning" aria-hidden />{e.amarelo}<span className="sr-only"> passaram da meta</span></span>}
            {e.vermelho > 0 && <span className="inline-flex items-center gap-1"><span className="size-2 rounded-full bg-destructive" aria-hidden />{e.vermelho}<span className="sr-only"> muito acima da meta</span></span>}
            <ChevronRight className="size-4" aria-hidden />
          </span>
        </div>
        {e.total > 0 && (
          <>
            <div className="flex h-1.5 overflow-hidden rounded-full bg-muted" style={{ width: `${Math.max(largura, 6)}%` }} aria-hidden>
              <span className="bg-success" style={{ width: seg(e.verde) }} />
              <span className="bg-warning" style={{ width: seg(e.amarelo) }} />
              <span className="bg-destructive" style={{ width: seg(e.vermelho) }} />
              <span className="bg-muted-foreground/40" style={{ width: seg(semCor) }} />
            </div>
            {e.mais_antigo && (
              <p className="text-xs text-muted-foreground">
                Mais antigo: <span className="tabular-nums">{e.mais_antigo.numero.replace(/^#/, "")}</span> há {tempoDesde(e.mais_antigo.desde)}
              </p>
            )}
          </>
        )}
      </Link>
    </li>
  )
}

function Fila({ fila }: { fila: EtapaDaFila[] }) {
  const maior = Math.max(0, ...fila.map((e) => e.total))
  return (
    <Card>
      <CardHeader>
        <CardTitle>Fila agora</CardTitle>
        <CardDescription>Pedidos em cada etapa e o mais antigo. Toque para abrir na Expedição.</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col divide-y">
          {fila.map((e) => (
            <LinhaFila key={e.etapa} e={e} maior={maior} />
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}

// Tempo médio por etapa: barras simples; a etapa gargalo fica destacada.
function Tempos({ r }: { r: ResumoIndicadores }) {
  const maior = Math.max(0, ...r.tempos.map((t) => t.horas))
  return (
    <Card>
      <CardHeader>
        <CardTitle>Tempo por etapa</CardTitle>
        <CardDescription>Média em horas úteis das etapas concluídas no período.</CardDescription>
      </CardHeader>
      <CardContent>
        {r.tempos.length === 0 ? (
          <Vazio>Nenhuma etapa concluída neste período.</Vazio>
        ) : (
          <ul className="flex flex-col gap-3">
            {r.tempos.map((t) => {
              const gargalo = r.gargalo?.etapa === t.etapa
              return (
                <li key={t.etapa} className="flex flex-col gap-1">
                  <div className="flex items-baseline gap-2 text-sm">
                    <span className={gargalo ? "font-semibold" : ""}>{nomeEtapa(t.etapa)}</span>
                    {gargalo && <Badge variant="secondary">Gargalo</Badge>}
                    <span className="ml-auto tabular-nums">{horas(t.horas)}</span>
                    {t.meta != null && <span className="text-xs tabular-nums text-muted-foreground">meta {horas(t.meta)}</span>}
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
                    <div className={gargalo ? "h-full rounded-full bg-foreground" : "h-full rounded-full bg-muted-foreground/50"} style={{ width: `${maior > 0 ? (t.horas / maior) * 100 : 0}%` }} />
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

const ETAPAS_PESSOA = [
  ["separacao", "Separação"], ["conferencia", "Conferência"], ["bipagem", "Bipagem"], ["faturamento", "Nota fiscal"],
  ["embalagem", "Embalagem e frete"], ["pronto_envio", "Postagem"], ["enviar_rastreio", "Enviar rastreio"],
] as const

function Pessoa({ p }: { p: PessoaIndicadores }) {
  const etapas = ETAPAS_PESSOA.filter(([id]) => p[id] > 0)
  return (
    <li className="flex flex-col gap-3 py-3 first:pt-0 last:pb-0">
      <p className="font-medium">{p.nome}</p>
      <p className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted-foreground">
        {etapas.length === 0 ? "Sem peças no período" : etapas.map(([id, nome]) => (
          <span key={id}>{nome} <span className="font-medium tabular-nums text-foreground">{numero(p[id])}</span></span>
        ))}
      </p>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
        <div><dt className="text-xs text-muted-foreground">Tempo por peça (separação)</dt><dd className="tabular-nums">{p.minutos_por_peca_separacao == null ? "—" : `${numero(p.minutos_por_peca_separacao, 1)} min`}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Erros de separação</dt><dd className="tabular-nums">{numero(p.erros_separacao)}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Faltas indevidas</dt><dd className="tabular-nums">{numero(p.faltas_indevidas)}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Problemas na cliente</dt><dd className="tabular-nums">{numero(p.problemas_cliente)}</dd></div>
      </dl>
    </li>
  )
}

function Pessoas({ pessoas }: { pessoas: PessoaIndicadores[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Por colaboradora</CardTitle>
        <CardDescription>Peças por etapa e ocorrências do período.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {pessoas.length === 0 ? (
          <Vazio>Ninguém concluiu etapas neste período.</Vazio>
        ) : (
          <ul className="flex flex-col divide-y">
            {pessoas.map((p) => (
              <Pessoa key={p.pessoa_id} p={p} />
            ))}
          </ul>
        )}
        <p className="flex items-start gap-2 text-xs text-muted-foreground">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          Enquanto as colaboradoras não têm login, quem fez = responsável da etapa.
        </p>
      </CardContent>
    </Card>
  )
}

function Ranking({ lista }: { lista: Pontuacao[] }) {
  return (
    <ol className="flex flex-col divide-y">
      {lista.map((p) => (
        <li key={p.pessoa_id} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0">
          <div className="flex items-center gap-3">
            <span className="w-5 text-sm font-semibold tabular-nums text-muted-foreground">{p.posicao}º</span>
            <span className="min-w-0 flex-1 truncate font-medium">{p.nome}</span>
            {p.bonus && <Badge variant="success">Bônus</Badge>}
            <span className="text-xl font-semibold tabular-nums">{numero(p.pontuacao, 1)}</span>
          </div>
          <Progress value={p.pontuacao} aria-label={`Pontuação de ${p.nome}`} />
          <p className="text-xs tabular-nums text-muted-foreground">
            Qualidade {numero(p.qualidade, 1)} · Produção {numero(p.producao, 1)} · Prazo {numero(p.prazo, 1)}
            {p.problemas_cliente > 0 && ` · ${numero(p.problemas_cliente)} problema(s) na cliente`}
          </p>
        </li>
      ))}
    </ol>
  )
}

function PontuacaoDoMes({ mes }: { mes: string }) {
  const { data, isLoading, isError } = usePontuacaoMes(mes)
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Trophy className="size-4" aria-hidden /> Pontuação de {rotuloMes(mes)}</CardTitle>
        <CardDescription>
          De 0 a 100: 50% qualidade (100 menos 10 pontos por ocorrência a cada 100 peças), 30% produção (peças por hora comparadas à média do time) e
          20% prazo (etapas dentro da meta). Bônus: 85 pontos ou mais e nenhum problema na cliente.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : isError ? (
          <Vazio>Não foi possível calcular a pontuação agora.</Vazio>
        ) : (data?.length ?? 0) === 0 ? (
          <Vazio>Ainda sem movimento neste mês.</Vazio>
        ) : (
          <Ranking lista={data!} />
        )}
      </CardContent>
    </Card>
  )
}

// Indicadores do gestor (livro Gestão de Alta Performance): resultado e não atividade, quantidade ao lado de qualidade,
// o que antecipa problema (fila e pedido mais antigo) e o gargalo. Só números do banco.
export default function Indicadores() {
  const [periodo, setPeriodo] = useState<Periodo>("hoje")
  const { de, ate, mes } = intervaloDe(periodo) // textos estáveis durante o dia: não refazem a consulta
  const resumo = useResumoIndicadores(de, ate)
  const fila = useFilaIndicadores()
  const pessoas = usePessoasIndicadores(de, ate)
  const erro = resumo.error ?? fila.error ?? pessoas.error
  const r = resumo.data
  const semMovimento = !!r && r.enviados_pedidos === 0 && r.pecas_separadas === 0 && r.problemas_cliente === 0 && r.erros_bipagem === 0 && r.tempos.length === 0

  return (
    <div className="flex flex-col gap-4">
      <Tabs value={periodo} onValueChange={(v) => setPeriodo(v as Periodo)}>
        <TabsList>
          {PERIODOS.map((p) => (
            <TabsTrigger key={p.id} value={p.id}>{p.nome}</TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      {erro && !r ? (
        msgBanco(erro).startsWith("Atualize") ? (
          <Vazio icone={ChartNoAxesColumn} titulo="Indicadores indisponíveis">Atualize o banco para ver esta tela.</Vazio>
        ) : (
          <ErroConsulta aoTentar={() => { void resumo.refetch(); void fila.refetch(); void pessoas.refetch() }} carregando={resumo.isFetching} />
        )
      ) : !r ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : (
        <>
          {semMovimento && <Vazio icone={ChartNoAxesColumn} titulo="Sem movimento neste período">Os números aparecem assim que houver pedidos enviados ou etapas concluídas.</Vazio>}
          <Topo r={r} />
          <div className="grid items-start gap-4 lg:grid-cols-2">
            {fila.data ? <Fila fila={fila.data} /> : <Skeleton className="h-64 w-full" />}
            <Tempos r={r} />
          </div>
          <Pessoas pessoas={pessoas.data ?? []} />
          <PontuacaoDoMes mes={mes} />
        </>
      )}
    </div>
  )
}
