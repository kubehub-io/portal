import { beforeEach, describe, expect, it } from "vitest"
import {
  navItemToFavorite,
  resourceTypeToFavorite,
  useResourceNavStore,
} from "@/stores/resource-nav-store"

const STORAGE_KEY = "kubehub:resourceNav"

function store() {
  return useResourceNavStore.getState()
}

describe("resource nav store", () => {
  beforeEach(() => {
    localStorage.clear()
    store().reset()
  })

  it("starts with no favorites and nothing hidden", () => {
    expect(store().favorites).toEqual([])
    expect(store().hidden).toEqual([])
  })

  it("pins and unpins a tab", () => {
    const target = navItemToFavorite("pods")!
    store().toggleFavorite(target)

    expect(store().isFavorite("pods")).toBe(true)
    expect(store().favorites[0]).toMatchObject({ id: "pods", href: "/dashboard/workloads/pods" })

    store().toggleFavorite(target)
    expect(store().favorites).toEqual([])
  })

  it("ignores unknown nav ids", () => {
    expect(navItemToFavorite("nope")).toBeNull()
  })

  it("keeps each resource type pinned independently", () => {
    store().toggleFavorite(
      resourceTypeToFavorite({
        key: "kube.example.com/v1/Widget",
        label: "Widget",
        group: "kube.example.com",
        version: "v1",
        kind: "Widget",
        href: "/dashboard/custom-resources?type=kube.example.com%2Fv1%2FWidget",
      }),
    )

    expect(store().isFavorite("crd:kube.example.com/v1/Widget")).toBe(true)
    expect(store().isFavorite("pods")).toBe(false)
  })

  it("hides and shows a tab", () => {
    store().toggleHidden("secrets")
    expect(store().isHidden("secrets")).toBe(true)
    expect(store().hidden).toEqual(["secrets"])

    store().toggleHidden("secrets")
    expect(store().isHidden("secrets")).toBe(false)
  })

  it("shows all hidden tabs at once", () => {
    store().toggleHidden("secrets")
    store().toggleHidden("events")
    store().showAll()
    expect(store().hidden).toEqual([])
  })

  it("persists favorites and hidden tabs to localStorage", () => {
    store().toggleFavorite(navItemToFavorite("deployments")!)
    store().toggleHidden("secrets")

    const persisted = JSON.parse(localStorage.getItem(STORAGE_KEY)!)
    expect(persisted.hidden).toEqual(["secrets"])
    expect(persisted.favorites.map((f: { id: string }) => f.id)).toEqual(["deployments"])

    useResourceNavStore.setState({ favorites: [], hidden: [], hydrated: false })
    store().hydrate()

    expect(store().isFavorite("deployments")).toBe(true)
    expect(store().isHidden("secrets")).toBe(true)
  })

  it("drops malformed persisted entries", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        favorites: [null, { href: "/x" }, { id: "pods", href: "/dashboard/workloads/pods" }],
        hidden: ["secrets", "secrets", 42],
      }),
    )
    useResourceNavStore.setState({ favorites: [], hidden: [], hydrated: false })
    store().hydrate()

    expect(store().favorites.map((f) => f.id)).toEqual(["pods"])
    expect(store().hidden).toEqual(["secrets"])
  })

  it("hydrates only once so later edits are not clobbered", () => {
    store().toggleFavorite(navItemToFavorite("pods")!)
    useResourceNavStore.setState({ hydrated: false })
    store().hydrate()

    expect(store().isFavorite("pods")).toBe(true)
  })

  it("clears stored preferences on reset", () => {
    store().toggleFavorite(navItemToFavorite("pods")!)
    store().reset()

    expect(store().favorites).toEqual([])
    expect(store().hidden).toEqual([])
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
  })
})