import { TriangleAlert } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"

// Aviso de atenção da conferência: nenhuma peça com defeito pode seguir para a cliente.
// Amarelo de propósito (pedido do dono): destaca-se do restante, que é neutro.
export default function AvisoConferencia({ className }: { className?: string }) {
  return (
    <Alert variant="warning" className={className}>
      <TriangleAlert />
      <AlertTitle className="font-semibold">Confira cada peça com muita atenção</AlertTitle>
      <AlertDescription>
        Examine de todos os lados: solda, pedra solta, riscos, fecho e acabamento. Nenhuma peça com defeito pode
        seguir para a cliente. Na dúvida, marque "Falta".
      </AlertDescription>
    </Alert>
  )
}
