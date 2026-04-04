import * as React from "react"
import * as PopoverPrimitive from "@radix-ui/react-popover"

import { cn } from "@/lib/utils"

const Popover = PopoverPrimitive.Root

const PopoverTrigger = PopoverPrimitive.Trigger

const PopoverContent = React.forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content> & { container?: Element | null }
>(({ className, align = "center", sideOffset = 4, container, ...props }, ref) => (
  <PopoverPrimitive.Portal container={container}>
    <PopoverPrimitive.Content
      ref={ref}
      align={align}
      sideOffset={sideOffset}
      className={cn(
        // Base styles
        "relative z-[9999999] w-72 rounded-lg border bg-popover p-4 text-popover-foreground shadow-lg outline-none pointer-events-auto",
        // Animations
        "data-[state=open]:animate-scale-in data-[state=open]:animate-fade-in",
        "data-[state=closed]:animate-scale-out data-[state=closed]:animate-fade-out",
        className
      )}
      style={{
        transformOrigin: "var(--radix-popover-content-transform-origin)",
      }}
      {...props}
    />
  </PopoverPrimitive.Portal>
))
PopoverContent.displayName = PopoverPrimitive.Content.displayName

export { Popover, PopoverTrigger, PopoverContent }
