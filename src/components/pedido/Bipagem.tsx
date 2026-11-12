import { useEffect, useRef, useState } from "react"
import { Check, Minus, Plus, ScanBarcode, TriangleAlert, Volume2, VolumeX } from "lucide-react"
import { ConcluirEtapa } from "@/components/comum/ConcluirEtapa"
import { TituloSecao } from "@/components/comum/TituloSecao"
import Foto from "@/components/Foto"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { registrarBipagem, type AcaoItem, type PedidoDetalhe } from "@/lib/api"
import { etapaCompleta } from "@/lib/etapa"
import { sons } from "@/lib/sons"
import type { ResultadoBipagem } from "@/lib/tipos"
import { FaixaFeitas, GradePecas, ProgressoEtapa, TilePeca, Vazio } from "./TilePeca"

type Props = { pedido: PedidoDetalhe; acao: AcaoItem; aoConcluir?: () => void }
type Aviso = { tipo: ResultadoBipagem; texto: string }

const agora = () => new Date().toISOString()
const normalizar = (t: string | null | undefined) => (t ?? "").toUpperCase().replace(/\s+/g, "")

function lerSilencio(): boolean {
  try {
    return localStorage.getItem("bipagem-mudo") === "1"
  } catch {
    return false
  }
}

// Bipagem: o leitor USB digita o código e dá Enter, como um teclado. O campo fica sempre focado.
export default function Bipagem({ pedido, acao, aoConcluir }: Props) {
  const campo = useRef<HTMLInputElement>(null)
  const [valor, setValor] = useState("")
  const [mudo, setMudo] = useState(lerSilencio)
  const [aviso, setAviso] = useState<Aviso | null>(null)
  const [piscando, setPiscando] = useState<string | null>(null)
  const [ultimaId, setUltimaId] = useState<string | null>(null)
  const tempoAviso = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const tempoPisca = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  // Refoca a cada 1,2 s, menos quando há Dialog ou menu aberto ou a pessoa está digitando noutro campo.
  // preventScroll: sem isso, cada foco puxava a página de volta para o campo e ela não rolava.
  useEffect(() => {
    const id = setInterval(() => {
      const ativo = document.activeElement
      const digitando = ativo instanceof HTMLInputElement || ativo instanceof HTMLTextAreaElement
      if (digitando || document.querySelector('[role="dialog"], [role="menu"]')) return
      campo.current?.focus({ preventScroll: true })
    }, 1200)
    return () => {
      clearInterval(id)
      clearTimeout(tempoAviso.current)
      clearTimeout(tempoPisca.current)
    }
  }, [])

  const itens = pedido.pedido_itens.filter((i) => i.status === "encontrado")
  const totalPecas = itens.reduce((s, i) => s + i.qtd, 0)
  const bipadas = itens.reduce((s, i) => s + Math.min(i.qtd_bipada, i.qtd), 0)
  // As que ainda faltam ficam em cima; as completas descem para "Bipadas", em verde, sem sumir.
  const aBipar = itens.filter((i) => i.qtd_bipada < i.qtd)
  const completas = itens.filter((i) => i.qtd_bipada >= i.qtd)
  const ultima = itens.find((i) => i.id === ultimaId) ?? null

  const tocar = (som: keyof typeof sons) => {
    if (!mudo) sons[som]()
  }

  const mostrar = (a: Aviso) => {
    setAviso(a)
    clearTimeout(tempoAviso.current)
    tempoAviso.current = setTimeout(() => setAviso(null), 3000)
  }

  const processar = (bruto: string) => {
    const codigo = normalizar(bruto)
    if (!codigo) return
    const doCodigo = itens.filter((i) => normalizar(i.sku) === codigo)
    const alvo = doCodigo.find((i) => i.qtd_bipada < i.qtd)
    if (alvo) {
      // O som vem do resultado do banco: se outra leitura já completou a peça, avisa em vez de soar "ok".
      void Promise.resolve(acao(alvo, { qtd_bipada: alvo.qtd_bipada + 1, bipado_em: agora() }, codigo)).then((r) => {
        if (r === "excedente") {
          tocar("aviso")
          mostrar({ tipo: "excedente", texto: `${codigo} já foi bipado por completo.` })
        } else if (r === "ok") tocar("ok")
      })
      setAviso(null)
      setUltimaId(alvo.id)
      setPiscando(alvo.id)
      clearTimeout(tempoPisca.current)
      tempoPisca.current = setTimeout(() => setPiscando(null), 600)
    } else if (doCodigo.length > 0) {
      void registrarBipagem(pedido.id, doCodigo[0].id, codigo)
      tocar("aviso")
      mostrar({ tipo: "excedente", texto: `${codigo} já foi bipado por completo.` })
    } else {
      void registrarBipagem(pedido.id, null, codigo)
      tocar("erro")
      mostrar({ tipo: "fora_do_pedido", texto: `SKU ${codigo} não é deste pedido.` })
    }
  }

  const alternarSom = () => {
    const novo = !mudo
    setMudo(novo)
    try {
      localStorage.setItem("bipagem-mudo", novo ? "1" : "0")
    } catch {
      // sem armazenamento: vale só nesta tela
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <ProgressoEtapa titulo="Bipagem" feitas={bipadas} total={totalPecas} unidade="peças" />

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          processar(valor)
          setValor("")
        }}
      >
        <div className="relative flex-1">
          <ScanBarcode className="pointer-events-none absolute top-1/2 left-4 size-6 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={campo}
            autoFocus
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            inputMode="text"
            aria-label="Código da peça"
            placeholder="Leia o código da peça"
            className="h-16 pl-14 font-mono text-xl uppercase md:text-xl"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
          />
        </div>
        <Button
          type="button"
          variant="outline"
          className="h-16 w-16"
          aria-label={mudo ? "Ligar o som" : "Silenciar"}
          aria-pressed={mudo}
          onClick={alternarSom}
        >
          {mudo ? <VolumeX className="size-6" /> : <Volume2 className="size-6" />}
        </Button>
      </form>

      {aviso && (
        <Alert variant={aviso.tipo === "fora_do_pedido" ? "destructive" : "default"} className="animate-in fade-in slide-in-from-top-1 duration-200">
          <TriangleAlert />
          <AlertTitle>{aviso.tipo === "fora_do_pedido" ? "Peça de fora do pedido" : "Já está completo"}</AlertTitle>
          <AlertDescription>{aviso.texto}</AlertDescription>
        </Alert>
      )}

      {ultima && (
        <div
          key={`${ultima.id}-${ultima.qtd_bipada}`}
          className="flex items-center gap-3 rounded-xl bg-success/5 p-2 ring-1 ring-success/30 animate-in fade-in zoom-in-95 duration-200"
          aria-live="polite"
        >
          <Foto url={ultima.foto_url} alt={ultima.nome} className="size-16 shrink-0" />
          <div className="min-w-0 flex-1 leading-tight">
            <div className="text-xs font-medium text-success">Última leitura</div>
            <div className="font-mono text-base font-semibold break-all">{ultima.sku ?? "sem código"}</div>
            {ultima.variante && <div className="text-sm">{ultima.variante}</div>}
          </div>
          <Badge size="lg" className="h-7 bg-success px-2.5 text-base text-success-foreground tabular-nums">
            <Check /> {Math.min(ultima.qtd_bipada, ultima.qtd)}/{ultima.qtd}
          </Badge>
        </div>
      )}

      {itens.length === 0 ? (
        <Vazio>Nenhuma peça para bipar.</Vazio>
      ) : (
        <>
          <section className="flex flex-col gap-2" aria-label="A bipar">
            <TituloSecao as="h3" contagem={aBipar.length}>
              A bipar
            </TituloSecao>
            {aBipar.length === 0 ? (
              <Vazio>Tudo bipado. Pode concluir a bipagem.</Vazio>
            ) : (
              <GradePecas>
                {aBipar.map((i) => (
                  <TilePeca
                    key={i.id}
                    item={i}
                    piscando={piscando === i.id}
                    contador={
                      <Badge
                        variant={i.qtd_bipada > 0 ? "default" : "secondary"}
                        className="h-7 px-2.5 text-base tabular-nums shadow-sm"
                      >
                        {i.qtd_bipada}/{i.qtd}
                      </Badge>
                    }
                  >
                    {/* Contagem à mão (peça sem código legível): os dois botões direto, sem menu. */}
                    <div className="flex w-full items-center gap-1.5">
                      <Button
                        variant="secondary"
                        size="bloco"
                        className="min-w-0 flex-1 px-2"
                        disabled={i.qtd_bipada <= 0}
                        onClick={() => acao(i, { qtd_bipada: i.qtd_bipada - 1 }, undefined, -1)}
                      >
                        <Minus /> Tirar 1
                      </Button>
                      <Button
                        variant="secondary"
                        size="bloco"
                        className="min-w-0 flex-1 px-2"
                        onClick={() => acao(i, { qtd_bipada: i.qtd_bipada + 1, bipado_em: agora() }, undefined, 1)}
                      >
                        <Plus /> Contar 1
                      </Button>
                    </div>
                  </TilePeca>
                ))}
              </GradePecas>
            )}
          </section>

          <FaixaFeitas
            titulo="Bipadas"
            itens={completas}
            rotuloDesfazer="Tirar 1"
            aoDesfazer={(i) => void acao(i, { qtd_bipada: Math.max(0, i.qtd_bipada - 1) }, undefined, -1)}
            nota={(i) => `${Math.min(i.qtd_bipada, i.qtd)}/${i.qtd} bipadas`}
          />
        </>
      )}

      {aoConcluir && (
        <ConcluirEtapa disabled={!etapaCompleta("bipagem", pedido.pedido_itens)} onClick={aoConcluir}>
          Concluir bipagem
        </ConcluirEtapa>
      )}
    </div>
  )
}
