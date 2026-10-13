"use client"

import { makeWorkloadPage } from "@/components/resources/workload-list-page"

export default makeWorkloadPage(
  "DaemonSets",
  "daemonsets",
  [
    { key: "metadata.name", label: "Name" },
    { key: "metadata.namespace", label: "Namespace" },
    { key: "status.desiredNumberScheduled", label: "Desired" },
    { key: "status.currentNumberScheduled", label: "Current" },
    { key: "metadata.creationTimestamp", label: "Age" },
  ],
  { desc: { group: "apps", version: "v1", resource: "daemonsets" }, editable: true },
)
