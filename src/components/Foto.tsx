import { useState } from "react"
import { Gem, X } from "lucide-react"
import { AspectRatio } from "@/components/ui/aspect-ratio"
import { Button } from "@/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { fotoTamanho } from "@/lib/foto"
import { cn } from "@/lib/utils"

type Props = { url: string | null; alt?: string; ampliar?: boolean; className?: string }

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
    <div className={cn("flex size-full items-center justify-center rounded-md bg-muted text-muted-foreground", className)}>
      <Gem className="size-1/3" />
    </div>
  )
}

export default function Foto({ url, alt = "", ampliar, className }: Props) {
  const [aberta, setAberta] = useState(false)
  const quadro = (
    <AspectRatio ratio={1} className="overflow-hidden rounded-md bg-muted ring-1 ring-foreground/15 ring-inset">
      <Imagem url={miniatura(url)} alt={alt} />
    </AspectRatio>
  )
  if (!ampliar || !url) return <div className={className}>{quadro}</div>
  return (
    <>
      <button type="button" className={cn("block w-full cursor-zoom-in", className)} onClick={() => setAberta(true)}>
        {quadro}
      </button>
      <Dialog open={aberta} onOpenChange={setAberta}>
        <DialogContent showCloseButton={false} className="w-full max-w-[calc(100%-2rem)] gap-0 rounded-xl border-0 bg-transparent p-0 shadow-none ring-0 sm:max-w-2xl">
          <DialogTitle className="sr-only">{alt || "Foto da peça"}</DialogTitle>
          <DialogDescription className="sr-only">Foto ampliada</DialogDescription>
          {/* Ampliada: pede a foto grande à Shopify (a miniatura vem com width pequeno). */}
          <img draggable={false} src={fotoTamanho(url, 1200) ?? url} alt={alt} className="mx-auto max-h-[85svh] w-full rounded-xl object-contain" />
          <DialogClose asChild>
            <Button size="icon" variant="ghost" className="absolute top-2 right-2 rounded-full bg-background/80 text-foreground shadow backdrop-blur hover:bg-background">
              <X />
              <span className="sr-only">Fechar</span>
            </Button>
          </DialogClose>
        </DialogContent>
      </Dialog>
    </>
  )
}
