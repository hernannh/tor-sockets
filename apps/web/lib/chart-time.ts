/**
 * Shared time-axis config for the recharts time-series charts (trend, area,
 * multi-area). The underlying series is hourly, so a plain "MM-DD" label repeats
 * the same date on every hour of a day and recharts crowds the X-axis with
 * duplicate ticks ("07-09 07-09 07-09 ..."). This picks a handful of evenly
 * spaced ticks off the actual timestamps - so every tick is a distinct point -
 * and formats them by span: include the hour when the window is short (<= 2
 * days), date-only when it spans days.
 */
export function timeAxis(
  times: string[],
  maxTicks = 6,
): { ticks: string[]; tickFormatter: (t: string) => string } {
  const valid = times.filter(Boolean);
  if (valid.length === 0) return { ticks: [], tickFormatter: (t) => t };

  const first = new Date(valid[0]).getTime();
  const last = new Date(valid[valid.length - 1]).getTime();
  const spanHours = Math.abs(last - first) / 3_600_000;
  const withHour = spanHours > 0 && spanHours <= 48;

  const tickFormatter = (t: string) => {
    if (!t) return '';
    const iso = new Date(t).toISOString();
    return withHour ? `${iso.slice(5, 10)} ${iso.slice(11, 13)}h` : iso.slice(5, 10);
  };

  // Space ticks evenly along the TIME axis (not by index): the raw series can be
  // clustered - dev data has gaps - so index-spacing would bunch every tick into
  // the dense clusters and still repeat dates. For each evenly-spaced target time
  // we snap to the nearest actual point and dedupe, so ticks stay distinct and
  // temporally even even when the data is irregular.
  const n = Math.min(maxTicks, valid.length);
  const msOf = (t: string) => new Date(t).getTime();
  const ticks: string[] = [];
  const seenLabels = new Set<string>();
  const pushTick = (t: string) => {
    // Dedupe by the FORMATTED label, not the raw timestamp: two distinct hourly
    // points on the same day both render "MM-DD" and would collide on the axis.
    const label = tickFormatter(t);
    if (seenLabels.has(label)) return;
    seenLabels.add(label);
    ticks.push(t);
  };
  if (n === 1 || first === last) {
    pushTick(valid[0]);
  } else {
    for (let i = 0; i < n; i++) {
      const target = first + ((last - first) * i) / (n - 1);
      let nearest = valid[0];
      let best = Number.POSITIVE_INFINITY;
      for (const t of valid) {
        const d = Math.abs(msOf(t) - target);
        if (d < best) {
          best = d;
          nearest = t;
        }
      }
      pushTick(nearest);
    }
  }
  return { ticks, tickFormatter };
}
