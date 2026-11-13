/**
 * Content colors (record pressings and collection tints). These are data the
 * 3D scene paints with, not UI colors; UI colors live in src/theme.css.
 */
export const RECORD_COLORS = [
  { value: '#131516', label: 'Classic black' },
  { value: '#354d3e', label: 'Forest green' },
  { value: '#753c31', label: 'Oxblood' },
  { value: '#a6946f', label: 'Sand' },
  { value: '#3b4f68', label: 'Slate blue' },
] as const;
export const DEFAULT_RECORD_COLOR = RECORD_COLORS[0].value;
export const COLLECTION_TINT = { youtube: '#c38f7a', local: '#9daeb6' } as const;
