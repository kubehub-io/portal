"use client"

import { makeWorkloadPage } from "@/components/resources/workload-list-page"

export default makeWorkloadPage("Jobs", "jobs", [
  { key: "metadata.name", label: "Name" },
  { key: "metadata.namespace", label: "Namespace" },
  { key: "spec.completions", label: "Completions" },
  { key: "spec.parallelism", label: "Parallelism" },
  { key: "status.succeeded", label: "Succeeded" },
  { key: "status.failed", label: "Failed" },
  { key: "metadata.creationTimestamp", label: "Age" },
], { desc: { group: "batch", version: "v1", resource: "jobs" } })
