// Map of component id -> official project page.
// Links intentionally omit version numbers so they always point at the
// project's current documentation/source rather than a pinned release.
export const COMPONENT_LINKS: Record<string, string> = {
  konnectivityServer: "https://github.com/kubernetes-sigs/apiserver-network-proxy",
  konnectivityAgent: "https://github.com/kubernetes-sigs/apiserver-network-proxy",
  kubeApiserver: "https://github.com/kubernetes/kubernetes",
  "kube-apiserver": "https://github.com/kubernetes/kubernetes",
  kubeControllerManager: "https://github.com/kubernetes/kubernetes",
  "kube-controller-manager": "https://github.com/kubernetes/kubernetes",
  kubeScheduler: "https://github.com/kubernetes/kubernetes",
  "kube-scheduler": "https://github.com/kubernetes/kubernetes",
  "cert-manager": "https://cert-manager.io",
  cilium: "https://cilium.io",
  coredns: "https://coredns.io",
  "local-path-provisioner": "https://github.com/rancher/local-path-provisioner",
  "managed-appingress": "https://docs.kubehub.io/",
  "metrics-server": "https://github.com/kubernetes-sigs/metrics-server",
  "grafana-alloy": "https://github.com/grafana/alloy",
  "kube-state-metrics": "https://github.com/kubernetes/kube-state-metrics",
  longhorn: "https://longhorn.io",
}

export function getComponentLink(id: string): string | undefined {
  return COMPONENT_LINKS[id]
}
