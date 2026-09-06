import { execFileSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const certDir = path.resolve(__dirname, "../../.mock-certs")
const keyPath = path.join(certDir, "localhost-key.pem")
const certPath = path.join(certDir, "localhost-cert.pem")

export type MockCerts = { key: Buffer; cert: Buffer }

function readCerts(): MockCerts {
  return { key: fs.readFileSync(keyPath), cert: fs.readFileSync(certPath) }
}

export function getMockCerts(): MockCerts {
  if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
    return readCerts()
  }

  fs.mkdirSync(certDir, { recursive: true })
  try {
    execFileSync(
      "openssl",
      [
        "req",
        "-x509",
        "-newkey",
        "rsa:2048",
        "-keyout",
        keyPath,
        "-out",
        certPath,
        "-days",
        "365",
        "-nodes",
        "-subj",
        "/CN=localhost",
        "-addext",
        "subjectAltName=DNS:localhost,IP:127.0.0.1",
      ],
      { stdio: "pipe" },
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(
      "[mock] Failed to generate a self-signed certificate with openssl:",
      message,
    )
    console.error(
      "[mock] The OIDC issuer in public/mock.config.json uses https, which requires a local TLS cert.",
    )
    console.error(
      "[mock] Install openssl and retry, or change \"issuer\" to http://localhost:3001/... to serve plain HTTP.",
    )
    process.exit(1)
  }

  return readCerts()
}