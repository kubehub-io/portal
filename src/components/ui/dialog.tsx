import * as React from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"

const Dialog = DialogPrimitive.Root
const DialogTrigger = DialogPrimitive.Trigger
const DialogClose = DialogPrimitive.Close

const DialogPortal = DialogPrimitive.Portal

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className,
    )}
    {...props}
  />
))
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
    resizable?: boolean
  }
>(({ className, children, resizable, ...props }, ref) => {
  const [size, setSize] = React.useState<{
    width?: number
    height?: number
  } | null>(null)
  const [isDragging, setIsDragging] = React.useState(false)
  const dragStart = React.useRef({ x: 0, y: 0, w: 0, h: 0 })
  const innerRef = React.useRef<HTMLDivElement>(null)

  const setRefs = React.useCallback(
    (node: HTMLDivElement | null) => {
      innerRef.current = node
      if (typeof ref === "function") ref(node)
      else if (ref) (ref as React.MutableRefObject<HTMLDivElement | null>).current = node
    },
    [ref],
  )

  // Keep the dialog (and therefore its resize handle) inside the viewport.
  const clampSize = React.useCallback(
    (width: number, height: number) => ({
      width: Math.min(window.innerWidth - 40, Math.max(400, width)),
      height: Math.min(window.innerHeight - 40, Math.max(300, height)),
    }),
    [],
  )

  // When resizable, capture the natural size once so the dialog starts at its
  // current dimensions and can then be freely resized by the user. Clamp to the
  // viewport so the dialog (and its resize handle) never goes off-screen.
  React.useLayoutEffect(() => {
    if (resizable && innerRef.current && size === null) {
      const { offsetWidth, offsetHeight } = innerRef.current
      setSize(clampSize(offsetWidth, offsetHeight))
    }
  }, [resizable, size, clampSize])

  // Re-clamp on window resize so a resizable dialog never ends up off-screen.
  React.useEffect(() => {
    if (!resizable) return
    const onWindowResize = () => {
      const el = innerRef.current
      if (!el) return
      setSize((prev) => clampSize(prev?.width ?? el.offsetWidth, prev?.height ?? el.offsetHeight))
    }
    window.addEventListener("resize", onWindowResize)
    return () => window.removeEventListener("resize", onWindowResize)
  }, [resizable, clampSize])

  const onResizePointerDown = React.useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault()
      e.stopPropagation()
      const el = e.currentTarget.parentElement
      if (!el) return
      dragStart.current = {
        x: e.clientX,
        y: e.clientY,
        w: el.offsetWidth,
        h: el.offsetHeight,
      }
      setIsDragging(true)
    },
    [],
  )

  React.useEffect(() => {
    if (!isDragging) return
    const prevCursor = document.body.style.cursor
    const prevUserSelect = document.body.style.userSelect
    document.body.style.cursor = "nwse-resize"
    document.body.style.userSelect = "none"
    const onPointerMove = (e: PointerEvent) => {
      e.preventDefault()
      const dx = e.clientX - dragStart.current.x
      const dy = e.clientY - dragStart.current.y
      setSize(clampSize(dragStart.current.w + dx, dragStart.current.h + dy))
    }
    const onPointerUp = () => setIsDragging(false)
    window.addEventListener("pointermove", onPointerMove)
    window.addEventListener("pointerup", onPointerUp)
    return () => {
      window.removeEventListener("pointermove", onPointerMove)
      window.removeEventListener("pointerup", onPointerUp)
      document.body.style.cursor = prevCursor
      document.body.style.userSelect = prevUserSelect
    }
  }, [isDragging, clampSize])

  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        ref={setRefs}
        className={cn(
          "fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-lg",
          className,
          resizable && "resize-none grid-rows-[minmax(0,1fr)] overflow-hidden",
        )}
        style={
          resizable
            ? {
                width: size?.width,
                height: size?.height,
                maxWidth: "none",
                maxHeight: "none",
              }
            : undefined
        }
        {...props}
      >
        {children}
        {resizable && (
          <div
            role="separator"
            aria-label="Resize"
            className="absolute bottom-0 right-0 z-10 flex h-6 w-6 cursor-nwse-resize touch-none select-none items-center justify-center opacity-40 transition-opacity hover:opacity-100"
            onPointerDown={onResizePointerDown}
          >
            <svg
              viewBox="0 0 12 12"
              className="h-3 w-3"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            >
              <path d="M10 2L2 10" />
              <path d="M10 5L5 10" />
            </svg>
          </div>
        )}
        <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground">
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPortal>
  )
})
DialogContent.displayName = DialogPrimitive.Content.displayName

const DialogHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col space-y-1.5 text-center sm:text-left",
      className,
    )}
    {...props}
  />
)
DialogHeader.displayName = "DialogHeader"

const DialogFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2",
      className,
    )}
    {...props}
  />
)
DialogFooter.displayName = "DialogFooter"

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn("text-lg font-semibold leading-none tracking-tight", className)}
    {...props}
  />
))
DialogTitle.displayName = DialogPrimitive.Title.displayName

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
))
DialogDescription.displayName = DialogPrimitive.Description.displayName

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogTrigger,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
}
