"use client"

import * as React from "react"
import * as TooltipPrimitive from "@radix-ui/react-tooltip"

import { cn } from "@/lib/utils"

const TooltipProvider = TooltipPrimitive.Provider

const Tooltip = TooltipPrimitive.Root

const TooltipTrigger = TooltipPrimitive.Trigger

/**
 * TooltipContentWithPortal - A tooltip that renders its content inside a specified container.
 * Use this when the tooltip needs to be rendered inside a portal/modal context.
 */
const TooltipContentWithPortal = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content> & {
    container?: HTMLElement | null;
  }
>(({ className, sideOffset = 4, container, ...props }, ref) => (
  <TooltipPrimitive.Portal container={container}>
    <TooltipPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        "rounded-md border bg-white px-3 py-1.5 text-sm text-gray-900 shadow-md",
        className
      )}
      style={{
        transformOrigin: "var(--radix-tooltip-content-transform-origin)",
        zIndex: 999999999,
      }}
      {...props}
    />
  </TooltipPrimitive.Portal>
))
TooltipContentWithPortal.displayName = "TooltipContentWithPortal"

export { Tooltip, TooltipTrigger, TooltipProvider, TooltipContentWithPortal }
