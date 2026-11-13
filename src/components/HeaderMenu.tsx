import { Info, Palette, SlidersHorizontal } from 'lucide-react';
import { Menu } from './ui/controls';

export type MenuAction = 'sound' | 'turntable' | 'about';

/** Overflow menu that replaces the separate info and settings icons. */
export function HeaderMenu({ onSelect }: { onSelect: (action: MenuAction) => void }) {
  return <Menu label="Settings and info" triggerSize="md" items={[
    { label: 'Sound & transitions', icon: <SlidersHorizontal size={16} />, onSelect: () => onSelect('sound') },
    { label: 'Turntable look', icon: <Palette size={16} />, onSelect: () => onSelect('turntable') },
    { label: 'About & shortcuts', icon: <Info size={16} />, onSelect: () => onSelect('about') },
  ]} />;
}
