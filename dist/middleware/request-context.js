import { randomUUID } from 'node:crypto';
export function requestContext(req, res, next) {
    const id = req.header('x-request-id') ?? randomUUID();
    req.headers['x-request-id'] = id;
    res.setHeader('x-request-id', id);
    next();
}
