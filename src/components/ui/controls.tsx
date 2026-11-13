import * as React from 'react';
import { MoreHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button, type ButtonProps } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tooltip as TooltipRoot, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Dialog as DialogRoot, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { TabsList, TabsTrigger } from '@/components/ui/tabs';

/** VINYL compositions of shadcn/ui primitives. The primitives themselves live next to this file. */
export { Slider } from '@/components/ui/slider';
export { Switch } from '@/components/ui/switch';
export { TooltipProvider };

/** shadcn Tooltip with an optional keyboard-shortcut hint. */
export function Tooltip({ children, label, shortcut, side = 'top' }: { children: React.ReactNode; label: string; shortcut?: string; side?: 'top' | 'bottom' | 'left' | 'right' }) {
  return <TooltipRoot><TooltipTrigger asChild>{children}</TooltipTrigger><TooltipContent side={side}>{label}{shortcut && <kbd>{shortcut}</kbd>}</TooltipContent></TooltipRoot>;
}

type IconButtonProps = Omit<ButtonProps, 'aria-label' | 'size'> & { label: string; shortcut?: string; side?: 'top' | 'bottom' | 'left' | 'right'; size?: 'sm' | 'md' | 'lg' };
/** Ghost icon Button (36px). A label is required: it is both the aria-label and the tooltip. */
export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(({ label, shortcut, side, size = 'md', variant = 'ghost', className, children, ...props }, ref) => (
  <Tooltip label={label} shortcut={shortcut} side={side}>
    <Button ref={ref} variant={variant} size={size === 'lg' ? 'icon-lg' : 'icon'} aria-label={label} aria-keyshortcuts={shortcut} className={cn('btn-icon', className)} {...props}>{children}</Button>
  </Tooltip>
));
IconButton.displayName = 'IconButton';

/** shadcn Dialog with VINYL's title/description layout. */
export function Dialog({ open, onOpenChange, title, description, children }: { open: boolean; onOpenChange: (open: boolean) => void; title: string; description?: string; children: React.ReactNode }) {
  return <DialogRoot open={open} onOpenChange={onOpenChange}>
    <DialogContent {...(description ? {} : { 'aria-describedby': undefined })}>
      <div className="flex flex-col gap-1.5"><DialogTitle>{title}</DialogTitle>{description && <DialogDescription>{description}</DialogDescription>}</div>
      <div>{children}</div>
    </DialogContent>
  </DialogRoot>;
}

/**
 * Segmented control: a shadcn TabsList with a 150ms sliding indicator.
 * Must be rendered inside a shadcn <Tabs>; Radix supplies role="tablist" and arrow keys.
 */
export function Segmented<T extends string>({ value, options, label }: { value: T; options: { value: T; label: React.ReactNode; icon?: React.ReactNode }[]; label: string }) {
  const at = Math.max(0, options.findIndex(o => o.value === value));
  return <TabsList aria-label={label} className="segmented" style={{ '--segments': options.length, '--active': at } as React.CSSProperties}>
    <span className="segmented-indicator" aria-hidden="true" />
    {options.map(o => <TabsTrigger key={o.value} value={o.value} className="data-[state=active]:border-transparent data-[state=active]:bg-transparent">{o.icon}{o.label}</TabsTrigger>)}
  </TabsList>;
}

export interface MenuItem { label: string; icon?: React.ReactNode; onSelect: () => void; danger?: boolean; disabled?: boolean }
/** "⋯" menu: shadcn DropdownMenu (portalled, so scroll containers never clip it). */
export function Menu({ label, items, icon, triggerSize = 'sm', align = 'end' }: { label: string; items: MenuItem[]; icon?: React.ReactNode; triggerSize?: 'sm' | 'md'; align?: 'start' | 'end' }) {
  return <DropdownMenu modal={false}>
    <Tooltip label={label}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={label} className={cn('btn-icon', triggerSize === 'sm' && 'size-9')} onClick={e => e.stopPropagation()}>{icon || <MoreHorizontal size={16} />}</Button>
      </DropdownMenuTrigger>
    </Tooltip>
    <DropdownMenuContent align={align} aria-label={label}>
      {items.map(item => <DropdownMenuItem key={item.label} disabled={item.disabled} onSelect={() => item.onSelect()} className={item.danger ? 'text-destructive focus:text-destructive [&>svg]:text-destructive' : undefined}>{item.icon}{item.label}</DropdownMenuItem>)}
    </DropdownMenuContent>
  </DropdownMenu>;
}

/** Inline rename on a shadcn Input. Enter saves, Escape cancels, blur saves. */
export function InlineRename({ value, label, onDone }: { value: string; label: string; onDone: (value: string | null) => void }) {
  const [text, setText] = React.useState(value); const done = React.useRef(false);
  const finish = (v: string | null) => { if (done.current) return; done.current = true; onDone(v); };
  return <Input className="h-8" aria-label={label} value={text} autoFocus maxLength={80} onFocus={e => e.currentTarget.select()} onChange={e => setText(e.target.value)}
    onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); finish(text); } if (e.key === 'Escape') { e.preventDefault(); finish(null); } }} onBlur={() => finish(text)} onClick={e => e.stopPropagation()} />;
}
