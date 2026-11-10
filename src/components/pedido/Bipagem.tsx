import { useEffect, useRef, useState } from "react"
import { Check, Minus, Plus, ScanBarcode, TriangleAlert, Volume2, VolumeX } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { DropdownMenuItem } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { registrarBipagem, type AcaoItem, type PedidoDetalhe } from "@/lib/api"
import { etapaCompleta } from "@/lib/etapa"
import { sons } from "@/lib/sons"
import type { ResultadoBipagem } from "@/lib/tipos"
import { cn } from "@/lib/utils"
import { GradePecas, MenuPeca, ProgressoEtapa, TilePeca, Vazio } from "./TilePeca"

type Props = { pedido: PedidoDetalhe; acao: AcaoItem; aoConcluir: () => void }
type Aviso = { tipo: ResultadoBipagem; texto: string }

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
  const tempoAviso = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const tempoPisca = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  // Refoca a cada 1,2 s, menos quando há Dialog ou menu aberto ou a pessoa está digitando noutro campo.
  useEffect(() => {
    const id = setInterval(() => {
      const ativo = document.activeElement
      const digitando = ativo instanceof HTMLInputElement || ativo instanceof HTMLTextAreaElement
      if (digitando || document.querySelector('[role="dialog"], [role="menu"]')) return
      campo.current?.focus()
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
      acao(alvo, { qtd_bipada: alvo.qtd_bipada + 1, bipado_em: new Date().toISOString() })
      void registrarBipagem(pedido.id, alvo.id, codigo, "ok")
      tocar("ok")
      setAviso(null)
      setPiscando(alvo.id)
      clearTimeout(tempoPisca.current)
      tempoPisca.current = setTimeout(() => setPiscando(null), 600)
    } else if (doCodigo.length > 0) {
      void registrarBipagem(pedido.id, doCodigo[0].id, codigo, "excedente")
      tocar("aviso")
      mostrar({ tipo: "excedente", texto: `${codigo} já foi bipado por completo.` })
    } else {
      void registrarBipagem(pedido.id, null, codigo, "fora_do_pedido")
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

      {itens.length === 0 ? (
        <Vazio>Nenhuma peça para bipar.</Vazio>
      ) : (
        <GradePecas>
          {itens.map((i) => {
            const completa = i.qtd_bipada >= i.qtd
            return (
              <TilePeca
                key={i.id}
                item={i}
                piscando={piscando === i.id}
                esmaecida={completa}
                contador={
                  <Badge
                    variant={completa ? "default" : "secondary"}
                    className={cn("h-7 px-2.5 text-base tabular-nums shadow-sm")}
                  >
                    {completa && <Check />}
                    {Math.min(i.qtd_bipada, i.qtd)}/{i.qtd}
                  </Badge>
                }
              >
                <MenuPeca rotulo="Ajustar contagem">
                  <DropdownMenuItem disabled={i.qtd_bipada >= i.qtd} onClick={() => acao(i, { qtd_bipada: i.qtd_bipada + 1, bipado_em: new Date().toISOString() })}>
                    <Plus /> Contar 1 à mão
                  </DropdownMenuItem>
                  <DropdownMenuItem disabled={i.qtd_bipada <= 0} onClick={() => acao(i, { qtd_bipada: i.qtd_bipada - 1 })}>
                    <Minus /> Tirar 1
                  </DropdownMenuItem>
                </MenuPeca>
              </TilePeca>
            )
          })}
        </GradePecas>
      )}

      <Button className="h-11 w-full text-base" disabled={!etapaCompleta("bipagem", pedido.pedido_itens)} onClick={aoConcluir}>
        Concluir bipagem
      </Button>
    </div>
  )
}
