"use client"

import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import { useTheme } from "@/components/theme-provider"
import {
  generatePKCEChallenge,
  generateState,
  buildAuthorizeUrl,
} from "@/lib/auth/pkce"
import "./landing.css"

const PKCE_KEY = "kubehub:pkce"
const STATE_KEY = "kubehub:state"

function LoginButton({ className = "" }: { className?: string }) {
  const [loggingIn, setLoggingIn] = useState(false)

  const handleLogin = useCallback(async () => {
    setLoggingIn(true)
    try {
      const { verifier, challenge } = await generatePKCEChallenge()
      const state = generateState()
      sessionStorage.setItem(PKCE_KEY, verifier)
      sessionStorage.setItem(STATE_KEY, state)
      const url = await buildAuthorizeUrl(challenge, state)
      window.location.href = url
    } catch (err) {
      console.error("Login failed", err)
      setLoggingIn(false)
    }
  }, [])

  return (
    <button className={className} onClick={handleLogin} disabled={loggingIn}>
      {loggingIn ? "Redirecting..." : "Login"}
    </button>
  )
}

const nextTheme: Record<string, "light" | "dark" | "system"> = {
  system: "light",
  light: "dark",
  dark: "system",
}

function ThemeToggle() {
  const { theme, setTheme } = useTheme()

  return (
    <button
      className="theme-toggle"
      onClick={() => setTheme(nextTheme[theme])}
      title={`Theme: ${theme}`}
      aria-label="Toggle theme"
    >
      {theme === "system" ? (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
          <line x1="8" y1="21" x2="16" y2="21" />
          <line x1="12" y1="17" x2="12" y2="21" />
        </svg>
      ) : theme === "dark" ? (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      ) : (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="5" />
          <line x1="12" y1="1" x2="12" y2="3" />
          <line x1="12" y1="21" x2="12" y2="23" />
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
          <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
          <line x1="1" y1="12" x2="3" y2="12" />
          <line x1="21" y1="12" x2="23" y2="12" />
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
          <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
        </svg>
      )}
    </button>
  )
}

function Header() {
  const [scrolled, setScrolled] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  return (
    <header className={`header${scrolled ? " scrolled" : ""}`}>
      <div className="container header-inner">
        <Link href="/" className="logo">KubeHub</Link>
        <nav className={`nav${mobileOpen ? " mobile-open" : ""}`}>
          <a href="https://docs.kubehub.io" className="nav-link">Docs</a>
          <a href="https://github.com/kubehub-io" className="nav-link">GitHub</a>
          <ThemeToggle />
          <LoginButton className="btn btn-primary nav-cta" />
        </nav>
        <button
          className={`mobile-menu-btn${mobileOpen ? " active" : ""}`}
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label="Menu"
        >
          <span></span><span></span><span></span>
        </button>
      </div>
    </header>
  )
}

function HeroSection() {
  return (
    <section className="hero" id="hero">
      <div className="hero-bg" />
      <div className="container hero-inner">
        <div className="hero-content">
          <div className="hero-badge">Now in public beta</div>
          <h1 className="hero-title">
            Your <span className="gradient-text">personal cloud</span>, running on your own machine.
          </h1>
          <p className="hero-subtitle">
            Got an old laptop gathering dust? Turn it into a Kubernetes node — we run the control plane for you.
          </p>
          <div className="hero-actions" id="cta">
            <LoginButton className="btn btn-primary btn-lg" />
            <a href="#how-it-works" className="btn btn-secondary btn-lg">See how it works</a>
          </div>
          <p className="hero-footnote">No credit card. Just your GitHub, Google, or Microsoft account.</p>
        </div>

      </div>
    </section>
  )
}

