'use client';

import 'maplibre-gl/dist/maplibre-gl.css';
import { Card } from '@/components/ui/card';
import { getCentroid } from '@/lib/country-centroids';
import { formatHhi, formatNumber, formatPct, hhiLabel, hhiSeverity } from '@/lib/format';
import { RELAY_COLORS } from '@/lib/relay-visuals';
import { cn } from '@/lib/utils';
import type { ConcentrationKey, ConcentrationResponse } from '@tor-sockets/api-contract';
import { RotateCcw } from 'lucide-react';
import maplibregl, {
  FullscreenControl,
  type Map as MLMap,
  NavigationControl,
  ScaleControl,
} from 'maplibre-gl';
import { useEffect, useRef, useState } from 'react';

type Role = 'guard' | 'exit' | 'balanced';

type Feature = GeoJSON.Feature<
  GeoJSON.Point,
  {
    country: string;
    relay_count: number;
    consensus_weight_sum: number;
    guard_pct: number;
    exit_pct: number;
    dominant: Role;
    size: number;
  }
>;

const CARTO_DARK = {
  version: 8,
  sources: {
    carto: {
      type: 'raster',
      tiles: ['https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '&copy; OpenStreetMap &copy; CARTO',
    },
  },
  layers: [{ id: 'carto-tiles', type: 'raster', source: 'carto' }],
};

const DEFAULT_VIEW = { center: [10, 30] as [number, number], zoom: 1.2 };

const SEV_TEXT: Record<string, string> = {
  low: 'text-sev-low',
  moderate: 'text-sev-medium',
  high: 'text-sev-critical',
};

// ISO2 → flag emoji + readable name (no bundled dataset needed).
function countryFlag(cc: string): string {
  if (!cc || cc.length !== 2 || !/^[a-zA-Z]{2}$/.test(cc)) return '';
  return cc.toUpperCase().replace(/./g, (c) => String.fromCodePoint(127397 + c.charCodeAt(0)));
}

const REGION =
  typeof Intl !== 'undefined' ? new Intl.DisplayNames(['en'], { type: 'region' }) : null;
function countryName(cc: string): string {
  if (!cc) return 'Unknown';
  try {
    return REGION?.of(cc.toUpperCase()) ?? cc.toUpperCase();
  } catch {
    return cc.toUpperCase();
  }
}

function toFeatures(keys: ConcentrationKey[]): Feature[] {
  const points = keys
    .map((k) => {
      const centroid = getCentroid(k.key);
      if (!centroid) return null;
      return {
        country: k.key,
        centroid,
        relay_count: k.relay_count,
        consensus_weight_sum: k.consensus_weight_sum,
        guard_pct: k.guard_weight_pct ?? 0,
        exit_pct: k.exit_weight_pct ?? 0,
      };
    })
    .filter((p): p is NonNullable<typeof p> => p !== null);

  const maxWeight = Math.max(...points.map((p) => p.consensus_weight_sum), 1);

  return points.map((p) => {
    const { lng, lat } = p.centroid;
    const dominant: Role =
      Math.abs(p.guard_pct - p.exit_pct) < 5
        ? 'balanced'
        : p.guard_pct > p.exit_pct
          ? 'guard'
          : 'exit';
    return {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [lng, lat] },
      properties: {
        country: p.country.toUpperCase(),
        relay_count: p.relay_count,
        consensus_weight_sum: p.consensus_weight_sum,
        guard_pct: p.guard_pct,
        exit_pct: p.exit_pct,
        dominant,
        size: Math.sqrt(p.consensus_weight_sum / maxWeight),
      },
    } as Feature;
  });
}

function popupHtml(p: Feature['properties'], withLink: boolean): string {
  const cc = p.country;
  const flag = countryFlag(cc);
  const name = countryName(cc);
  return `<div style="min-width:170px">
    <div style="display:flex;align-items:center;gap:6px;font-weight:600;font-size:13px">
      ${flag ? `<span aria-hidden="true">${flag}</span>` : ''}<span>${name}</span>
    </div>
    <div style="color:var(--muted-foreground);font-size:11px;margin-top:3px">
      ${formatNumber(p.relay_count)} relays · ${formatNumber(p.consensus_weight_sum)} weight
    </div>
    <div style="margin-top:5px;font-size:11px;display:flex;gap:10px">
      <span style="color:var(--role-guard)">guard ${formatPct(p.guard_pct)}</span>
      <span style="color:var(--role-exit)">exit ${formatPct(p.exit_pct)}</span>
    </div>
    ${
      withLink
        ? `<a href="/relays?country=${encodeURIComponent(cc)}" style="display:inline-block;margin-top:7px;color:var(--primary);font-size:11px;font-weight:500;text-decoration:none">View relays in ${name} →</a>`
        : ''
    }
  </div>`;
}

