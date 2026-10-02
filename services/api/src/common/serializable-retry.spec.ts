import { Prisma } from '@prisma/client';
import { withSerializableRetry } from './serializable-retry';

function p2034(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError(
    'Transaction failed due to a write conflict or a deadlock',
    { code: 'P2034', clientVersion: 'test' },
  );
}

describe('withSerializableRetry', () => {
  it('retries a serialization failure and returns the later result', async () => {
    let calls = 0;
    const out = await withSerializableRetry(
      () => {
        calls += 1;
        if (calls < 3) return Promise.reject(p2034());
        return Promise.resolve('ok');
      },
      { baseDelayMs: 1 },
    );
    expect(out).toBe('ok');
    expect(calls).toBe(3);
  });

  it('gives up after the configured attempts', async () => {
    let calls = 0;
    await expect(
      withSerializableRetry(
        () => {
          calls += 1;
          return Promise.reject(p2034());
        },
        { attempts: 2, baseDelayMs: 1 },
      ),
    ).rejects.toMatchObject({ code: 'P2034' });
    expect(calls).toBe(2);
  });

  it('never retries business errors', async () => {
    let calls = 0;
    await expect(
      withSerializableRetry(() => {
        calls += 1;
        return Promise.reject(new Error('Slot is full'));
      }),
    ).rejects.toThrow('Slot is full');
    expect(calls).toBe(1);
  });
});
