import { describe, expect, it, vi } from 'vitest';
import { resilient } from './live';

describe('resilient', () => {
  it('re-attaches a listener after an error, and stops for good when unsubscribed', () => {
    vi.useFakeTimers();
    const errors: ((e: never) => void)[] = [];
    const detached = vi.fn();
    const stop = resilient((onError) => {
      errors.push(onError as (e: never) => void);
      return detached;
    }, 1000);
    expect(errors).toHaveLength(1);
    errors[0](undefined as never); // e.g. permission denied right after sign-in
    expect(detached).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1000);
    expect(errors).toHaveLength(2);
    stop();
    expect(detached).toHaveBeenCalledTimes(2);
    errors[1](undefined as never);
    vi.advanceTimersByTime(5000);
    expect(errors).toHaveLength(2);
    vi.useRealTimers();
  });
});
