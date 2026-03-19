export class MetricsRegistry {
    counters = new Map();
    gauges = new Map();
    timers = new Map();
    increment(name, value = 1) {
        this.counters.set(name, (this.counters.get(name) ?? 0) + value);
    }
    gauge(name, value) {
        this.gauges.set(name, value);
    }
    observeMs(name, ms) {
        const list = this.timers.get(name) ?? [];
        list.push(ms);
        this.timers.set(name, list);
    }
    snapshot() {
        const timerSummary = Object.fromEntries([...this.timers.entries()].map(([k, values]) => [
            k,
            {
                count: values.length,
                avgMs: values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0,
                maxMs: values.length ? Math.max(...values) : 0
            }
        ]));
        return {
            counters: Object.fromEntries(this.counters),
            gauges: Object.fromEntries(this.gauges),
            timers: timerSummary
        };
    }
}
