"use client"

import { Toaster as Sonner } from "sonner"

type ToasterProps = React.ComponentProps<typeof Sonner>

// VINYL is always dark, so next-themes is not needed.
// Bottom-center, one at a time, 4s. The offset lands the toast in the reserved
// status lane above the player bar so it never covers a control.
const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="dark"
      position="bottom-center"
      visibleToasts={1}
      duration={4000}
      gap={8}
      offset={{ bottom: "calc(var(--player-h) + 14px)" }}
      mobileOffset={{ bottom: "calc(var(--player-h) + 8px + env(safe-area-inset-bottom))", left: "16px", right: "16px" }}
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast !min-h-11 !w-auto !max-w-[480px] !gap-2 !rounded-lg !border !border-border-strong !bg-surface-3 !pl-4 !pr-11 !py-1.5 !text-xs !text-foreground !shadow-lg",
          title: "!font-normal",
          description: "!text-text-2",
          actionButton:
            "!h-8 !rounded-md !border !border-border-strong !bg-transparent !px-3 !text-xs !font-medium !text-foreground hover:!bg-surface-2",
          cancelButton: "!bg-surface-2 !text-text-2",
          closeButton:
            "!left-auto !right-1.5 !top-1.5 !transform-none !size-8 !rounded-md !border-0 !bg-transparent !text-text-2 hover:!bg-surface-2 hover:!text-foreground",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
