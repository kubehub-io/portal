import Link from "next/link"

export default function PrivacyPage() {
  return (
    <main className="mx-auto min-h-screen max-w-3xl px-6 py-16 text-foreground">
      <Link href="/" className="text-sm text-primary hover:underline">← KubeHub home</Link>
      <h1 className="mt-6 text-4xl font-bold tracking-tight">Privacy at KubeHub</h1>
      <p className="mt-3 text-muted-foreground">Last updated November 15, 2026</p>

      <div className="mt-10 space-y-8 leading-7">
        <section>
          <h2 className="text-xl font-semibold">What we store</h2>
          <p className="mt-2">
            We store your sign-in identity and the account, cluster, and billing information needed to provide KubeHub. The hosted control plane also stores Kubernetes control-plane data, including Kubernetes Secrets, because it is required to operate your cluster.
          </p>
        </section>
        <section>
          <h2 className="text-xl font-semibold">What stays on your hardware</h2>
          <p className="mt-2">
            Your workloads, application data, and persistent volumes run on your nodes and remain there. KubeHub does not copy application files or volume contents into its hosted service. If you need secret values to remain on your hardware too, use a self-hosted secret manager such as Vault.
          </p>
        </section>
        <section>
          <h2 className="text-xl font-semibold">Access and telemetry</h2>
          <p className="mt-2">
            We process requests, audit information, and basic service telemetry to authenticate users, secure the platform, troubleshoot failures, and keep the service reliable. We do not sell personal information or use your application data for advertising.
          </p>
        </section>
        <section>
          <h2 className="text-xl font-semibold">Questions</h2>
          <p className="mt-2">
            For privacy questions or deletion requests, contact <a className="text-primary hover:underline" href="mailto:admin@kubehub.io">admin@kubehub.io</a>.
          </p>
        </section>
      </div>
    </main>
  )
}
