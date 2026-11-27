"use client"

import { makeWorkloadPage } from "@/components/resources/workload-list-page"

export default makeWorkloadPage("CronJobs", "cronjobs", [
  { key: "metadata.name", label: "Name" },
  { key: "metadata.namespace", label: "Namespace" },
  { key: "spec.schedule", label: "Schedule" },
  { key: "spec.suspend", label: "Suspended" },
  { key: "status.lastScheduleTime", label: "Last Schedule" },
  { key: "metadata.creationTimestamp", label: "Age" },
], { desc: { group: "batch", version: "v1", resource: "cronjobs" } })
