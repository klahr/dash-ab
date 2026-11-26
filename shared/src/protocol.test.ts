import { describe, expect, it } from 'vitest';
import { applyDelta, parseClientMessage, parseServerMessage, type WorldState } from './index.js';

const base: WorldState = {
  org: { id: 'o', name: 'Org' },
  projects: [],
  runners: [],
  tasks: [],
  goals: [],
};

describe('applyDelta', () => {
  it('inserts then updates a task', () => {
    const t = { id: 't1', title: 'A', project: 'p', status: 'draft' as const };
    const s1 = applyDelta(base, { kind: 'task.upsert', task: t });
    const s2 = applyDelta(s1, { kind: 'task.upsert', task: { ...t, status: 'queued' } });
    expect(s2.tasks).toEqual([{ ...t, status: 'queued' }]);
    expect(base.tasks).toHaveLength(0);
  });

  it('removes a task', () => {
    const t = { id: 't1', title: 'A', project: 'p', status: 'draft' as const };
    const s = applyDelta(applyDelta(base, { kind: 'task.upsert', task: t }), {
      kind: 'task.remove',
      id: 't1',
    });
    expect(s.tasks).toEqual([]);
  });
});

describe('parsing', () => {
  it('parses chat.send and rejects junk', () => {
    expect(parseClientMessage('{"type":"chat.send","text":"hi"}')).toEqual({
      type: 'chat.send',
      text: 'hi',
    });
    expect(parseClientMessage('nope')).toBeNull();
    expect(parseClientMessage('{"type":"x"}')).toBeNull();
    expect(parseServerMessage('{"type":"bogus"}')).toBeNull();
  });
});
