import { StickyNote } from "lucide-react"

// Nota mostrada no cartão/linha da peça.
export function NotaNaPeca({ nota, titulo }: { nota: string; titulo?: string }) {
  return (
    <div className="flex items-start gap-1.5 rounded-md bg-muted px-2 py-1 text-xs text-foreground">
      <StickyNote className="mt-px size-3.5 shrink-0 text-muted-foreground" aria-hidden />
      <span className="min-w-0 break-words">
        <span className="sr-only">Nota: </span>
        {titulo && <span className="font-medium">{titulo}: </span>}
        {nota}
      </span>
    </div>
  )
}
