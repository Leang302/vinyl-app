import * as React from "react"
import * as SliderPrimitive from "@radix-ui/react-slider"

import { cn } from "@/lib/utils"

// 4px --surface-3 track, --primary fill, 12px thumb shown on hover/focus/drag.
// `children` render inside the track under the fill (used for the buffered bar).
// `aria-label` is forwarded to the thumb, which is the focusable slider element.
const Slider = React.forwardRef<
  React.ElementRef<typeof SliderPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root>
>(({ className, children, "aria-label": label, "aria-valuetext": valueText, ...props }, ref) => (
  <SliderPrimitive.Root
    ref={ref}
    className={cn(
      "group relative flex h-5 w-full cursor-pointer touch-none select-none items-center data-[disabled]:pointer-events-none data-[disabled]:opacity-40",
      className
    )}
    {...props}
  >
    <SliderPrimitive.Track className="relative h-1 w-full grow overflow-hidden rounded-full bg-surface-3">
      {children}
      <SliderPrimitive.Range className="absolute h-full bg-primary" />
    </SliderPrimitive.Track>
    <SliderPrimitive.Thumb
      aria-label={label}
      aria-valuetext={valueText}
      className="block size-3 rounded-full bg-foreground shadow-md opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-active:opacity-100 focus-visible:opacity-100"
    />
  </SliderPrimitive.Root>
))
Slider.displayName = SliderPrimitive.Root.displayName

export { Slider }
