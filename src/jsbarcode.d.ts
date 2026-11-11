declare module "jsbarcode" {
  type Opcoes = {
    format?: string
    width?: number
    height?: number
    displayValue?: boolean
    margin?: number
  }
  export default function JsBarcode(alvo: SVGElement | string, texto: string, opcoes?: Opcoes): void
}
