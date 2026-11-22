/** Basemap styles used by Preserve. Production should mirror these internally. */
export const MAP_STYLE_LIGHT = 'https://tiles.openfreemap.org/styles/liberty';
export const MAP_STYLE_DARK = 'https://tiles.openfreemap.org/styles/dark';

export function mapStyleUrl(dark: boolean): string {
  return dark ? MAP_STYLE_DARK : MAP_STYLE_LIGHT;
}
