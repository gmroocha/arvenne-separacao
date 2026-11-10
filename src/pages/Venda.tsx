import { useCallback, useEffect, useRef, useState } from "react"
import { Link, Navigate, useNavigate, useParams } from "react-router"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { ArrowLeft, ChevronUp } from "lucide-react"
import ClienteCard from "@/components/venda/ClienteCard"
import PagoDialog, { type DadosPagamento } from "@/components/venda/PagoDialog"
import PecasVenda from "@/components/venda/PecasVenda"
import ResumoVenda from "@/components/venda/ResumoVenda"
import { camposDe, formDe, type FormVenda } from "@/components/venda/form"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer"
import { Field, FieldLabel } from "@/components/ui/field"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { atualizarPedido, salvarCliente, usePedido, type CamposPedido, type PedidoDetalhe } from "@/lib/api"
import { linkWhatsApp, reais } from "@/lib/formato"
import { StatusBadge } from "@/components/StatusBadge"

type Estado = "salvo" | "pendente" | "salvando" | "erro"

// Salva sozinho, 600 ms depois da última digitação.
function useAutosave(pedidoId: string, form: FormVenda) {
  const qc = useQueryClient()
  const [estado, setEstado] = useState<Estado>("salvo")
  const ref = useRef(form)
  useEffect(() => {
    ref.current = form
  }, [form])
  const salvo = useRef(JSON.stringify(camposDe(form)))

  const gravar = useCallback(
    async (extra?: CamposPedido) => {
      const base = camposDe(ref.current)
      const chave = JSON.stringify(base)
      if (!extra && chave === salvo.current) return setEstado("salvo")
      setEstado("salvando")
      try {
        await atualizarPedido(pedidoId, { ...base, ...extra })
        salvo.current = chave
        setEstado("salvo")
        qc.invalidateQueries({ queryKey: ["pedido", pedidoId] })
        qc.invalidateQueries({ queryKey: ["pedidos"] })
      } catch (e) {
        setEstado("erro")
        toast.error(e instanceof Error ? e.message : "Não foi possível salvar")
        throw e
      }
    },
    [pedidoId, qc],
  )

  useEffect(() => {
    if (JSON.stringify(camposDe(form)) === salvo.current) return
    setEstado("pendente")
    const t = setTimeout(() => void gravar().catch(() => {}), 600)
    return () => clearTimeout(t)
  }, [form, gravar])

  return { estado, gravar }
}

