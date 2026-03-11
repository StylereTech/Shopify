import { describe, expect, it } from 'vitest';
import { StorreeDispatchError } from '../src/infrastructure/storree/storree-client.js';

describe('worker retry classification', () => {
  it('marks storree terminal errors as non-retryable', () => {
    const err = new StorreeDispatchError('bad request', false, 400);
    expect(err.retryable).toBe(false);
  });

  it('marks transient errors as retryable', () => {
    const err = new StorreeDispatchError('timeout', true);
    expect(err.retryable).toBe(true);
  });
});
