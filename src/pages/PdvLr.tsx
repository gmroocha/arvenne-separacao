import { useEffect, useRef, useState } from "react"
import { useNavigate, useSearchParams } from "react-router"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { Check, Link2, Pencil, Search, Trash2, TriangleAlert, X } from "lucide-react"
import MontarPedidoLr from "@/components/bling/MontarPedidoLr"
import { ErroConsulta } from "@/components/comum/ErroConsulta"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import {
  blingApagarCodigo, blingConectarFim, blingConectarInicio, blingContatos, blingDefinirContato, blingSalvarCodigo,
  useBlingCodigos, useBlingPedidos, useBlingSituacao, type CodigoLembrado, type ContatoBling,
} from "@/lib/bling"
import { quando, reais } from "@/lib/formato"

const erro = (e: unknown) => (e instanceof Error ? e.message : "Não foi possível concluir agora.")

// Conexão com o Bling da LR: o Bling devolve o gestor para cá com ?code&state; a página troca isso por tokens (guardados só no servidor).
function CartaoConexao() {
  const qc = useQueryClient()
  const navegar = useNavigate()
  const [params] = useSearchParams()
  const situacao = useBlingSituacao()
  const [ocupado, setOcupado] = useState(false)
  const [escolhendo, setEscolhendo] = useState(false)
  const [busca, setBusca] = useState("")
  const [contatos, setContatos] = useState<ContatoBling[] | null>(null)
  const tratado = useRef(false)
  const code = params.get("code"), state = params.get("state"), negado = params.get("error")

  // O code do Bling vale 30 segundos e uma vez só: chama já, e uma vez só (o React pode montar duas vezes).
  async function concluirRetorno() {
    if (negado || !code || !state) {
      toast.error("O Bling não autorizou a conexão. Toque em Conectar ao Bling para tentar de novo.")
      navegar("/pdv-lr", { replace: true })
      return
    }
    setOcupado(true)
    try {
      await blingConectarFim(code, state)
      toast.success("Bling conectado")
      setEscolhendo(true)
      await qc.invalidateQueries({ queryKey: ["bling"] })
    } catch (e) {
      toast.error(erro(e))
    } finally {
      setOcupado(false)
      navegar("/pdv-lr", { replace: true })
    }
  }
  useEffect(() => {
    if (tratado.current || (!code && !negado)) return
    tratado.current = true
    void concluirRetorno()
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [code, state, negado])

  async function conectar() {
    setOcupado(true)
    try {
      const { url } = await blingConectarInicio()
      window.location.assign(url)
    } catch (e) {
      toast.error(erro(e))
      setOcupado(false)
    }
  }

  async function buscar() {
    setOcupado(true)
    try {
      setContatos((await blingContatos(busca)).contatos)
    } catch (e) {
      toast.error(erro(e))
    } finally {
      setOcupado(false)
    }
  }

  async function escolher(c: ContatoBling) {
    setOcupado(true)
    try {
      await blingDefinirContato({ id: c.id, nome: c.nome })
      toast.success(`Cliente: ${c.nome}`)
      setEscolhendo(false)
      setContatos(null)
      setBusca("")
      await qc.invalidateQueries({ queryKey: ["bling"] })
    } catch (e) {
      toast.error(erro(e))
    } finally {
      setOcupado(false)
    }
  }

  if (situacao.isLoading) return <Skeleton className="h-28 w-full" />
  if (situacao.isError) return <ErroConsulta aoTentar={() => situacao.refetch()} carregando={situacao.isFetching} />
  const s = situacao.data!
  if (s.semBanco)
    return (
      <Alert>
        <TriangleAlert />
        <AlertDescription>Atualize o banco para usar esta função</AlertDescription>
      </Alert>
    )
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Conexão com o Bling da LR
          <Badge variant={s.conectado ? "success" : "outline"}>{s.conectado ? "Conectado" : "Não conectado"}</Badge>
        </CardTitle>
        <CardDescription>
          {s.conectado
            ? "O app gera pedidos de venda no Bling da LR. Os acessos ficam só no servidor."
            : "Entre no Bling com a conta da LR e autorize o aplicativo. Você volta para esta página sozinho."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {s.conectado && (
          <p className="text-sm">
            Cliente dos pedidos: <span className="font-medium">{s.contatoNome ?? "ainda não escolhido"}</span>
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button size="toque" variant={s.conectado ? "outline" : "default"} disabled={ocupado} onClick={conectar}>
            {ocupado ? <Spinner /> : <Link2 />} {s.conectado ? "Reconectar" : "Conectar ao Bling"}
          </Button>
          {s.conectado && !escolhendo && (
            <Button size="toque" variant="outline" disabled={ocupado} onClick={() => setEscolhendo(true)}>
              <Pencil /> {s.contatoDefinido ? "Trocar cliente" : "Escolher cliente"}
            </Button>
          )}
        </div>
        {s.conectado && escolhendo && (
          <div className="flex flex-col gap-2 rounded-lg border p-3">
            <p className="text-sm font-medium">Quem é a Arvenne no Bling da LR?</p>
            <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void buscar() }}>
              <Input className="h-11 lg:h-9" aria-label="Buscar cliente no Bling" placeholder="Nome ou CNPJ" value={busca} onChange={(e) => setBusca(e.target.value)} />
              <Button type="submit" size="toque" disabled={ocupado || busca.trim().length < 2}>
                {ocupado ? <Spinner /> : <Search />} Buscar
              </Button>
            </form>
            {contatos && contatos.length === 0 && <p className="text-sm text-muted-foreground">Nenhum contato achado.</p>}
            <ul className="flex flex-col" aria-label="Contatos do Bling">
              {contatos?.map((c) => (
                <li key={c.id} className="flex min-h-11 items-center justify-between gap-2 border-b py-1 last:border-b-0">
                  <span className="min-w-0 text-sm">
                    <span className="block font-medium break-words">{c.nome}</span>
                    {c.documento && <span className="text-xs text-muted-foreground tabular-nums">{c.documento}</span>}
                  </span>
                  <Button size="toque" variant="outline" disabled={ocupado} onClick={() => escolher(c)} aria-label={`Escolher ${c.nome}`}>
                    <Check /> Escolher
                  </Button>
                </li>
              ))}
            </ul>
            <Button variant="ghost" size="toque" className="w-fit" onClick={() => { setEscolhendo(false); setContatos(null) }}>
              <X /> Fechar
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function LinhaCodigo({ c }: { c: CodigoLembrado }) {
  const qc = useQueryClient()
  const [editando, setEditando] = useState(false)
  const [valor, setValor] = useState(c.codigo_bling)
  const [ocupado, setOcupado] = useState(false)
  const fazer = async (f: () => Promise<unknown>, ok: string) => {
    setOcupado(true)
    try {
      await f()
      toast.success(ok)
      setEditando(false)
      await qc.invalidateQueries({ queryKey: ["bling", "codigos"] })
    } catch (e) {
      toast.error(erro(e))
    } finally {
      setOcupado(false)
    }
  }
  return (
    <li className="flex min-h-11 flex-wrap items-center gap-2 border-b py-1 last:border-b-0">
      <span className="font-mono text-sm break-all">{c.sku}</span>
      <span aria-hidden className="text-muted-foreground">→</span>
      {editando ? (
        <>
          <Input className="h-11 min-w-0 flex-1 font-mono lg:h-9" aria-label={`Código no Bling de ${c.sku}`} value={valor} onChange={(e) => setValor(e.target.value)} />
          <Button size="toque" disabled={ocupado || !valor.trim()} onClick={() => fazer(() => blingSalvarCodigo(c.sku, valor.trim()), "Código atualizado")}>Salvar</Button>
          <Button size="toque" variant="ghost" disabled={ocupado} onClick={() => { setEditando(false); setValor(c.codigo_bling) }}>Cancelar</Button>
        </>
      ) : (
        <>
          <span className="min-w-0 flex-1 font-mono text-sm font-medium break-all">{c.codigo_bling}</span>
          <Button size="icon-toque" variant="ghost" aria-label={`Trocar o código de ${c.sku}`} onClick={() => setEditando(true)}><Pencil /></Button>
          <Button size="icon-toque" variant="ghost" aria-label={`Apagar o código lembrado de ${c.sku}`} disabled={ocupado} onClick={() => fazer(() => blingApagarCodigo(c.sku), "Código apagado")}><Trash2 /></Button>
        </>
      )}
    </li>
  )
}

export default function PdvLr() {
  const situacao = useBlingSituacao()
  const pedidos = useBlingPedidos(undefined, 15)
  const codigos = useBlingCodigos()
  const s = situacao.data
  const pronto = !!s && !s.semBanco && s.conectado && s.contatoDefinido

  return (
    <div className="flex flex-col gap-4">
      <CartaoConexao />

      <Card>
        <CardHeader>
          <CardTitle>Novo pedido de venda</CardTitle>
          <CardDescription>Cole a lista ou digite as peças. O preço vem do cadastro do Bling e pode ser trocado.</CardDescription>
        </CardHeader>
        <CardContent>
          {pronto ? (
            <MontarPedidoLr />
          ) : (
            <p className="text-sm text-muted-foreground">
              {situacao.isLoading ? "Carregando…" : s?.semBanco ? "Atualize o banco para usar esta função" : "Conecte o Bling e escolha o cliente para gerar pedidos."}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Últimos pedidos gerados</CardTitle>
        </CardHeader>
        <CardContent>
          {pedidos.isError ? (
            <ErroConsulta aoTentar={() => pedidos.refetch()} carregando={pedidos.isFetching} />
          ) : pedidos.isLoading ? (
            <Skeleton className="h-16 w-full" />
          ) : !pedidos.data?.length ? (
            <p className="text-sm text-muted-foreground">Nenhum pedido gerado ainda.</p>
          ) : (
            <ul className="flex flex-col" aria-label="Pedidos gerados no Bling">
              {pedidos.data.map((p) => (
                <li key={p.id} className="flex flex-col gap-0.5 border-b py-2 last:border-b-0">
                  <span className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-sm font-semibold tabular-nums">Nº {p.bling_numero ?? p.bling_id}</span>
                    <span className="text-xs text-muted-foreground">{quando(p.criado_em)}{p.criado_por ? ` · ${p.criado_por}` : ""}</span>
                  </span>
                  <span className="text-sm break-words text-muted-foreground">{(p.itens ?? []).map((i) => `${i.codigo} ×${i.qtd}`).join(", ")}</span>
                  <span className="text-sm font-medium tabular-nums">{reais(p.total)}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Códigos lembrados</CardTitle>
          <CardDescription>Quando o código do app é diferente do Bling, o app lembra da próxima vez.</CardDescription>
        </CardHeader>
        <CardContent>
          {codigos.isError ? (
            <ErroConsulta aoTentar={() => codigos.refetch()} carregando={codigos.isFetching} />
          ) : codigos.isLoading ? (
            <Skeleton className="h-12 w-full" />
          ) : !codigos.data?.length ? (
            <p className="text-sm text-muted-foreground">Nenhum código lembrado ainda.</p>
          ) : (
            <ul className="flex flex-col" aria-label="Códigos lembrados">
              {codigos.data.map((c) => <LinhaCodigo key={c.sku} c={c} />)}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
