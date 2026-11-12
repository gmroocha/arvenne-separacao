import { spawnSync } from "node:child_process"
import { mkdirSync, renameSync, writeFileSync } from "node:fs"

// Introspecção, sem aplicar migration. Só substitui o arquivo depois de gerar com sucesso.
const result = spawnSync("npx", ["supabase@3.1.0", "gen", "types", "--remote", "--lang", "typescript", "--schema", "public"], {
  encoding: "utf8",
  maxBuffer: 8 * 1024 * 1024,
})
if (result.status !== 0 || !result.stdout.includes("export type Database =")) {
  process.stderr.write(result.stderr || "Não foi possível gerar os tipos. O arquivo anterior foi mantido.\n")
  process.exit(result.status || 1)
}
const target = "src/lib/gerado/database.types.ts"
mkdirSync("src/lib/gerado", { recursive: true })
writeFileSync(`${target}.tmp`, result.stdout)
renameSync(`${target}.tmp`, target)
console.log("Tipos do banco gerados; nenhuma migration foi aplicada.")
