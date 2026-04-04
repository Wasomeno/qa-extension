"use client"

import * as React from "react"
import * as TooltipPrimitive from "@radix-ui/react-tooltip"

import { cn } from "@/lib/utils"

const TooltipProvider = TooltipPrimitive.Provider

const Tooltip = TooltipPrimitive.Root

const TooltipTrigger = TooltipPrimitive.Trigger

const TooltipPortal = TooltipPrimitive.Portal

const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content> & {
    container?: HTMLElement | null
  }
>(({ className, sideOffset = 4, container, ...props }, ref) => (
  <TooltipPortal container={container}>
    <TooltipPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        // Base styles
        "z-[99999999] overflow-hidden rounded-lg border bg-popover px-3 py-1.5 text-sm text-popover-foreground shadow-lg",
        // Animations - faster for tooltips
        "data-[state=open]:animate-scale-in-fast data-[state=open]:animate-fade-in-fast",
        "data-[state=closed]:animate-scale-out-fast data-[state=closed]:animate-fade-out-fast",
        className
      )}
      style={{
        transformOrigin: "var(--radix-tooltip-content-transform-origin)",
      }}
      {...props}
    />
  </TooltipPortal>
))
TooltipContent.displayName = TooltipPrimitive.Content.displayName

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider, TooltipPortal }