function HowItWorksSection() {
  return (
    <section className="section" id="how-it-works">
      <div className="container">
        <div className="section-header">
          <h2 className="section-title">How it works</h2>
          <p className="section-subtitle">Four steps to your own Kubernetes cluster</p>
        </div>
        <div className="steps">
          <div className="step-card">
            <div className="step-number">1</div>
            <h3 className="step-title">Login</h3>
            <p className="step-desc">Sign in with your GitHub, Google, or Microsoft account. No credit card needed — we just need to know it&apos;s you.</p>
          </div>
          <div className="step-connector">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>
          </div>
          <div className="step-card">
            <div className="step-number">2</div>
            <h3 className="step-title">Create cluster</h3>
            <p className="step-desc">Give your cluster a name and pick your region. We provision a control plane for you in seconds.</p>
          </div>
          <div className="step-connector">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>
          </div>
          <div className="step-card">
            <div className="step-number">3</div>
            <h3 className="step-title">Onboard a Node</h3>
            <p className="step-desc">Install Linux, then run one command on your machine. Our agent connects outbound — no open ports, no router config.</p>
          </div>
          <div className="step-connector">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>
          </div>
          <div className="step-card">
            <div className="step-number">4</div>
            <h3 className="step-title">Ready to rock</h3>
            <p className="step-desc">Download your kubeconfig and use kubectl, Lens, or the built-in web shell. Your Kubernetes cluster is live.</p>
          </div>
        </div>
      </div>
    </section>
  )
}

function UseCasesSection() {
  return (
    <section className="section section-alt" id="use-cases">
      <div className="container">
        <div className="section-header">
          <h2 className="section-title">What you can run</h2>
          <p className="section-subtitle">Your cluster, your apps — on your hardware</p>
        </div>
        <div className="usecases-grid">
          <div className="usecase-card">
            <div className="usecase-icon">🎬</div>
            <h3 className="usecase-title">Media Server</h3>
            <p className="usecase-desc">Self-host Jellyfin, Immich, or Plex on your own hardware. No cloud storage fees.</p>
          </div>
          <div className="usecase-card">
            <div className="usecase-icon">⚔️</div>
            <h3 className="usecase-title">Game Server</h3>
            <p className="usecase-desc">Run a Minecraft or Valheim server for you and your friends. Full control, no monthly rental.</p>
          </div>
          <div className="usecase-card">
            <div className="usecase-icon">🛠️</div>
            <h3 className="usecase-title">Dev Environment</h3>
            <p className="usecase-desc">Spin up dev containers, Git servers, CI runners — treat it like your personal GitHub Actions.</p>
          </div>
          <div className="usecase-card">
            <div className="usecase-icon">🤖</div>
            <h3 className="usecase-title">Agent / Sandbox</h3>
            <p className="usecase-desc">Experiment with AI agents and automated workflows in your own isolated cluster.</p>
          </div>
        </div>
      </div>
    </section>
  )
}

function FeaturesSection() {
  return (
    <section className="section" id="features">
      <div className="container">
        <div className="section-header">
          <h2 className="section-title">Everything included</h2>
          <p className="section-subtitle">We handle the hard parts. You get the good parts.</p>
        </div>
        <div className="features-grid">
          <div className="feature-card">
            <div className="feature-icon">🔑</div>
            <h3 className="feature-title">OIDC Auth</h3>
            <p className="feature-desc">Login with GitHub, Google, or Microsoft. No passwords to manage.</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">💻</div>
            <h3 className="feature-title">Web Shell</h3>
            <p className="feature-desc">Shell into your cluster from any browser, protected by OIDC auth.</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">📦</div>
            <h3 className="feature-title">Free Tier</h3>
            <p className="feature-desc">1 cluster, unlimited internal app exposure, 5 public app exposures, and up to 3 nodes. No credit card required.</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">🧩</div>
            <h3 className="feature-title">Huge Ecosystem</h3>
            <p className="feature-desc">All sorts of server app you can find and deploy.</p>
          </div>
        </div>
      </div>
    </section>
  )
}

