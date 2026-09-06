import { spawn } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import type { ChildProcess } from "node:child_process"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, "..")

const mode = process.argv[2]

function fail(msg: string): never {
  console.error(`[start] ${msg}`)
  process.exit(1)
}

if (mode !== "dev" && mode !== "mock") {
  console.error(`[start] usage: npm start dev|mock`)
  console.error(`[start]   npm start dev  → serve out/ with out/config.json = public/dev.config.json`)
  console.error(`[start]   npm start mock → serve out/ with out/config.json = public/mock.config.json (mock listeners started on :3001, :3002, :8443)`)
  process.exit(1)
}

const outDir = path.join(root, "out")
if (!fs.existsSync(outDir)) {
  fail(`out/ not found in ${root}. Run "npm run build" first.`)
}

function collectFiles(dir: string, out: string[]): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name)
    if (entry.isDirectory()) collectFiles(p, out)
    else if (/\.(ts|tsx|js|jsx|mjs|mts|json|css)$/.test(entry.name)) out.push(p)
  }
}

function newestMtime(files: string[]): number {
  return files.reduce((max, f) => Math.max(max, fs.statSync(f).mtimeMs), 0)
}

const staleCheckRoots = ["src"]
const staleCheckFiles: string[] = []
for (const dir of staleCheckRoots) {
  if (fs.existsSync(path.join(root, dir))) collectFiles(path.join(root, dir), staleCheckFiles)
}
for (const f of ["package.json", "tsconfig.json", "next.config.ts"]) {
  if (fs.existsSync(path.join(root, f))) staleCheckFiles.push(path.join(root, f))
}
let outNewest = 0
if (fs.existsSync(path.join(outDir, "_next"))) {
  const outFiles: string[] = []
  collectFiles(path.join(outDir, "_next"), outFiles)
  outNewest = newestMtime(outFiles)
  if (outNewest > 0 && newestMtime(staleCheckFiles) > outNewest) {
    const srcTime = new Date(newestMtime(staleCheckFiles)).toLocaleTimeString()
    const outTime = new Date(outNewest).toLocaleTimeString()
    console.warn(
      `[start] WARNING: out/ is stale (source changed at ${srcTime}, out/ built at ${outTime}). ` +
        `Run "npm run build" then restart for the latest code.`,
    )
  }
}

const configSource = path.join(root, mode === "dev" ? "public/dev.config.json" : "public/mock.config.json")
if (!fs.existsSync(configSource)) {
  fail(`${path.relative(root, configSource)} is required for "${mode}" mode but does not exist`)
}

fs.copyFileSync(configSource, path.join(outDir, "config.json"))
console.log(`[start] copied ${path.relative(root, configSource)} → out/config.json`)

const children: ChildProcess[] = []
let mockExitCode = 0

if (mode === "mock") {
  const mock = spawn(process.execPath, [path.join(__dirname, "mock-server.ts")], {
    cwd: root,
    stdio: "inherit",
  })
  children.push(mock)
  mock.on("exit", (code) => {
    if (code && code !== 0) {
      mockExitCode = code
      shutdown()
    }
  })
}

const serve = spawn("npx", ["serve", outDir], { cwd: root, stdio: "inherit" })
children.push(serve)

let shuttingDown = false
function shutdown(): void {
  if (shuttingDown) return
  shuttingDown = true
  for (const child of children) child.kill("SIGTERM")
  setTimeout(() => process.exit(mockExitCode), 500).unref()
}

process.on("SIGINT", shutdown)
process.on("SIGTERM", shutdown)

serve.on("exit", (code) => {
  if (code && code !== 0) {
    fail(`npx serve exited with code ${code}`)
  }
})

console.log(`[start] "npm start ${mode}" running. Open http://localhost:3000`)