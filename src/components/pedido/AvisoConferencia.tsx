import { TriangleAlert } from "lucide-react"
import { cn } from "@/lib/utils"

// Aviso de atenção da conferência: nenhuma peça com defeito pode seguir para a cliente.
// Amarelo de propósito (pedido do dono): destaca-se do restante, que é neutro.
export default function AvisoConferencia({ className }: { className?: string }) {
  return (
    <div
      role="note"
      className={cn(
        "flex gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-amber-800 dark:text-amber-200",
        className,
      )}
    >
      <TriangleAlert className="mt-0.5 size-5 shrink-0" />
      <div className="flex flex-col gap-0.5 text-sm">
        <span className="font-semibold">Confira cada peça com muita atenção</span>
        <span>
          Examine de todos os lados: solda, pedra solta, riscos, fecho e acabamento. Nenhuma peça com defeito pode
          seguir para a cliente. Na dúvida, marque "Defeito".
        </span>
      </div>
    </div>
  )
}
