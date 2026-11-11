import { describe, expect, it } from "vitest"
import {
  findPvForPvc,
  getPvClaimRef,
  getPvMountState,
  getPvMounts,
  getPvReclaimPolicy,
  getPvcDeletionImpact,
} from "@/lib/persistent-volumes"

function volume(overrides: {
  name?: string
  policy?: string
  namespace?: string
  claimName?: string
}) {
  return {
    metadata: { name: overrides.name ?? "pv-data" },
    spec: {
      persistentVolumeReclaimPolicy: overrides.policy ?? "Retain",
      claimRef: {
        namespace: overrides.namespace ?? "app",
        name: overrides.claimName ?? "data",
      },
    },
  }
}

function claim(overrides: { name?: string; namespace?: string; volumeName?: string }) {
  return {
    metadata: {
      name: overrides.name ?? "data",
      namespace: overrides.namespace ?? "app",
    },
    spec: { volumeName: overrides.volumeName },
  }
}

function pod(overrides: {
  name: string
  namespace?: string
  claimName?: string
  node?: string
  phase?: string
}) {
  return {
    metadata: {
      name: overrides.name,
      namespace: overrides.namespace ?? "app",
    },
    spec: {
      nodeName: overrides.node ?? "node-1",
      volumes: [
        { name: "data", persistentVolumeClaim: { claimName: overrides.claimName ?? "data" } },
      ],
    },
    status: { phase: overrides.phase ?? "Running" },
  }
}

describe("persistent volume helpers", () => {
  it("reads reclaim policy and claimRef", () => {
    const pv = volume({ policy: "Delete" })
    expect(getPvReclaimPolicy(pv)).toBe("Delete")
    expect(getPvClaimRef(pv)).toEqual({ namespace: "app", name: "data" })
  })

  it("finds the PV for a claim by volumeName", () => {
    const pvs = [volume({ name: "other", claimName: "other" }), volume({ name: "pv-data" })]
    expect(findPvForPvc(claim({ volumeName: "pv-data" }), pvs)).toBe(pvs[1])
  })

  it("falls back to a matching claimRef", () => {
    const pvs = [volume({ name: "pv-data" })]
    expect(findPvForPvc(claim({}), pvs)).toBe(pvs[0])
  })

  it("warns that a Retain volume leaves the disk behind", () => {
    expect(getPvcDeletionImpact(claim({ volumeName: "pv-data" }), [volume({ policy: "Retain" })])).toEqual({
      action: "retain",
      policy: "Retain",
      volumeName: "pv-data",
    })
  })

  it("warns that a Delete volume deletes the disk", () => {
    expect(getPvcDeletionImpact(claim({ volumeName: "pv-data" }), [volume({ policy: "Delete" })])).toEqual({
      action: "delete",
      policy: "Delete",
      volumeName: "pv-data",
    })
  })

  it("reports unbound claims and unknown policies", () => {
    expect(getPvcDeletionImpact(claim({}), [])).toEqual({ action: "unbound" })
    expect(getPvcDeletionImpact(claim({ volumeName: "pv-data" }), [])).toEqual({
      action: "unknown",
      volumeName: "pv-data",
    })
    expect(
      getPvcDeletionImpact(claim({ volumeName: "pv-data" }), [
        volume({ policy: "Recycle" }),
      ]),
    ).toEqual({ action: "unknown", policy: "Recycle", volumeName: "pv-data" })
  })

  it("finds pods mounting the bound claim and their nodes", () => {
    const mounts = getPvMounts(volume({}), [
      pod({ name: "web-0", node: "node-1" }),
      pod({ name: "web-1", node: "node-2" }),
      pod({ name: "elsewhere", namespace: "other" }),
      pod({ name: "other-claim", claimName: "other" }),
      pod({ name: "finished", phase: "Succeeded" }),
    ])

    expect(mounts).toEqual([
      { namespace: "app", pod: "web-0", node: "node-1", phase: "Running" },
      { namespace: "app", pod: "web-1", node: "node-2", phase: "Running" },
    ])
  })

  it("distinguishes unbound, bound-not-mounted and mounted volumes", () => {
    expect(getPvMountState(volume({ claimName: "", namespace: "" }), [])).toBe("unbound")
    expect(getPvMountState(volume({}), [])).toBe("not-mounted")
    expect(getPvMountState(volume({}), [pod({ name: "web-0" })])).toBe("mounted")
  })
})