export function RelayMap({ data }: { data: ConcentrationResponse }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const [ready, setReady] = useState(false);

  const keys = data.keys;
  const totalWeight = data.total_consensus_weight || 1;
  const top = [...keys]
    .sort((a, b) => b.consensus_weight_sum - a.consensus_weight_sum)
    .slice(0, 10);
  const severity = hhiSeverity(data.hhi);

  const onSelect = (cc: string) => {
    const map = mapRef.current;
    if (!map) return;
    const c = getCentroid(cc);
    if (!c) return;
    map.flyTo({
      center: [c.lng, c.lat],
      zoom: Math.max(map.getZoom(), 3.5),
      duration: 900,
    });
  };

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: CARTO_DARK as maplibregl.StyleSpecification,
      center: DEFAULT_VIEW.center,
      zoom: DEFAULT_VIEW.zoom,
      minZoom: 1,
      maxZoom: 8,
      attributionControl: { compact: true },
    });
    mapRef.current = map;

    map.addControl(new NavigationControl({ visualizePitch: false }), 'top-right');
    map.addControl(new FullscreenControl({ container: containerRef.current }), 'top-right');
    map.addControl(new ScaleControl({ unit: 'metric', maxWidth: 160 }), 'bottom-right');

    map.on('load', () => {
      const features = toFeatures(keys);
      const { guard, exit, balanced } = RELAY_COLORS;
      const bgStroke = RELAY_COLORS.background;

      map.addSource('relays', { type: 'geojson', data: { type: 'FeatureCollection', features } });

      map.addLayer({
        id: 'relay-halo',
        type: 'circle',
        source: 'relays',
        paint: {
          'circle-color': ['match', ['get', 'dominant'], 'guard', guard, 'exit', exit, balanced],
          'circle-radius': ['interpolate', ['linear'], ['get', 'size'], 0, 8, 1, 26],
          'circle-opacity': 0.15,
          'circle-blur': 1,
        },
      });

      map.addLayer({
        id: 'relay-points',
        type: 'circle',
        source: 'relays',
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['get', 'size'], 0, 3, 1, 11],
          'circle-color': ['match', ['get', 'dominant'], 'guard', guard, 'exit', exit, balanced],
          'circle-stroke-color': bgStroke,
          'circle-stroke-width': 1,
          'circle-opacity': 0.9,
        },
      });

      const hover = new maplibregl.Popup({
        closeButton: false,
        closeOnClick: false,
        offset: 14,
        className: 'relay-popup',
      });
      const clickPopup = new maplibregl.Popup({
        closeButton: true,
        closeOnClick: true,
        offset: 14,
        className: 'relay-popup',
      });

      const onMove = (e: maplibregl.MapMouseEvent & { features?: GeoJSON.Feature[] }) => {
        map.getCanvas().style.cursor = 'pointer';
        const f = e.features?.[0] as Feature | undefined;
        if (!f) return;
        hover.setLngLat(e.lngLat).setHTML(popupHtml(f.properties, false)).addTo(map);
      };
      const onLeave = () => {
        map.getCanvas().style.cursor = '';
        hover.remove();
      };
      const onClick = (e: maplibregl.MapMouseEvent & { features?: GeoJSON.Feature[] }) => {
        const f = e.features?.[0] as Feature | undefined;
        if (!f) return;
        clickPopup.setLngLat(e.lngLat).setHTML(popupHtml(f.properties, true)).addTo(map);
      };

      map.on('mouseenter', 'relay-points', onMove);
      map.on('mousemove', 'relay-points', onMove);
      map.on('mouseleave', 'relay-points', onLeave);
      map.on('click', 'relay-points', onClick);

      setReady(true);
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // keys is the country-aggregate snapshot; re-init only when the reference
    // changes (new consensus → new prop from the RSC).
  }, [keys]);

  return (
    <div className="space-y-4">
      {/* Concentration stats strip */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-border/60 bg-card/40 px-4 py-2.5">
        <span className="font-condensed text-[11px] font-medium tracking-[0.12em] text-muted-foreground uppercase">
          Top share
        </span>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {top.slice(0, 3).map((k) => {
            const share = totalWeight ? (k.consensus_weight_sum / totalWeight) * 100 : 0;
            const flag = countryFlag(k.key);
            return (
              <button
                key={k.key}
                type="button"
                onClick={() => onSelect(k.key)}
                className="inline-flex items-center gap-1.5 text-sm transition-colors hover:text-primary"
              >
                {flag ? <span aria-hidden="true">{flag}</span> : null}
                <span className="text-foreground">{countryName(k.key)}</span>
                <span className="font-mono text-xs tabular-nums text-muted-foreground">
                  {share.toFixed(1)}%
                </span>
              </button>
            );
          })}
        </div>
        <div className="ml-auto flex items-center gap-2 border-l border-border/60 pl-4">
          <span className="font-condensed text-[11px] font-medium tracking-[0.12em] text-muted-foreground uppercase">
            HHI
          </span>
          <span className={cn('font-mono text-sm font-semibold tabular-nums', SEV_TEXT[severity])}>
            {formatHhi(data.hhi)}
          </span>
          <span className={cn('text-xs', SEV_TEXT[severity])}>{hhiLabel(data.hhi)}</span>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        {/* Map */}
        <div className="relative h-[calc(100dvh-17rem)] min-h-[460px] w-full overflow-hidden rounded-xl border border-border bg-card">
          <div ref={containerRef} className="size-full" />
          {!ready ? (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
              loading map…
            </div>
          ) : null}

          <button
            type="button"
            onClick={() =>
              mapRef.current?.flyTo({
                center: DEFAULT_VIEW.center,
                zoom: DEFAULT_VIEW.zoom,
                duration: 900,
              })
            }
            className="absolute top-3 left-3 z-10 inline-flex items-center gap-1.5 rounded-md border border-border bg-background/80 px-2.5 py-1.5 text-xs font-medium backdrop-blur transition-colors hover:bg-secondary hover:text-foreground"
          >
            <RotateCcw className="size-3.5" /> Reset
          </button>

          <MapLegend />
        </div>

        {/* Top countries panel */}
        <Card className="flex flex-col gap-0 overflow-hidden py-0 lg:h-[calc(100dvh-17rem)] lg:min-h-[460px]">
          <div className="border-b border-border/60 px-4 py-3">
            <p className="font-condensed text-[11px] font-medium tracking-[0.12em] text-muted-foreground uppercase">
              Top countries
            </p>
            <p className="text-xs text-muted-foreground/70">by consensus weight · click to fly</p>
          </div>
          <ul className="flex-1 overflow-y-auto p-2">
            {top.map((k, i) => {
              const share = totalWeight ? (k.consensus_weight_sum / totalWeight) * 100 : 0;
              const w = top[0] ? (k.consensus_weight_sum / top[0].consensus_weight_sum) * 100 : 0;
              const flag = countryFlag(k.key);
              return (
                <li key={k.key}>
                  <button
                    type="button"
                    onClick={() => onSelect(k.key)}
                    className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left transition-colors hover:bg-secondary/60"
                  >
                    <span className="w-3 text-right font-mono text-xs text-muted-foreground/60 tabular-nums">
                      {i + 1}
                    </span>
                    {flag ? (
                      <span aria-hidden="true" className="text-base leading-none">
                        {flag}
                      </span>
                    ) : null}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-foreground">
                        {countryName(k.key)}
                      </span>
                      <span className="block font-mono text-[11px] tabular-nums text-muted-foreground">
                        {formatNumber(k.relay_count)} relays · {formatPct(share, 1)}
                      </span>
                    </span>
                    <span className="h-1.5 w-14 shrink-0 overflow-hidden rounded-full bg-muted">
                      <span
                        className="block h-full rounded-full bg-primary"
                        style={{ width: `${Math.max(w, 4)}%` }}
                      />
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </Card>
      </div>
    </div>
  );
}

function MapLegend() {
  const { guard, exit, balanced } = RELAY_COLORS;
  return (
    <div className="pointer-events-none absolute bottom-3 left-3 rounded-lg border border-border bg-background/80 px-3 py-2.5 text-xs backdrop-blur">
      <div className="mb-1.5 font-condensed font-medium tracking-[0.12em] text-muted-foreground uppercase">
        Dominant role
      </div>
      <div className="flex flex-col gap-1">
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full" style={{ background: guard }} />
          <span className="text-muted-foreground">guard</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full" style={{ background: exit }} />
          <span className="text-muted-foreground">exit</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full" style={{ background: balanced }} />
          <span className="text-muted-foreground">balanced</span>
        </span>
      </div>
      <div className="mt-2.5 border-t border-border/60 pt-2">
        <div className="mb-1.5 font-condensed font-medium tracking-[0.12em] text-muted-foreground uppercase">
          Weight
        </div>
        <div className="flex items-center gap-1.5">
          <span
            className="inline-block rounded-full bg-primary/60"
            style={{ width: 5, height: 5 }}
            aria-hidden="true"
          />
          <span className="text-muted-foreground/70">less</span>
          <span className="mx-1 h-px flex-1 bg-border/60" />
          <span className="text-muted-foreground/70">more</span>
          <span
            className="inline-block rounded-full bg-primary"
            style={{ width: 13, height: 13 }}
            aria-hidden="true"
          />
        </div>
      </div>
    </div>
  );
}
