import { describe, expect, it } from 'vitest';
import type { Delta, TaskStatus } from '@dash-iso/shared';
import { MockSource, SIM_RUNNERS, Simulator, cannedReply, seededRandom } from './mock-source.js';

const quiet = { log: () => {}, warn: () => {}, error: () => {} };

describe('Simulator', () => {
  it('has 4 runners with different slot counts', () => {
    const w = new Simulator({ random: seededRandom(1) }).world();
    expect(w.runners.map((r) => r.slots.length)).toEqual(SIM_RUNNERS.map((r) => r.slotCount));
    expect(new Set(w.runners.map((r) => r.slots.length)).size).toBeGreaterThan(2);
  });

  it('moves tasks through the lifecycle and occasionally fails them', () => {
    const sim = new Simulator({ random: seededRandom(7) });
    const seen = new Map<string, TaskStatus[]>();
    for (let i = 0; i < 300; i++) {
      for (const t of sim.tick().tasks) {
        const hist = seen.get(t.id) ?? [];
        if (hist.at(-1) !== t.status) seen.set(t.id, [...hist, t.status]);
      }
    }
    const histories = [...seen.values()];
    const allowed: Record<string, TaskStatus[]> = {
      queued: ['in_progress'],
      in_progress: ['review', 'failed'],
      review: ['merged', 'failed'],
    };
    for (const h of histories) {
      for (let i = 1; i < h.length; i++) expect(allowed[h[i - 1]!]).toContain(h[i]);
    }
    const ends = histories.map((h) => h.at(-1));
    expect(ends).toContain('merged');
    expect(ends).toContain('failed');
    expect(histories.some((h) => h.join() === 'queued,in_progress,review,merged')).toBe(true);
  });

  it('never puts two tasks in one slot or a task on an offline runner', () => {
    const sim = new Simulator({ random: seededRandom(3) });
    for (let i = 0; i < 200; i++) {
      const w = sim.tick();
      const working = w.runners.flatMap((r) =>
        r.slots.filter((s) => s.task).map((s) => ({ r, id: s.task!.id })),
      );
      expect(new Set(working.map((x) => x.id)).size).toBe(working.length);
      for (const { r } of working) expect(r.online).toBe(true);
      const inProgress = w.tasks.filter((t) => t.status === 'in_progress').length;
      expect(working).toHaveLength(inProgress);
    }
  });
});

describe('MockSource', () => {
  it('emits deltas on each poll', async () => {
    const src = new MockSource(1000, { random: seededRandom(5), chatDelayMs: 0 }, quiet);
    const deltas: Delta[] = [];
    src.subscribe((d) => deltas.push(d));
    for (let i = 0; i < 10; i++) await src.poll();
    expect(deltas.length).toBeGreaterThan(0);
    expect(deltas.some((d) => d.kind === 'task.upsert')).toBe(true);
  });

  it('answers chat with canned replies', async () => {
    const src = new MockSource(1000, { random: seededRandom(5), chatDelayMs: 0 }, quiet);
    expect(await src.chat('what is the status?')).toMatch(/queued/);
    expect(await src.chat('how are the runners')).toMatch(/alpha: \d\/1 slots busy/);
    expect(cannedReply('anything', src.snapshot())).toMatch(/MOCK mode/);
  });
});