function Editor({ pedido }: { pedido: PedidoDetalhe }) {
  const navegar = useNavigate()
  const qc = useQueryClient()
  const [form, setForm] = useState<FormVenda>(() => formDe(pedido))
  const { estado, gravar } = useAutosave(pedido.id, form)
  const [resumoAberto, setResumoAberto] = useState(false)
  const [pagando, setPagando] = useState(false)
  const [perdendo, setPerdendo] = useState(false)
  const [enviando, setEnviando] = useState(false)

  const mudar = useCallback((parcial: Partial<FormVenda>) => setForm((f) => ({ ...f, ...parcial })), [])
  const link = `${window.location.origin}/r/${pedido.token_publico}`
  const pecas = pedido.qtd_linhas

  // Cria ou atualiza a cliente no cadastro e devolve o id.
  async function garantirCliente(): Promise<string | null> {
    if (!form.cliente_nome.trim()) return form.cliente_id
    const id = await salvarCliente(form.cliente_id, {
      nome: form.cliente_nome,
      cpf: form.cliente_cpf,
      email: form.cliente_email,
      telefone: form.cliente_telefone,
      cep: form.entrega_cep,
      logradouro: form.entrega_logradouro,
      numero: form.entrega_numero,
      complemento: form.entrega_complemento,
      bairro: form.entrega_bairro,
      cidade: form.entrega_cidade,
      uf: form.entrega_uf,
    })
    mudar({ cliente_id: id })
    qc.invalidateQueries({ queryKey: ["clientes"] })
    return id
  }

  async function aoSalvarCliente() {
    const id = await garantirCliente()
    await gravar({ cliente_id: id })
  }

  async function enviar() {
    if (pecas === 0) return toast.error("Adicione ao menos uma peça")
    const primeiro = form.cliente_nome.trim().split(" ")[0]
    const texto = `Olá${primeiro ? `, ${primeiro}` : ""}! Segue o resumo do seu pedido ${pedido.numero} da Arvenne: ${link}\nQualquer dúvida é só responder por aqui.`
    const wa = linkWhatsApp(form.cliente_telefone, texto)
    // Abre a janela já no clique, antes das chamadas ao banco (senão o navegador bloqueia).
    const janela = wa ? window.open("about:blank", "_blank") : null
    setEnviando(true)
    try {
      const id = await garantirCliente()
      await gravar({ cliente_id: id, ...(pedido.status === "em_aberto" ? { status: "aguardando_pagamento" } : {}) })
      if (wa && janela) janela.location.href = wa
      else {
        janela?.close()
        await navigator.clipboard.writeText(link).catch(() => {})
        toast.info("Sem telefone válido: o link foi copiado para você enviar")
      }
    } catch (e) {
      janela?.close()
      toast.error(e instanceof Error ? e.message : "Não foi possível enviar")
    } finally {
      setEnviando(false)
    }
  }

  async function copiar() {
    await navigator.clipboard.writeText(link).then(
      () => toast.success("Link copiado"),
      () => toast.error("Não foi possível copiar"),
    )
  }

  async function confirmarPagamento(d: DadosPagamento) {
    try {
      const id = await garantirCliente()
      await gravar({ cliente_id: id, forma_pagamento: d.forma, valor_pago: d.valor, pago_em: d.pagoEm, status: "novo" })
      await qc.invalidateQueries({ queryKey: ["pedidos"] })
      toast.success("Pedido entrou na expedição")
      navegar(`/pedidos/${pedido.id}`, { replace: true })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível marcar como pago")
    }
  }

  async function marcarPerdida() {
    try {
      await atualizarPedido(pedido.id, { status: "perdida" })
      await qc.invalidateQueries({ queryKey: ["pedidos"] })
      toast.success("Venda marcada como perdida")
      navegar("/vendas", { replace: true })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível marcar como perdida")
    }
  }

  const resumo = (prefixo: string) => (
    <ResumoVenda
      pedido={pedido}
      form={form}
      aoMudar={mudar}
      aoEnviar={() => {
        setResumoAberto(false)
        void enviar()
      }}
      aoCopiar={copiar}
      aoPago={() => {
        setResumoAberto(false)
        setPagando(true)
      }}
      aoPerdida={() => {
        setResumoAberto(false)
        setPerdendo(true)
      }}
      enviando={enviando}
      prefixo={prefixo}
    />
  )

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/vendas">
              <ArrowLeft /> Vendas
            </Link>
          </Button>
          <h2 className="text-xl font-semibold">#{pedido.numero.replace(/^#/, "")}</h2>
          <StatusBadge status={pedido.status} />
        </div>
        <span className="text-xs text-muted-foreground" aria-live="polite">
          {estado === "salvo" ? "Salvo" : estado === "erro" ? "Não salvou" : "Salvando…"}
        </span>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
        <div className="flex min-w-0 flex-col gap-4">
          <PecasVenda pedido={pedido} />
          <ClienteCard form={form} aoMudar={mudar} aoSalvarCliente={aoSalvarCliente} />
          <Field>
            <FieldLabel htmlFor="v-obs">Observações</FieldLabel>
            <Textarea id="v-obs" value={form.observacoes} onChange={(e) => mudar({ observacoes: e.target.value })} />
          </Field>
        </div>

        <Card size="sm" className="hidden lg:sticky lg:top-4 lg:block">
          <CardContent>{resumo("d")}</CardContent>
        </Card>
      </div>

      <div className="sticky bottom-0 z-10 -mx-3 flex items-center justify-between gap-3 border-t bg-background p-3 sm:-mx-4 sm:px-4 lg:hidden">
        <div className="flex flex-col">
          <span className="text-xs text-muted-foreground">
            {pedido.qtd_pecas} {pedido.qtd_pecas === 1 ? "peça" : "peças"}
          </span>
          <span className="text-xl font-semibold tabular-nums">{reais(pedido.total)}</span>
        </div>
        <Button className="h-11" onClick={() => setResumoAberto(true)}>
          Resumo <ChevronUp />
        </Button>
      </div>

      <Drawer open={resumoAberto} onOpenChange={setResumoAberto}>
        <DrawerContent>
          <DrawerHeader className="text-left">
            <DrawerTitle>Resumo da venda</DrawerTitle>
            <DrawerDescription className="sr-only">Desconto, cupom, frete, total e ações</DrawerDescription>
          </DrawerHeader>
          <div className="overflow-y-auto px-4 pb-6">{resumoAberto && resumo("m")}</div>
        </DrawerContent>
      </Drawer>

      <PagoDialog aberto={pagando} aoMudar={setPagando} total={pedido.total} aoConfirmar={confirmarPagamento} />

      <Dialog open={perdendo} onOpenChange={setPerdendo}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Marcar como perdida?</DialogTitle>
            <DialogDescription>A cliente desistiu. A venda vai para o Arquivo.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPerdendo(false)}>
              Voltar
            </Button>
            <Button variant="destructive" onClick={marcarPerdida}>
              Marcar como perdida
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default function Venda() {
  const { id } = useParams()
  const { data, isLoading, error } = usePedido(id)
  if (isLoading)
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  if (error || !data)
    return (
      <Alert variant="destructive">
        <AlertDescription>Venda não encontrada.</AlertDescription>
      </Alert>
    )
  if (data.fase !== "venda") return <Navigate to={`/pedidos/${data.id}`} replace />
  return <Editor key={data.id} pedido={data} />
}
