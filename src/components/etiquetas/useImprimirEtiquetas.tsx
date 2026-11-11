import { useCallback, useEffect, useRef, useState, type ReactNode } from "react"
import { toast } from "sonner"
import { ETIQUETA_TESTE, etiquetasDoLote, skuImprimivel, zpl, type Etiqueta, type GrupoEtiquetas } from "@/lib/etiquetas"
import { detectar, imprimir as imprimirNaZebra, type DispositivoZebra } from "@/lib/zebra"
import FolhaEtiquetas from "./FolhaEtiquetas"

type Trabalho = { grupos: GrupoEtiquetas[]; etiquetas: Etiqueta[] }

// Imprime etiquetas: direto na Zebra (Browser Print) quando ele responde; senão, pelo diálogo do navegador.
// Não marca nada: a etiqueta é colada no saquinho depois, e a pessoa marca "Etiquetada" peça por peça.
export function useImprimirEtiquetas() {
  const [zebra, setZebra] = useState<DispositivoZebra | null>(null)
  const [folha, setFolha] = useState<Trabalho | null>(null)
  const [imprimindo, setImprimindo] = useState(false)
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
  })

  const executar = useCallback(async (t: Trabalho) => {
    if (t.etiquetas.length === 0) {
      toast.info("Nada para imprimir: falta o código (SKU) da peça")
      return
    }
    const ruim = t.etiquetas.find((e) => e.tipo === "peca" && !skuImprimivel(e.sku))
    if (ruim && ruim.tipo === "peca") {
      toast.error(`O código "${ruim.sku}" tem acento ou símbolo que a etiqueta não aceita. Corrija o SKU da peça antes de imprimir.`)
      return
    }
    setImprimindo(true)
    try {
      const dispositivo = await detectar()
      setZebra(dispositivo)
      if (dispositivo) {
        try {
          await imprimirNaZebra(dispositivo, zpl(t.etiquetas))
          toast.success(t.etiquetas.length === 1 ? "Etiqueta enviada à Zebra" : `${t.etiquetas.length} etiquetas enviadas à Zebra`)
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
      setFolha(null)
    })
  }, [folha])

  const dialogo: ReactNode = (
    <>
      {folha && <FolhaEtiquetas
          etiquetas={folha.etiquetas}
          aoPronta={folhaPronta}
          aoErro={(m) => {
            toast.error(m)
            noPapel.current = true
            setFolha(null)
          }}
        />}
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
