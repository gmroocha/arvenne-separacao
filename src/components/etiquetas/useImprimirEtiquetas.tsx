import { useCallback, useEffect, useRef, useState, type ReactNode } from "react"
import { toast } from "sonner"
import { Printer } from "lucide-react"
import RespDialog from "@/components/RespDialog"
import { Button } from "@/components/ui/button"
import { useMarcarEtiquetadas } from "@/lib/api"
import { ETIQUETA_TESTE, etiquetasDoLote, zpl, type Etiqueta, type GrupoEtiquetas } from "@/lib/etiquetas"
import { detectar, imprimir as imprimirNaZebra, type DispositivoZebra } from "@/lib/zebra"
import FolhaEtiquetas from "./FolhaEtiquetas"

type Trabalho = { grupos: GrupoEtiquetas[]; etiquetas: Etiqueta[]; ids: string[] }

// Imprime etiquetas: direto na Zebra (Browser Print) quando ele responde; senão, pelo diálogo do navegador.
// Depois pergunta "Saiu tudo certo?" e, se sim, marca as peças como etiquetadas.
export function useImprimirEtiquetas() {
  const [zebra, setZebra] = useState<DispositivoZebra | null>(null)
  const [folha, setFolha] = useState<Trabalho | null>(null)
  const [confirmar, setConfirmar] = useState<Trabalho | null>(null)
  const [imprimindo, setImprimindo] = useState(false)
  const marcar = useMarcarEtiquetadas()
  const noPapel = useRef(false)

  useEffect(() => {
    let vivo = true
    detectar().then((d) => vivo && setZebra(d))
    return () => {
      vivo = false
    }
  }, [])

  const montar = (grupos: GrupoEtiquetas[], etiquetas?: Etiqueta[]): Trabalho => ({
    grupos,
    etiquetas: etiquetas ?? etiquetasDoLote(grupos),
    ids: [...new Set(grupos.flatMap((g) => g.itemIds))],
  })

  const executar = useCallback(async (t: Trabalho) => {
    if (t.etiquetas.length === 0) {
      toast.info("Nada para imprimir: falta o código (SKU) da peça")
      return
    }
    setImprimindo(true)
    try {
      const dispositivo = await detectar()
      setZebra(dispositivo)
      if (dispositivo) {
        try {
          await imprimirNaZebra(dispositivo, zpl(t.etiquetas))
          if (t.ids.length > 0) setConfirmar(t)
          else toast.success("Etiqueta enviada à Zebra")
          return
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "Não foi possível imprimir na Zebra")
          toast.info("Vou usar a impressão do navegador")
        }
      }
      noPapel.current = false
      setFolha(t)
    } finally {
      setImprimindo(false)
    }
  }, [])

  // A folha já tem os códigos desenhados: abre o diálogo de impressão do navegador.
  const folhaPronta = useCallback(() => {
    if (noPapel.current || !folha) return
    noPapel.current = true
    const html = document.documentElement
    html.classList.add("imprimindo-etiquetas")
    // Um instante para o navegador aplicar o estilo de impressão antes de abrir o diálogo.
    requestAnimationFrame(() => {
      window.print()
      html.classList.remove("imprimindo-etiquetas")
      const t = folha
      setFolha(null)
      if (t.ids.length > 0) setConfirmar(t)
    })
  }, [folha])

  const dialogo: ReactNode = (
    <>
      {folha && <FolhaEtiquetas etiquetas={folha.etiquetas} aoPronta={folhaPronta} />}
      <RespDialog
        aberto={!!confirmar}
        aoMudar={(a) => !a && setConfirmar(null)}
        titulo="Saiu tudo certo?"
        descricao={confirmar ? `${confirmar.etiquetas.length} ${confirmar.etiquetas.length === 1 ? "etiqueta enviada" : "etiquetas enviadas"} para imprimir.` : undefined}
      >
        <div className="flex flex-col gap-2">
          <Button
            className="h-11 w-full text-base"
            disabled={marcar.isPending}
            onClick={() => {
              if (!confirmar) return
              marcar.mutate(
                { ids: confirmar.ids },
                {
                  onSuccess: () => {
                    toast.success(`${confirmar.ids.length} ${confirmar.ids.length === 1 ? "peça marcada" : "peças marcadas"} como etiquetadas`)
                    setConfirmar(null)
                  },
                },
              )
            }}
          >
            Sim, marcar {confirmar?.ids.length ?? 0} como etiquetadas
          </Button>
          <Button
            variant="outline"
            className="h-11 w-full text-base"
            onClick={() => {
              const t = confirmar
              setConfirmar(null)
              if (t) void executar(t)
            }}
          >
            <Printer /> Reimprimir
          </Button>
        </div>
      </RespDialog>
    </>
  )

  return {
    zebra,
    imprimindo,
    dialogo,
    imprimir: (grupos: GrupoEtiquetas[]) => executar(montar(grupos)),
    imprimirTeste: () => executar(montar([], [ETIQUETA_TESTE])),
  }
}
