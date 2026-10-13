"use client"

import { makeWorkloadPage } from "@/components/resources/workload-list-page"

// Owned by the owning Deployment; the portal only offers delete here.
export default makeWorkloadPage(
  "ReplicaSets",
  "replicasets",
  [
    { key: "metadata.name", label: "Name" },
    { key: "metadata.namespace", label: "Namespace" },
    { key: "spec.replicas", label: "Desired" },
    { key: "status.readyReplicas", label: "Ready" },
    { key: "metadata.creationTimestamp", label: "Age" },
  ],
  { desc: { group: "apps", version: "v1", resource: "replicasets" } },
)
