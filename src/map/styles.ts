/** Basemap styles — production should mirror on internal tile hosts. */
export const MAP_STYLE_LIGHT = 'https://tiles.openfreemap.org/styles/liberty';
export const MAP_STYLE_DARK = 'https://tiles.openfreemap.org/styles/dark';

export function mapStyleUrl(dark: boolean): string {
  return dark ? MAP_STYLE_DARK : MAP_STYLE_LIGHT;
}

/** OpenMapTiles source id used by OpenFreeMap styles for extrusion. */
export const OMT_SOURCE = 'openmaptiles';
