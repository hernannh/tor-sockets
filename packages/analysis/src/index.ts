/**
 * @tor-sockets/analysis - concentration engine + anomaly detection + alerts.
 *
 * computeDimension + snapshotConcentration (HHI per dimension)
 * Fase 1.2: detectAnomalies (HHI jumps, AS clustering, fast weight gain)
 * Fase 3.1: evaluateAlertRules (condition DSL → alert events)
 */
export * from './concentration';
export * from './correlation';
export * from './decentralization';
export * from './anomalies';
export * from './consensus-check';
export * from './exit-ports';
export * from './hidden-families';
export * from './alerts';
