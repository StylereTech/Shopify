export class MetricsRegistry {
  private counters = new Map<string, number>();
  private gauges = new Map<string, number>();
  private timers = new Map<string, number[]>();

  increment(name: string, value = 1): void {
    this.counters.set(name, (this.counters.get(name) ?? 0) + value);
  }

  gauge(name: string, value: number): void {
    this.gauges.set(name, value);
  }

  observeMs(name: string, ms: number): void {
    const list = this.timers.get(name) ?? [];
    list.push(ms);
    this.timers.set(name, list);
  }

  snapshot(): Record<string, unknown> {
    const timerSummary = Object.fromEntries(
      [...this.timers.entries()].map(([k, values]) => [
        k,
        {
          count: values.length,
          avgMs: values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0,
          maxMs: values.length ? Math.max(...values) : 0
        }
      ])
    );

    return {
      counters: Object.fromEntries(this.counters),
      gauges: Object.fromEntries(this.gauges),
      timers: timerSummary
    };
  }
}
