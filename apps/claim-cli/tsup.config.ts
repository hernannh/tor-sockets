import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/cli.ts'],
  format: ['esm'],
  target: 'node22',
  platform: 'node',
  splitting: false,
  sourcemap: false,
  clean: true,
  // Bundle the workspace dependencies (@tor-sockets/*) and their transitive
  // deps (@noble/curves) into a single self-contained dist/cli.js so the
  // published CLI has zero runtime deps. Node builtins stay external.
  noExternal: [/@tor-sockets\//],
});
