// Compatibilidade com o comando antigo. O Playwright inicia seu próprio servidor fictício.
import { spawnSync } from "node:child_process"
const r = spawnSync("npx", ["playwright", "test", "--grep", "cliente escolhe troca"], { stdio: "inherit" })
process.exit(r.status ?? 1)
