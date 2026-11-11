import { Component, type ErrorInfo, type ReactNode } from "react"
import { TriangleAlert } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"

type Props = { children: ReactNode }
type Estado = { erro: Error | null }

// Pega erro de tela (inclusive pacote que não carregou) e oferece recarregar, em vez de tela branca.
export default class ErrorBoundary extends Component<Props, Estado> {
  state: Estado = { erro: null }

  static getDerivedStateFromError(erro: Error): Estado {
    return { erro }
  }

  componentDidCatch(erro: Error, info: ErrorInfo) {
    console.error(erro, info.componentStack)
  }

  render() {
    if (!this.state.erro) return this.props.children
    return (
      <div className="mx-auto flex min-h-svh max-w-lg items-center p-4">
        <Alert variant="destructive">
          <TriangleAlert />
          <AlertTitle>Algo deu errado nesta tela</AlertTitle>
          <AlertDescription>
            <p>Recarregue a página para tentar de novo. Se continuar, avise o Gustavo.</p>
            <Button className="mt-3" onClick={() => window.location.reload()}>
              Recarregar
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    )
  }
}
