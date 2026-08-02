'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AreaSeries } from '@/components/viz/charts/area-series';
import { MultiAreaSeries } from '@/components/viz/charts/multi-area-series';
import type { NetworkHistoryResponse } from '@tor-sockets/api-contract';

/**
 * The /network-history charts grouped into tabs so the page isn't an endless
 * scroll of five charts. KPIs stay above (always visible); this holds the
 * detail series. Client-only because Tabs + recharts need the DOM.
 */
export function NetworkHistoryCharts({
  pts,
  hhiPoints,
}: {
  pts: NetworkHistoryResponse['points'];
  hhiPoints: Record<string, number | string>[];
}) {
  return (
    <Tabs defaultValue="relays">
      <TabsList>
        <TabsTrigger value="relays">Relays</TabsTrigger>
        <TabsTrigger value="capacity">Capacity</TabsTrigger>
        <TabsTrigger value="concentration">Concentration</TabsTrigger>
      </TabsList>

      <TabsContent value="relays" className="mt-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Relays · running vs stopped</CardTitle>
            <CardDescription>
              Both series are read against the same axis: stopped relays sit near the bottom at
              their real count, not on top of the running ones.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {/*
              Deliberately NOT stacked. Stacking put the stopped band on top of
              running, so its line landed around 10,600 on the axis while the
              actual value was ~900 - the reader had to subtract to get it. Each
              series now starts at zero and can be read straight off the axis.
              (The capacity chart below stays stacked: guard/middle/exit really
              are parts of one total.)
            */}
            <MultiAreaSeries
              points={pts.map((p) => ({
                time: p.time,
                running: p.relays_running,
                stopped: p.relays_stopped,
              }))}
              series={[
                { key: 'running', stroke: 'var(--sev-low)', name: 'Running' },
                { key: 'stopped', stroke: 'var(--muted-foreground)', name: 'Stopped' },
              ]}
              ariaLabel="Relays running vs stopped over time"
              format="number"
              fillOpacity={0.16}
            />
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="capacity" className="mt-4 space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Advertised bandwidth (total capacity)</CardTitle>
          </CardHeader>
          <CardContent>
            <AreaSeries
              points={pts.map((p) => ({ time: p.time, value: p.advertised_bandwidth }))}
              stroke="var(--role-exit)"
              ariaLabel="Total advertised bandwidth over time"
              format="bandwidth"
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Capacity by role (advertised bandwidth)</CardTitle>
          </CardHeader>
          <CardContent>
            <MultiAreaSeries
              points={pts.map((p) => ({
                time: p.time,
                guard: p.guard_bandwidth,
                middle: p.middle_bandwidth,
                exit: p.exit_bandwidth,
              }))}
              series={[
                { key: 'guard', stroke: 'var(--role-guard)', name: 'Guard' },
                { key: 'middle', stroke: 'var(--role-middle)', name: 'Middle' },
                { key: 'exit', stroke: 'var(--role-exit)', name: 'Exit' },
              ]}
              ariaLabel="Capacity by role over time"
              format="bandwidth"
              fillOpacity={0}
            />
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="concentration" className="mt-4 space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Consensus weight (total)</CardTitle>
          </CardHeader>
          <CardContent>
            <AreaSeries
              points={pts.map((p) => ({ time: p.time, value: p.consensus_weight }))}
              stroke="var(--primary)"
              ariaLabel="Total consensus weight over time"
              format="compact"
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Concentration (HHI) by dimension</CardTitle>
          </CardHeader>
          <CardContent>
            <MultiAreaSeries
              points={hhiPoints}
              series={[
                { key: 'country', stroke: 'var(--role-guard)', name: 'Country' },
                { key: 'as', stroke: 'var(--role-exit)', name: 'AS' },
                { key: 'hoster', stroke: 'var(--role-authority)', name: 'Hoster' },
                { key: 'family', stroke: 'var(--role-hsdir)', name: 'Family' },
              ]}
              ariaLabel="HHI by dimension over time"
              format="number"
              fillOpacity={0}
            />
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}
