import { Component, type ErrorInfo, type ReactNode } from "react"
import { TriangleAlert } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { ehPacoteAntigo, recarregarUmaVez } from "@/lib/versaoNova"

type Props = { children: ReactNode }
type Estado = { erro: Error | null; recarregando?: boolean }

// Pega erro de tela (inclusive pacote que não carregou) e oferece recarregar, em vez de tela branca.
export default class ErrorBoundary extends Component<Props, Estado> {
  state: Estado = { erro: null }

  static getDerivedStateFromError(erro: Error): Estado {
    return { erro }
  }

  // Versão nova publicada com a aba aberta: recarrega sozinho em vez de mostrar o erro (V65).
  componentDidUpdate(_: Props, antes: Estado) {
    if (this.state.erro && this.state.erro !== antes.erro && ehPacoteAntigo(this.state.erro) && recarregarUmaVez()) {
      this.setState({ recarregando: true })
    }
  }

  componentDidCatch(erro: Error, info: ErrorInfo) {
    console.error(erro, info.componentStack)
  }

  render() {
    if (!this.state.erro) return this.props.children
    if (this.state.recarregando) return null
    return (
      <div className="mx-auto flex w-full max-w-lg p-4 pt-10">
        <Alert variant="destructive">
          <TriangleAlert />
          <AlertTitle>Algo deu errado nesta tela</AlertTitle>
          <AlertDescription className="flex flex-col items-start gap-3 text-pretty">
            <span>Recarregue a página para tentar de novo. Se continuar, avise o Gustavo.</span>
            <Button size="toque" onClick={() => window.location.reload()}>
              Recarregar
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    )
  }
}