function ExposeAppsSection() {
  return (
    <section className="section section-alt" id="expose-apps">
      <div className="container">
        <div className="section-header">
          <h2 className="section-title">Expose your apps</h2>
          <p className="section-subtitle">We support multiple way to expose your apps</p>
        </div>
        <div className="features-grid">
          <div className="feature-card">
            <div className="feature-icon">☁️</div>
            <h3 className="feature-title">HubHttpRoute</h3>
            <p className="feature-desc">
              Use <code>HubHttpRoute</code> for a low-touch solution with a cloud proxy. Your app is available at <code>{`{name}-xxxxxx.mykube.app`}</code>. 
            </p>
            <p className="feature-desc">
              No requirement on public IP, no need to config network/router.
            </p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">🌐</div>
            <h3 className="feature-title">HubGatewayProfile</h3>
            <p className="feature-desc">Use <code>HubGatewayProfile</code> to provision native Kubernetes Gateway.</p>
            <ul className="feature-list">
              <li><strong>Internal:</strong> <code>{`*.******.localkube.app`}</code> — reachable only on your local network.</li>
              <li><strong>Public:</strong> <code>{`*.******.mykube.app`}</code> — reachable from the internet.</li>
            </ul>
            <p className="feature-desc">
              No cloud proxy involved, your app get served directly on your server, <strong>requires some network setup</strong>.
            </p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">🌐</div>
            <h3 className="feature-title">Kubernetes Gateway API</h3>
            <p className="feature-desc">Manual config</p>
            <ul className="feature-list">
              <li><strong>Custom domain</strong></li>
              <li><strong>Advanced use case</strong></li>
            </ul>
            <p className="feature-desc">
              Advanced user can config Kubernetes Gateway API directly if you have your own domain, or need advanced use case.
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}

function ArchitectureSection() {
  return (
    <section className="section section-alt" id="architecture">
      <div className="container">
        <div className="section-header">
          <h2 className="section-title">Architecture</h2>
          <p className="section-subtitle">We handle the cluster. You handle the compute, your data kept local.</p>
        </div>
        <div className="arch-content">
          <div className="arch-text">
            <div className="arch-point">
              <div className="arch-point-icon">☸</div>
              <div>
                <strong>We handle the control plane.</strong> Your API server, scheduler, and controller manager run on our infrastructure — highly available and always reachable.
              </div>
            </div>
            <div className="arch-point">
              <div className="arch-point-icon">🖥️</div>
              <div>
                <strong>You handle the compute.</strong> Your machines stay at home. They connect outbound to the API server — no inbound ports needed.
              </div>
            </div>
            <div className="arch-point">
              <div className="arch-point-icon">🔐</div>
              <div>
                <strong>Your app data stays local.</strong> App data and persistent volumes remain on your hardware. Kubernetes resources spec (Pod/Deployment/Daemonset/Configmap/Secrets/...) stores in etcd on server side along with apiserver; use a self-hosted github.com/hashicorp/vault when secrets need to stay on your node.
              </div>
            </div>
          </div>

        </div>
      </div>
    </section>
  )
}

function PricingSection() {
  return (
    <section className="section" id="pricing">
      <div className="container">
        <div className="section-header">
          <h2 className="section-title">Pricing</h2>
          <p className="section-subtitle">Start free. Upgrade when you outgrow it.</p>
        </div>
        <div className="pricing-grid">
          <div className="pricing-card pricing-card--featured">
            <div className="pricing-badge">Start here</div>
            <h3 className="pricing-name">Free</h3>
            <div className="pricing-amount">$0</div>
            <p className="pricing-period"> — no credit card required</p>
            <ul className="pricing-features">
              <li>1 Kubernetes cluster</li>
              <li>Up to 3 nodes</li>
              <li>Unlimited internal app exposure</li>
              <li>5 public app exposures</li>
              <li>OIDC authentication</li>
              <li>Web shell access</li>
              <li>Logs/Metrics</li>
              <li>Community support</li>
            </ul>
            <LoginButton className="btn btn-primary btn-lg btn-block" />
          </div>
          <div className="pricing-card">
            <h3 className="pricing-name">Pro</h3>
            <div className="pricing-amount">—</div>
            <p className="pricing-period">coming later</p>
            <ul className="pricing-features">
              <li>HA control plane</li>
              <li>Unlock more nodes</li>
              <li>More exposed apps</li>
              <li>Premium monitoring</li>
              <li>Priority support</li>
            </ul>
            <div className="pricing-coming">
              <p>Not ready yet.</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function FaqSection() {
  return (
    <section className="section section-alt" id="faq">
      <div className="container">
        <div className="section-header">
          <h2 className="section-title">FAQ</h2>
          <p className="section-subtitle">Questions we hear a lot</p>
        </div>
        <div className="faq-list">
          <details className="faq-item" open>
            <summary className="faq-question">I can manage my own K8s cluster. Why would I need this?</summary>
            <div className="faq-answer">
              <p>Then you&apos;re not our target user — and that&apos;s fine! Not everyone can afford to manage TLS, ingress, logging, metrics, and alerts on their own. We handle the operations so you can focus on running apps.</p>
            </div>
          </details>
          <details className="faq-item">
            <summary className="faq-question">I don&apos;t trust to store my app secret in hosted control-plane. What are my options?</summary>
            <div className="faq-answer">
              <p>Totally fair. Kubernetes Secrets are stored in the hosted control plane for cluster operations. If you need secrets to stay on your hardware, you have a couple of options:</p>
              <ul>
                <li>Use hostPath mounts on your node to store secrets locally.</li>
                <li>Use <code>secrets-store-csi-driver</code> with a <a href="https://developer.hashicorp.com/vault/docs/platform/k8s/csi" target="_blank" rel="noreferrer">self-hosted HashiCorp Vault</a>.</li>
              </ul>
            </div>
          </details>
          <details className="faq-item">
            <summary className="faq-question">Can I run this on a VM?</summary>
            <div className="faq-answer">
              <p>Yes, and we encourage you to try it on a VM first! Keep in mind that if your VM stays offline for 30 consecutive days, we may reclaim the hosted control plane to free resources. Local-only apps won&apos;t be reachable outside the host running the VM unless you do additional network setup.</p>
            </div>
          </details>
          <details className="faq-item">
            <summary className="faq-question">I have a VM and a physical machine — can I use both?</summary>
            <div className="faq-answer">
              <p>Only if they&apos;re on the same CIDR. Kubernetes requires all nodes in a cluster to have network connectivity between them.</p>
            </div>
          </details>
          <details className="faq-item">
            <summary className="faq-question">How many nodes do I need?</summary>
            <div className="faq-answer">
              <p>One node is enough. You can always add more later if you need extra resources or want to spread workloads across machines.</p>
            </div>
          </details>
          <details className="faq-item">
            <summary className="faq-question">Is this free?</summary>
            <div className="faq-answer">
              <p>Yes, but we have limited capacity, controlplane does take quite some resources. We are building a paid plan experience where you will get a secured spot.</p>
            </div>
          </details>
          <details className="faq-item">
            <summary className="faq-question">What if I want a custom domain for my app?</summary>
            <div className="faq-answer">
              <p>Yes. Follow our <a href="https://docs.kubehub.io/bring_your_own_domain/" target="_blank" rel="noreferrer">Bring Your Own Domain guide</a> to point your domain at a KubeHub app.</p>
            </div>
          </details>
        </div>
      </div>
    </section>
  )
}

function FooterSection() {
  return (
    <footer className="footer">
      <div className="container footer-inner">
        <div className="footer-brand">
          <div className="logo">KubeHub</div>
          <p className="footer-tagline">Your personal cloud, running on your own machine.</p>
        </div>
        <div className="footer-links">
          <div className="footer-col">
            <h4 className="footer-col-title">Resources</h4>
            <a href="https://docs.kubehub.io" className="footer-link">Docs</a>
            <a href="https://github.com/kubehub-io" className="footer-link">GitHub</a>
          </div>
          <div className="footer-col">
            <h4 className="footer-col-title">Contact</h4>
            <a href="mailto:admin@kubehub.io" className="footer-link">admin@kubehub.io</a>
          </div>
          <div className="footer-col">
            <h4 className="footer-col-title">Legal</h4>
            <a href="/privacy" className="footer-link">Privacy</a>
          </div>
        </div>
      </div>
      <div className="container footer-bottom">
        <p>&copy; 2026 KubeHub. All rights reserved.</p>
      </div>
    </footer>
  )
}

export default function LandingPage() {
  return (
    <div className="landing-page">
      <Header />
      <main>
        <HeroSection />
        <HowItWorksSection />
        <UseCasesSection />
        <FeaturesSection />
        <ExposeAppsSection />
        <ArchitectureSection />
        <PricingSection />
        <FaqSection />
      </main>
      <FooterSection />
    </div>
  )
}
