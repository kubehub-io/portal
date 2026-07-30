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
            <p className="step-desc">Run one command on your machine. Our agent connects outbound — no open ports, no router config.</p>
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
            <div className="feature-icon">🌐</div>
            <h3 className="feature-title">Public Apps</h3>
            <p className="feature-desc">Expose apps at <code>{`{name}.mykube.app`}</code> with automatic SSL, DNS, and routing. No router config needed.</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">🔒</div>
            <h3 className="feature-title">Local Apps</h3>
            <p className="feature-desc">Internal apps at <code>{`{name}.local.mykube.app`}</code> — SSL included, only reachable on your network.</p>
          </div>
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
            <p className="feature-desc">1 cluster, 10 local apps, 5 public apps, up to 3 nodes. No credit card required.</p>
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
                <strong>You handle the compute.</strong> Your machines stay at home. They connect outbound to the API server — no inbound ports, no router config, no static IP needed.
              </div>
            </div>
            <div className="arch-point">
              <div className="arch-point-icon">🔐</div>
              <div>
                <strong>You keep your own data.</strong> Your secrets, your app data, your volumes — all remain on your hardware. We never touch them.
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
              <li>10 local apps</li>
              <li>5 public apps</li>
              <li>OIDC authentication</li>
              <li>Web shell access</li>
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
              <p>In the meantime, consider <a href="#">donating</a> to support hosting.</p>
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
              <p>Totally fair. You have a couple of options:</p>
              <ul>
                <li>Use hostPath mounts on your node to store secrets locally.</li>
                <li>Use <code>secrets-store-csi-driver</code> with a self-hosted HashiCorp Vault.</li>
              </ul>
            </div>
          </details>
          <details className="faq-item">
            <summary className="faq-question">Can I run this on a VM?</summary>
            <div className="faq-answer">
              <p>Yes, and we encourage you to try it on a VM first! Just keep in mind: if your VM goes down, we may reclaim the control plane to free resources. Also Local-only apps won&apos;t be reachable outside the host running the VM (unless you do proper setup)</p>
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
              <p>Yes, as long as you get a slot. Slots renew every 3 months (limited by cert lifespan). We are building a paid plan experience where you will get a secured spot.</p>
            </div>
          </details>
          <details className="faq-item">
            <summary className="faq-question">What if I want a custom domain for my app?</summary>
            <div className="faq-answer">
              <p>Custom domain support is on the roadmap! For now you can:</p>
              <ul>
                <li><strong>Self-manage:</strong> Use NodePort, configure your router, and point your DNS to your public IP.</li>
                <li><strong>KubeHub managed:</strong> Let us handle DNS, TLS, and routing automatically on our <code>*.mykube.app</code> domains.</li>
              </ul>
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
            <a href="#" className="footer-link">Status</a>
          </div>
          <div className="footer-col">
            <h4 className="footer-col-title">Contact</h4>
            <a href="mailto:admin@kubehub.io" className="footer-link">admin@kubehub.io</a>
          </div>
          <div className="footer-col">
            <h4 className="footer-col-title">Legal</h4>
            <a href="#" className="footer-link">Privacy</a>
            <a href="#" className="footer-link">Terms</a>
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
        <ArchitectureSection />
        <PricingSection />
        <FaqSection />
      </main>
      <FooterSection />
    </div>
  )
}
