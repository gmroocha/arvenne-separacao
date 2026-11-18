import { useState, type MouseEvent } from "react"
import DetalhePeca from "@/components/comum/DetalhePeca"
import type { PecaDetalhe } from "@/lib/detalhePeca"
import { Gem } from "lucide-react"
import { AspectRatio } from "@/components/ui/aspect-ratio"
import { fotoTamanho } from "@/lib/foto"
import { cn } from "@/lib/utils"

type Props = {
  url: string | null
  alt?: string
  ampliar?: boolean
  // Detalhe da peça (código, nome, variante, quantidade, preço, nota): a janela da foto mostra isso embaixo.
  peca?: PecaDetalhe | null
  className?: string
}

// Miniaturas sem transformação pediam o original inteiro da Shopify (até vários MB).
// Preserve as menores já pedidas pelo chamador; a ampliação abaixo continua em 1200 px.
function miniatura(url: string | null): string | null {
  if (!url) return url
  try {
    const largura = Number(new URL(url).searchParams.get("width"))
    return largura > 0 && largura <= 600 ? url : fotoTamanho(url, 600)
  } catch { return url }
}

function Imagem({ url, alt, className }: { url: string | null; alt: string; className?: string }) {
  return url ? (
    <img draggable={false} src={url} alt={alt} loading="lazy" className={cn("size-full rounded-md object-cover", className)} />
  ) : (
    <div className={cn("@container flex size-full items-center justify-center rounded-md bg-muted text-muted-foreground", className)}>
      {/* Em miniatura (até 48 px) o ícone a 1/3 ficava com 12 px e o traço virava borrão: lá ele ocupa metade. */}
      <Gem className="size-1/3 @max-[3rem]:size-1/2" />
    </div>
  )
}

export default function Foto({ url, alt = "", ampliar, peca, className }: Props) {
  const [aberta, setAberta] = useState(false)
  // Miniatura e proporção lidas da foto que já está na tela: a ampliada abre no tamanho final na hora.
  const [previa, setPrevia] = useState<{ src: string | null; proporcao: number }>({ src: null, proporcao: 1 })
  function abrir(e: MouseEvent<HTMLButtonElement>) {
    const img = e.currentTarget.querySelector("img")
    const proporcao = img && img.naturalWidth > 0 && img.naturalHeight > 0 ? img.naturalWidth / img.naturalHeight : 1
    setPrevia({ src: img?.complete ? img.currentSrc || img.src : null, proporcao })
    setAberta(true)
  }
  const quadro = (
    <AspectRatio ratio={1} className="overflow-hidden rounded-md bg-muted ring-1 ring-foreground/15 ring-inset">
      <Imagem url={miniatura(url)} alt={alt} />
    </AspectRatio>
  )
  // Com o detalhe da peça, tocar abre mesmo sem foto (a foto é só uma parte do detalhe).
  if (!ampliar || (!url && !peca)) return <div className={className}>{quadro}</div>
  return (
    <>
      <button type="button" className={cn("block w-full cursor-zoom-in", className)} onClick={abrir}>
        {quadro}
      </button>
      <DetalhePeca aberto={aberta} aoMudar={setAberta} foto={url} previa={previa.src} proporcao={previa.proporcao} peca={peca ? { ...peca, nome: peca.nome || alt } : null} />
    </>
  )
}
