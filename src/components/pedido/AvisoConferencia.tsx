import { TriangleAlert } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"

// Como fazer a conferência, passo a passo: aparece no diálogo antes de entrar nela e no topo da etapa.
// Amarelo de propósito (pedido do dono): destaca-se do restante, que é neutro.
export default function AvisoConferencia({ className }: { className?: string }) {
  return (
    <Alert variant="warning" className={className}>
      <TriangleAlert />
      <AlertTitle className="font-semibold">Confira cada peça com muita atenção</AlertTitle>
      <AlertDescription className="text-pretty">
        <ol className="flex list-decimal flex-col gap-1 pl-4">
          <li>Pegue o saquinho de cada modelo e separe a quantidade certa do pedido (o número em "Separe" na peça).</li>
          <li>Examine cada unidade de todos os lados: solda, pedra solta, riscos, fecho e acabamento.</li>
          <li>Confira a etiqueta e cole no saquinho de cada peça (imprima todas no topo da Separação).</li>
          <li>Tudo certo: toque em "Conferida". Faltou unidade ou tem defeito: marque "Falta". Nenhuma peça com defeito segue para a cliente.</li>
        </ol>
      </AlertDescription>
    </Alert>
  )
}
