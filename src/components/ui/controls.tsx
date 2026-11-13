import * as React from 'react';
import * as SliderPrimitive from '@radix-ui/react-slider';
import * as SwitchPrimitive from '@radix-ui/react-switch';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { X } from 'lucide-react';
import { cn } from '../../lib/utils';
// shadcn/ui-style primitives, composed on Radix for accessible keyboard behavior.
export function Slider({className,'aria-label':label,...props}:React.ComponentProps<typeof SliderPrimitive.Root>){return <SliderPrimitive.Root className={cn('slider',className)} {...props}><SliderPrimitive.Track className="slider-track"><SliderPrimitive.Range className="slider-range"/></SliderPrimitive.Track><SliderPrimitive.Thumb className="slider-thumb" aria-label={label}/></SliderPrimitive.Root>;}
export function Switch(props:React.ComponentProps<typeof SwitchPrimitive.Root>){return <SwitchPrimitive.Root className="switch" {...props}><SwitchPrimitive.Thumb className="switch-thumb"/></SwitchPrimitive.Root>;}
export function Tooltip({children,label}:{children:React.ReactNode;label:string}){return <TooltipPrimitive.Root><TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger><TooltipPrimitive.Portal><TooltipPrimitive.Content sideOffset={8} className="tooltip">{label}<TooltipPrimitive.Arrow/></TooltipPrimitive.Content></TooltipPrimitive.Portal></TooltipPrimitive.Root>;}
export const TooltipProvider=TooltipPrimitive.Provider;
export function Dialog({open,onOpenChange,title,description,children}:{open:boolean;onOpenChange:(open:boolean)=>void;title:string;description:string;children:React.ReactNode}){return <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}><DialogPrimitive.Portal><DialogPrimitive.Overlay className="dialog-overlay"/><DialogPrimitive.Content className="dialog"><DialogPrimitive.Title className="dialog-title">{title}</DialogPrimitive.Title><DialogPrimitive.Description className="dialog-description">{description}</DialogPrimitive.Description><DialogPrimitive.Close className="icon-button dialog-close" aria-label="Close dialog"><X size={20}/></DialogPrimitive.Close>{children}</DialogPrimitive.Content></DialogPrimitive.Portal></DialogPrimitive.Root>;}
