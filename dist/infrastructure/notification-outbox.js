/**
 * Notification Outbox
 *
 * Style.re 1.1 parity: persistent, idempotent outbox pattern for customer/admin SMS.
 * Enqueue → persist → worker sends → mark sent/failed.
 * Duplicate dedupKey inserts are silently ignored (idempotent).
 */
export class NotificationOutbox {
    pool;
    constructor(pool) {
        this.pool = pool;
    }
    /**
     * Enqueue a notification. No-op if dedupKey already exists.
     */
    async enqueue(params) {
        try {
            await this.pool.query(`INSERT INTO notification_outbox (id, order_id, channel, template, dedup_key, payload, status, attempts, created_at)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, 'pending', 0, NOW())
         ON CONFLICT (dedup_key) DO NOTHING`, [params.orderId, params.channel, params.template, params.dedupKey, JSON.stringify(params.payload)]);
        }
        catch {
            // If table doesn't exist yet, silently skip (graceful degradation)
        }
    }
    /**
     * Fetch pending notifications for processing (oldest first).
     */
    async fetchPending(limit = 20, maxAttempts = 3) {
        try {
            const { rows } = await this.pool.query(`SELECT * FROM notification_outbox
         WHERE status IN ('pending', 'failed') AND attempts < $1
         ORDER BY created_at ASC
         LIMIT $2`, [maxAttempts, limit]);
            return rows.map((row) => ({
                id: row.id,
                orderId: row.order_id,
                channel: row.channel,
                template: row.template,
                dedupKey: row.dedup_key,
                payload: row.payload,
                status: row.status,
                attempts: row.attempts,
                lastError: row.last_error ?? undefined,
                createdAt: new Date(row.created_at),
                sentAt: row.sent_at ? new Date(row.sent_at) : undefined
            }));
        }
        catch {
            return [];
        }
    }
    async markSent(id) {
        try {
            await this.pool.query(`UPDATE notification_outbox SET status='sent', sent_at=NOW() WHERE id=$1`, [id]);
        }
        catch {
            // best effort
        }
    }
    async markFailed(id, error) {
        try {
            await this.pool.query(`UPDATE notification_outbox SET status='failed', last_error=$1, attempts=attempts+1 WHERE id=$2`, [error, id]);
        }
        catch {
            // best effort
        }
    }
}
