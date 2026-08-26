import { create } from "zustand"

const ACTIVE_CLUSTER_KEY = "kubehub:activeCluster"

interface ClusterMetadata {
  name: string
  etag?: string
}

interface ManagedIngressProfile {
  enabled?: boolean
  email?: string
}

interface ClusterSpec {
  region: string
  network: {
    nodePhysicalCIDR?: string
    podCIDR?: string
    serviceCIDR?: string
  }
  managedIngressProfile?: ManagedIngressProfile
  storageProfile?: { backend?: string }
}

interface OperationError {
  code?: string
  message?: string
}

interface LastOperation {
  operationName?: string
  stepName?: string
  startedOn?: string
  finishedAt?: string
  operation?: string
  state?: string
  error?: OperationError
}

interface ClusterStatus {
  publicDns: string
  state?: string
  controlPlaneComponents?: Record<string, { id?: string; version?: string }>
  lastOperation?: LastOperation
}

export interface Cluster {
  apiVersion: string
  kind: string
  metadata: ClusterMetadata
  spec: ClusterSpec
  status: ClusterStatus
}

interface ClusterState {
  clusters: Cluster[]
  activeCluster: Cluster | null
  setClusters: (clusters: Cluster[]) => void
  setActiveCluster: (cluster: Cluster | null) => void
  hydrate: () => void
}

function loadActiveCluster(): Cluster | null {
  try {
    const raw = localStorage.getItem(ACTIVE_CLUSTER_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function saveActiveCluster(cluster: Cluster | null) {
  try {
    if (cluster) {
      localStorage.setItem(ACTIVE_CLUSTER_KEY, JSON.stringify(cluster))
    } else {
      localStorage.removeItem(ACTIVE_CLUSTER_KEY)
    }
  } catch { }
}

export const useClusterStore = create<ClusterState>((set, get) => ({
  clusters: [],
  activeCluster: null,

  setClusters: (clusters) => {
    set({ clusters })
    const { activeCluster } = get()
    if (activeCluster) {
      const match = clusters.find((c) => c.metadata.name === activeCluster.metadata.name)
      if (match) {
        saveActiveCluster(match)
        set({ activeCluster: match })
      } else if (clusters.length > 0) {
        // Active cluster was removed (e.g. deleted) — pick the next available one.
        const next = clusters[0]
        saveActiveCluster(next)
        set({ activeCluster: next })
      } else {
        // No clusters left — clear the active selection.
        saveActiveCluster(null)
        set({ activeCluster: null })
      }
    } else if (clusters.length > 0) {
      const saved = loadActiveCluster()
      const match = saved ? clusters.find((c) => c.metadata.name === saved.metadata.name) : null
      const next = match ?? clusters[0]
      saveActiveCluster(next)
      set({ activeCluster: next })
    }
  },

  setActiveCluster: (cluster) => {
    saveActiveCluster(cluster)
    set({ activeCluster: cluster })
  },

  hydrate: () => {
    const saved = loadActiveCluster()
    if (saved) {
      set({ activeCluster: saved })
    }
  },
}))
