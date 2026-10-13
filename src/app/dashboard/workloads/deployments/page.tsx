"use client"

import { makeWorkloadPage } from "@/components/resources/workload-list-page"

export default makeWorkloadPage(
  "Deployments",
  "deployments",
  [
    { key: "metadata.name", label: "Name" },
    { key: "metadata.namespace", label: "Namespace" },
    { key: "spec.replicas", label: "Replicas" },
    { key: "status.readyReplicas", label: "Ready" },
    { key: "metadata.creationTimestamp", label: "Age" },
  ],
  { desc: { group: "apps", version: "v1", resource: "deployments" }, editable: true },
)
