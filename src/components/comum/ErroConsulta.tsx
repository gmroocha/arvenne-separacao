import { RefreshCw, TriangleAlert } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"

export function ErroConsulta({ aoTentar, carregando, comDados = false }: {
  aoTentar: () => void
  carregando: boolean
  comDados?: boolean
}) {
  return (
    <Alert variant="destructive">
      <TriangleAlert />
      <AlertDescription className="flex flex-col items-start gap-2">
        <p>Não foi possível carregar a lista. Verifique a internet e tente de novo.</p>
        {comDados && <p>Mostrando a última informação carregada.</p>}
        <Button variant="outline" onClick={aoTentar} disabled={carregando}>
          <RefreshCw /> Tentar novamente
        </Button>
      </AlertDescription>
    </Alert>
  )
}
