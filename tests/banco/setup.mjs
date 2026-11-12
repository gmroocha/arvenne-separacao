import { afterAll, afterEach, beforeAll, beforeEach } from "vitest"
import { db, preparar, fechar } from "./suporte.mjs"

beforeAll(preparar)
beforeEach(async () => { await db.exec("begin; reset role;") })
afterEach(async () => { await db.exec("rollback") })
afterAll(fechar)
