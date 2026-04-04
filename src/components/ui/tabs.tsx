import * as React from "react"
import * as TabsPrimitive from "@radix-ui/react-tabs"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const Tabs = TabsPrimitive.Root

const tabsListVariants = cva(
  "inline-flex h-10 items-center justify-center rounded-md bg-muted p-1 text-muted-foreground relative",
  {
    variants: {
      variant: {
        default: "",
        line: "w-full justify-start bg-transparent p-0 h-auto gap-6 rounded-none border-b",
        "line-sliding": "w-full justify-start bg-transparent p-0 h-auto gap-6 rounded-none border-b overflow-hidden",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

interface SlidingIndicatorProps {
  activeIndex: number
  tabRefs: React.MutableRefObject<(HTMLElement | null)[]>
  containerRef: React.RefObject<HTMLDivElement | null>
}

const SlidingIndicator: React.FC<SlidingIndicatorProps> = ({
  activeIndex,
  tabRefs,
  containerRef,
}) => {
  const [style, setStyle] = React.useState<React.CSSProperties>({})

  React.useEffect(() => {
    const updateIndicator = () => {
      if (!tabRefs.current || !containerRef.current) return
      
      const activeTab = tabRefs.current[activeIndex]
      const container = containerRef.current

      if (activeTab && container) {
        const containerRect = container.getBoundingClientRect()
        const tabRect = activeTab.getBoundingClientRect()

        const left = tabRect.left - containerRect.left
        const width = tabRect.width

        setStyle({
          position: "absolute",
          left: `${left}px`,
          width: `${width}px`,
          bottom: 0,
          height: "2px",
          backgroundColor: "rgb(24 24 27)", // zinc-900
          borderRadius: "2px 2px 0 0",
          transition: "left 300ms cubic-bezier(0.4, 0, 0.2, 1), width 300ms cubic-bezier(0.4, 0, 0.2, 1)",
        })
      }
    }

    // Small delay to ensure DOM is ready
    const timeoutId = setTimeout(updateIndicator, 0)

    // Also update on resize
    window.addEventListener("resize", updateIndicator)

    return () => {
      clearTimeout(timeoutId)
      window.removeEventListener("resize", updateIndicator)
    }
  }, [activeIndex, tabRefs, containerRef])

  return <div style={style} className="pointer-events-none" />
}

const SlidingTabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List> &
    VariantProps<typeof tabsListVariants>
>(({ className, variant, children, ...props }, ref) => {
  const internalRef = React.useRef<HTMLDivElement>(null)
  const [activeIndex, setActiveIndex] = React.useState(0)
  const tabRefs = React.useRef<(HTMLElement | null)[]>([])

  // Find initial active index from default value or first tab
  React.useEffect(() => {
    const findActiveIndex = () => {
      const container = internalRef.current
      if (!container) return
      
      const activeTrigger = container.querySelector('[data-state="active"]')
      if (activeTrigger) {
        const index = tabRefs.current.indexOf(activeTrigger as HTMLElement)
        if (index !== -1) {
          setActiveIndex(index)
        }
      }
    }
    
    // Delay to ensure Radix has set the initial state
    const timeoutId = setTimeout(findActiveIndex, 50)
    return () => clearTimeout(timeoutId)
  }, [])

  // Merge external ref with internal ref
  React.useEffect(() => {
    if (ref) {
      if (typeof ref === "function") {
        ref(internalRef.current)
      } else {
        (ref as React.MutableRefObject<HTMLDivElement | null>).current = internalRef.current
      }
    }
  }, [ref])

  return (
    <TabsPrimitive.List
      ref={internalRef}
      className={cn(tabsListVariants({ variant }), className)}
      {...props}
    >
      {React.Children.map(children, (child, index) => {
        if (React.isValidElement(child) && child.type === TabsTrigger) {
          return React.cloneElement(child as React.ReactElement<any>, {
            ref: (node: HTMLElement | null) => {
              tabRefs.current[index] = node
              // Merge with existing ref if any
              const existingRef = (child as any).ref
              if (existingRef) {
                if (typeof existingRef === "function") {
                  existingRef(node)
                } else if (typeof existingRef === "object") {
                  (existingRef as React.MutableRefObject<any>).current = node
                }
              }
            },
            onClick: () => {
              setActiveIndex(index)
              // Also call original onClick if exists
              const originalOnClick = (child as any).props?.onClick
              if (originalOnClick) {
                originalOnClick()
              }
            },
          })
        }
        return child
      })}
      {variant === "line-sliding" && (
        <SlidingIndicator
          activeIndex={activeIndex}
          tabRefs={tabRefs}
          containerRef={internalRef}
        />
      )}
    </TabsPrimitive.List>
  )
})
SlidingTabsList.displayName = TabsPrimitive.List.displayName

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List> &
    VariantProps<typeof tabsListVariants>
>(({ className, variant, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(tabsListVariants({ variant }), className)}
    {...props}
  />
))
TabsList.displayName = TabsPrimitive.List.displayName

const tabsTriggerVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm",
  {
    variants: {
      variant: {
        default: "",
        line: "rounded-none border-b-2 border-transparent data-[state=active]:border-zinc-900 data-[state=active]:bg-transparent data-[state=active]:shadow-none px-0 pb-2 pt-0 text-zinc-500 data-[state=active]:text-zinc-900",
        "line-sliding": "rounded-none border-b-2 border-transparent data-[state=active]:bg-transparent data-[state=active]:shadow-none px-0 pb-2 pt-0 text-zinc-500 data-[state=active]:text-zinc-900 data-[state=active]:border-transparent transition-colors duration-300",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger> &
    VariantProps<typeof tabsTriggerVariants>
>(({ className, variant, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(tabsTriggerVariants({ variant }), className)}
    {...props}
  />
))
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      "mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      className
    )}
    {...props}
  />
))
TabsContent.displayName = TabsPrimitive.Content.displayName

export { Tabs, TabsList, SlidingTabsList, TabsTrigger, TabsContent }
