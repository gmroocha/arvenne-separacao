import { createClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/banco"

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const chave = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const configurado = Boolean(url && chave)

export const supabase = createClient<Database>(url ?? "http://localhost", chave ?? "sem-chave")

export async function chamarFuncao<T>(nome: string, corpo: unknown): Promise<T> {
  const { data, error } = await supabase.functions.invoke(nome, { body: corpo as Record<string, unknown> })
  if (error) {
    const detalhe = await (error as { context?: Response }).context?.json?.().catch(() => null)
    throw new Error(detalhe?.erro ?? error.message)
  }
  return data as T
}
