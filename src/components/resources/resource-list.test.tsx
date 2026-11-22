import { render, screen, fireEvent } from "@testing-library/react"
import { ResourceList } from "@/components/resources/resource-list"
import type { ColumnDef } from "@/components/resources/data-table"

const columns: ColumnDef[] = [{ key: "metadata.name", label: "Name" }]
const items = Array.from({ length: 25 }, (_, i) => ({
  metadata: { name: `item-${i}`, uid: `uid-${i}` },
}))

function dataRows() {
  return screen.getAllByRole("row").slice(1)
}

describe("ResourceList", () => {
  it("paginates the full list with a configurable page size", () => {
    render(<ResourceList columns={columns} data={items} />)

    expect(screen.getByText("25 items")).toBeInTheDocument()
    expect(screen.getByText("Page 1 of 3")).toBeInTheDocument()
    expect(dataRows()).toHaveLength(10)

    fireEvent.click(screen.getByRole("button", { name: "Next page" }))
    expect(screen.getByText("Page 2 of 3")).toBeInTheDocument()
    expect(dataRows()[0]).toHaveTextContent("item-10")
  })

  it("filters across columns and resets the page", () => {
    render(<ResourceList columns={columns} data={items} />)

    fireEvent.click(screen.getByRole("button", { name: "Next page" }))
    expect(screen.getByText("Page 2 of 3")).toBeInTheDocument()

    fireEvent.change(screen.getByRole("textbox", { name: "Filter resources" }), {
      target: { value: "item-2" },
    })

    // item-2 plus item-20..item-24
    expect(screen.getByText("6 items")).toBeInTheDocument()
    expect(screen.getByText("Page 1 of 1")).toBeInTheDocument()
    expect(dataRows()).toHaveLength(6)
  })

  it("supports a custom page size and hides controls when asked", () => {
    render(
      <ResourceList
        columns={columns}
        data={items}
        defaultPageSize={5}
        showPageSize={false}
        filterable={false}
      />,
    )

    expect(screen.queryByRole("textbox", { name: "Filter resources" })).not.toBeInTheDocument()
    expect(screen.getByText("Page 1 of 5")).toBeInTheDocument()
    expect(dataRows()).toHaveLength(5)
  })

  it("clamps the page when the list shrinks", () => {
    const { rerender } = render(<ResourceList columns={columns} data={items} />)
    fireEvent.click(screen.getByRole("button", { name: "Next page" }))
    fireEvent.click(screen.getByRole("button", { name: "Next page" }))
    expect(screen.getByText("Page 3 of 3")).toBeInTheDocument()

    rerender(<ResourceList columns={columns} data={items.slice(0, 3)} />)
    expect(screen.getByText("Page 1 of 1")).toBeInTheDocument()
    expect(dataRows()).toHaveLength(3)
  })
})
