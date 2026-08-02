/**
 * Visualization primitives - the design-system barrel.
 *
 * Server components by default (pure SVG/markup, no client JS), except
 * `segmented-toggle` which is `'use client'` (it hosts the button-based
 * `SegmentedToggle`; `SegmentedToggleLink` shares its markup but is
 * handler-free).
 */
export * from './bar-list';
export * from './bar-row';
export * from './concentration-gauge';
export * from './segmented-toggle';
export * from './sparkline';
export * from './stat-tile';
export * from './uptime-ring';
