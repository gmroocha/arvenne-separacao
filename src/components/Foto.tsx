import { useState } from "react"
import { Gem } from "lucide-react"
import { AspectRatio } from "@/components/ui/aspect-ratio"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

type Props = { url: string | null; alt?: string; ampliar?: boolean; className?: string }

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
      <Imagem url={url} alt={alt} />
    </AspectRatio>
  )
  if (!ampliar || !url) return <div className={className}>{quadro}</div>
  return (
    <>
      <button type="button" className={cn("block w-full cursor-zoom-in", className)} onClick={() => setAberta(true)}>
        {quadro}
      </button>
      <Dialog open={aberta} onOpenChange={setAberta}>
        <DialogContent className="sm:max-w-xl">
          <DialogTitle className="sr-only">{alt || "Foto da peça"}</DialogTitle>
          <DialogDescription className="sr-only">Foto ampliada</DialogDescription>
          <img draggable={false} src={url} alt={alt} className="max-h-[80svh] w-full rounded-md object-contain" />
        </DialogContent>
      </Dialog>
    </>
  )
}
