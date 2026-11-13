import * as React from "react"

import { cn } from "@/lib/utils"

// 40px, --surface-2, 1px --border; hover --border-strong; focus = global 2px ring + lighter surface.
const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-10 w-full min-w-0 rounded-md border border-border bg-surface-2 px-3 text-sm text-foreground transition-colors duration-150 ease-out placeholder:text-text-3 hover:border-border-strong focus:bg-surface-3 aria-[invalid=true]:border-destructive disabled:pointer-events-none disabled:opacity-40 [&::-webkit-search-cancel-button]:appearance-none",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
