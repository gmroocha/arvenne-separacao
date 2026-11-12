import { useCallback, useEffect, useRef, useState } from "react"
import { Link, Navigate, useNavigate, useParams } from "react-router"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { ArrowLeft, ChevronUp } from "lucide-react"
import ClienteCard from "@/components/venda/ClienteCard"
import PagoDialog, { type DadosPagamento } from "@/components/venda/PagoDialog"
import PecasVenda from "@/components/venda/PecasVenda"
import ResumoVenda from "@/components/venda/ResumoVenda"
import SomarPedido from "@/components/venda/SomarPedido"
import { camposDe, dinheiroInvalido, formDe, type FormVenda } from "@/components/venda/form"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer"
import { Field, FieldLabel } from "@/components/ui/field"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { atualizarPedido, salvarCliente, somarVenda, usePedido, type CamposPedido, type PedidoDetalhe } from "@/lib/api"
import { linkWhatsApp, reais } from "@/lib/formato"
import { StatusBadge } from "@/components/StatusBadge"

type Estado = "salvo" | "pendente" | "salvando" | "erro"

// Salva sozinho, 600 ms depois da última digitação. Vai em fila por pedido (como usePatchPedido), manda só
// os campos que mudaram desde o último salvo e grava na hora ao sair da tela ou esconder a aba.
function useAutosave(pedidoId: string, form: FormVenda) {
  const qc = useQueryClient()
  const [estado, setEstado] = useState<Estado>("salvo")
  const ref = useRef(form)
  useEffect(() => {
    ref.current = form
  }, [form])
  const salvo = useRef<Record<string, unknown>>(camposDe(form))

  const mutacao = useMutation({
    scope: { id: `pedido-${pedidoId}` },
    mutationFn: (campos: CamposPedido) => atualizarPedido(pedidoId, campos),
    onSettled: () => {
      if (qc.isMutating({ mutationKey: ["autosave", pedidoId] }) <= 1) {
        qc.invalidateQueries({ queryKey: ["pedido", pedidoId] })
        qc.invalidateQueries({ queryKey: ["pedidos"] })
      }
    },
    mutationKey: ["autosave", pedidoId],
  })

  const { mutateAsync } = mutacao // estável entre renders
  const gravar = useCallback(
    async (extra?: CamposPedido) => {
      const invalidos = dinheiroInvalido(ref.current)
      if (invalidos.length) toast.warning(`Valor de ${invalidos.join(" e ")} não entendido: não foi salvo`, { id: "dinheiro-invalido" })
      const atuais = camposDe(ref.current) as Record<string, unknown>
      const mudados = Object.fromEntries(Object.entries(atuais).filter(([k, v]) => JSON.stringify(v) !== JSON.stringify(salvo.current[k])))
      if (!extra && !Object.keys(mudados).length) return setEstado("salvo")
      setEstado("salvando")
      try {
        await mutateAsync({ ...mudados, ...extra })
        salvo.current = { ...salvo.current, ...mudados }
        setEstado(JSON.stringify(camposDe(ref.current)) === JSON.stringify(salvo.current) ? "salvo" : "pendente")
      } catch (e) {
        setEstado("erro")
        toast.error(e instanceof Error ? e.message : "Não foi possível salvar")
        throw e
      }
    },
    [mutateAsync],
  )

  // Sempre a versão mais recente, para os ouvintes de saída abaixo.
  const gravarRef = useRef(gravar)
  useEffect(() => {
    gravarRef.current = gravar
  }, [gravar])

  useEffect(() => {
    if (JSON.stringify(camposDe(form)) === JSON.stringify(salvo.current)) return
    setEstado("pendente")
    const t = setTimeout(() => void gravar().catch(() => {}), 600)
    return () => clearTimeout(t)
  }, [form, gravar])

  useEffect(() => {
    const aoEsconder = () => {
      if (document.visibilityState === "hidden") void gravarRef.current().catch(() => {})
    }
    document.addEventListener("visibilitychange", aoEsconder)
    return () => {
      document.removeEventListener("visibilitychange", aoEsconder)
      void gravarRef.current().catch(() => {}) // saiu da tela: grava o que faltar
    }
  }, [])

  return { estado, gravar }
}

