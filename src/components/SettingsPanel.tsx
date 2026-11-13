import { useRef } from 'react';
import { Upload } from 'lucide-react';
import { usePlayer } from '../state/store';
import { Slider, Switch, Dialog } from './ui/controls';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { RECORD_COLORS } from '../lib/palette';

export type SettingsTab = 'sound' | 'transitions' | 'turntable';

/** Sound, transitions and turntable look, behind the header's overflow menu. */
export function SettingsDialog({ tab, onTabChange, open, onOpenChange }: { tab: SettingsTab; onTabChange: (tab: SettingsTab) => void; open: boolean; onOpenChange: (open: boolean) => void }) {
  return <Dialog open={open} onOpenChange={onOpenChange} title="Settings">
    <Tabs value={tab} onValueChange={v => onTabChange(v as SettingsTab)}>
      <TabsList aria-label="Settings sections">
        <TabsTrigger value="sound">Sound</TabsTrigger>
        <TabsTrigger value="transitions">Transitions</TabsTrigger>
        <TabsTrigger value="turntable">Turntable</TabsTrigger>
      </TabsList>
      <TabsContent value="sound"><Equalizer /></TabsContent>
      <TabsContent value="transitions"><TransitionSettings /></TabsContent>
      <TabsContent value="turntable"><AppearanceSettings /></TabsContent>
    </Tabs>
  </Dialog>;
}

function Field({ label, value, children }: { label: string; value?: string; children: React.ReactNode }) {
  return <div className="field"><div className="field-label"><span>{label}</span>{value && <span className="field-value">{value}</span>}</div>{children}</div>;
}

/** Label + shadcn Select on one row. */
function SelectField<T extends string>({ id, label, value, onChange, options, disabled }: { id: string; label: string; value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; disabled?: boolean }) {
  return <div className="select-field">
    <Label htmlFor={id} className="text-sm font-normal">{label}</Label>
    <Select value={value} onValueChange={v => onChange(v as T)} disabled={disabled}>
      <SelectTrigger id={id} className="w-44"><SelectValue /></SelectTrigger>
      <SelectContent>{options.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
    </Select>
  </div>;
}

export function TransitionSettings() {
  const s = usePlayer(x => x.settings); const set = usePlayer(x => x.setSettings); const mode = usePlayer(x => x.mode);
  return <div className="settings-section">
    <div className="setting-row"><div><strong>Smooth transitions</strong><p className="hint">{mode === 'youtube' ? 'Fade out, then fade the next video in.' : 'Overlapping equal-power crossfade.'}</p></div><Switch aria-label="Smooth transitions" checked={s.transitions} onCheckedChange={transitions => set({ transitions })} /></div>
    <Field label={mode === 'local' ? 'Crossfade' : 'Fade out'} value={`${s.fadeOut}s`}><Slider aria-label={mode === 'local' ? 'Crossfade duration' : 'Fade-out duration'} min={1} max={10} step={1} value={[s.fadeOut]} disabled={!s.transitions} onValueChange={([fadeOut]) => set({ fadeOut })} /></Field>
    {mode === 'youtube' && <>
      <Field label="Fade in" value={`${s.fadeIn}s`}><Slider aria-label="Fade-in duration" min={1} max={10} step={1} value={[s.fadeIn]} disabled={!s.transitions} onValueChange={([fadeIn]) => set({ fadeIn })} /></Field>
      <SelectField id="easing" label="Curve" value={s.easing} disabled={!s.transitions} onChange={easing => set({ easing })} options={[{ value: 'smooth', label: 'Smooth' }, { value: 'linear', label: 'Linear' }]} />
    </>}
  </div>;
}

export function Equalizer() {
  const s = usePlayer(x => x.settings); const set = usePlayer(x => x.setSettings); const local = usePlayer(x => x.mode === 'local');
  return <div className="settings-section">
    {!local && <p className="hint">EQ and texture apply to local audio. YouTube audio can't be processed.</p>}
    {(['bass', 'mid', 'treble'] as const).map((key, i) => <Field key={key} label={['Bass', 'Mid', 'Treble'][i]} value={`${s[key] > 0 ? '+' : ''}${s[key]} dB`}><Slider aria-label={`${key} EQ`} min={-12} max={12} step={1} value={[s[key]]} disabled={!local} onValueChange={([value]) => set({ [key]: value })} /></Field>)}
    <Field label="Balance" value={s.balance === 0 ? 'Center' : s.balance < 0 ? 'Left' : 'Right'}><Slider aria-label="Stereo balance" min={-1} max={1} step={.05} value={[s.balance]} disabled={!local} onValueChange={([balance]) => set({ balance })} /></Field>
    <div className="setting-row"><div><strong>Vinyl crackle</strong><p className="hint">A little analog texture.</p></div><Switch aria-label="Vinyl crackle" checked={s.crackle} disabled={!local} onCheckedChange={crackle => set({ crackle })} /></div>
    <div><Button variant="outline" size="sm" disabled={!local} onClick={() => set({ bass: 0, mid: 0, treble: 0, balance: 0 })}>Reset EQ</Button></div>
  </div>;
}

export function AppearanceSettings() {
  const s = usePlayer(x => x.settings); const set = usePlayer(x => x.setSettings); const input = useRef<HTMLInputElement>(null);
  const notify = usePlayer(x => x.notify);
  return <div className="settings-section">
    <Field label="Record color" value={RECORD_COLORS.find(c => c.value === s.vinylColor)?.label || 'Custom'}>
      <div className="swatches">{RECORD_COLORS.map(c => <button type="button" key={c.value} style={{ background: c.value }} aria-label={c.label} title={c.label} aria-pressed={s.vinylColor === c.value} onClick={() => set({ vinylColor: c.value })} />)}</div>
    </Field>
    <SelectField id="rpm" label="Platter speed" value={String(s.rpm) as '33' | '45'} onChange={v => set({ rpm: Number(v) as 33 | 45 })} options={[{ value: '33', label: '33⅓ RPM' }, { value: '45', label: '45 RPM' }]} />
    <SelectField id="quality" label="3D quality" value={s.quality} onChange={quality => set({ quality })} options={[{ value: 'auto', label: 'Adaptive' }, { value: 'high', label: 'High' }, { value: 'low', label: 'Low power' }]} />
    <div className="setting-row"><div><strong>Center label</strong><p className="hint">Your own artwork, kept on this device.</p></div>
      <div className="row-actions">{s.artwork && <Button variant="outline" size="sm" onClick={() => set({ artwork: undefined })}>Reset</Button>}<Button variant="outline" onClick={() => input.current?.click()}><Upload size={16} />Choose</Button></div></div>
    <input hidden type="file" ref={input} accept="image/*" onChange={e => {
      const file = e.target.files?.[0]; if (!file) return;
      if (file.size > 5 * 1024 * 1024) { notify('Choose artwork smaller than 5 MB.'); return; }
      const reader = new FileReader();
      reader.onload = () => { const image = new Image(); image.onload = () => { const canvas = document.createElement('canvas'); canvas.width = canvas.height = 512; const ctx = canvas.getContext('2d')!; const side = Math.min(image.width, image.height); ctx.drawImage(image, (image.width - side) / 2, (image.height - side) / 2, side, side, 0, 0, 512, 512); set({ artwork: canvas.toDataURL('image/jpeg', .85) }); }; image.onerror = () => notify('This artwork could not be opened. Try PNG, JPEG or WebP.'); image.src = String(reader.result); };
      reader.readAsDataURL(file);
    }} />
  </div>;
}