function Editor({ pedido }: { pedido: PedidoDetalhe }) {
  const navegar = useNavigate()
  const qc = useQueryClient()
  const [form, setForm] = useState<FormVenda>(() => formDe(pedido))
  const { estado, gravar } = useAutosave(pedido.id, form)
  const [resumoAberto, setResumoAberto] = useState(false)
  const [pagando, setPagando] = useState(false)
  const [pagto, setPagto] = useState<{ total: number; forma: string }>({ total: pedido.total, forma: pedido.forma_pagamento ?? "Pix" })
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
      razao_social: form.cliente_razao_social,
      ie: form.cliente_ie,
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

  // Avisa antes de abrir o pagamento; o banco também recusa venda sem peça ou sem preço.
  function problemaDasPecas(): string | null {
    const vivas = pedido.pedido_itens.filter((i) => i.status !== "removido")
    if (vivas.length === 0) return "Adicione as peças antes de marcar como pago"
    if (vivas.some((i) => i.preco == null)) return "Há peça sem preço: informe o preço de todas antes de marcar como pago"
    return null
  }

  // Grava a forma, recarrega o pedido e devolve o total que o banco calculou para ela.
  async function totalComForma(forma: string): Promise<number | null> {
    await gravar({ forma_pagamento: forma })
    await qc.refetchQueries({ queryKey: ["pedido", pedido.id] })
    return qc.getQueryData<PedidoDetalhe>(["pedido", pedido.id])?.total ?? null
  }

  async function pedirPagamento() {
    const problema = problemaDasPecas()
    if (problema) {
      toast.warning(problema)
      return
    }
    setResumoAberto(false)
    try {
      // Grava o que ainda está na fila de digitação e a forma escolhida, para o total vir do banco.
      const forma = pedido.forma_pagamento ?? "Pix"
      const total = (await totalComForma(forma)) ?? pedido.total
      setPagto({ total, forma })
      setPagando(true)
    } catch {
      // o erro já foi avisado por gravar()
    }
  }

  async function confirmarPagamento(d: DadosPagamento) {
    const problema = problemaDasPecas()
    if (problema) {
      toast.warning(problema)
      return
    }
    try {
      const id = await garantirCliente()
      if (form.somar_em) {
        // Venda somada: grava o que falta (cliente, endereço, pedido escolhido) e o banco move as peças.
        await gravar({ cliente_id: id })
        await somarVenda({ venda: pedido.id, forma: d.forma, valor: d.valor ?? pedido.total, pagoEm: d.pagoEm })
        await Promise.all([qc.invalidateQueries({ queryKey: ["pedidos"] }), qc.invalidateQueries({ queryKey: ["pedido"] })])
        const alvo = qc.getQueryData<{ numero: string }>(["pedido", "resumo", form.somar_em])
        toast.success(`Peças somadas ao pedido ${alvo?.numero.replace(/^#/, "") ?? ""}`.trim())
        navegar(`/pedidos/${form.somar_em}`, { replace: true })
        return
      }
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
      aoForma={(forma) => void gravar({ forma_pagamento: forma }).catch(() => {})}
      aoEnviar={() => {
        setResumoAberto(false)
        void enviar()
      }}
      aoCopiar={copiar}
      aoPago={() => void pedirPagamento()}
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
          <Button variant="ghost" size="toque" asChild>
            <Link to="/vendas">
              <ArrowLeft /> Vendas
            </Link>
          </Button>
          <h2 className="font-heading text-xl font-semibold">#{pedido.numero.replace(/^#/, "")}</h2>
          <StatusBadge status={pedido.status} somadaA={pedido.somada_a_numero} />
        </div>
        <span className="text-xs text-muted-foreground" aria-live="polite">
          {estado === "salvo" ? "Salvo" : estado === "erro" ? "Não salvou" : "Salvando…"}
        </span>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
        <div className="flex min-w-0 flex-col gap-4">
          <PecasVenda pedido={pedido} />
          <SomarPedido form={form} aoMudar={mudar} />
          {!form.somar_em && <ClienteCard form={form} aoMudar={mudar} aoSalvarCliente={aoSalvarCliente} />}
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
        <Button size="xl" onClick={() => setResumoAberto(true)}>
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

      <PagoDialog aberto={pagando} aoMudar={setPagando} total={pagto.total} formaInicial={pagto.forma} aoMudarForma={totalComForma} aoConfirmar={confirmarPagamento} />

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
  if (!data)
    return (
      <Alert variant="destructive">
        <AlertDescription>{error ? "Não foi possível carregar a venda. Tente de novo." : "Venda não encontrada."}</AlertDescription>
      </Alert>
    )
  if (data.fase !== "venda") return <Navigate to={`/pedidos/${data.id}`} replace />
  return (
    <>
      {error && <p className="mb-2 text-xs text-muted-foreground">Sem conexão com o servidor: mostrando o último dado carregado.</p>}
      <Editor key={data.id} pedido={data} />
    </>
  )
}
