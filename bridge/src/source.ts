import type { Delta, WorldState } from '@dash-iso/shared';

/**
 * Abstraction over the Dash MCP server. A real implementation would use an MCP
 * client (e.g. @modelcontextprotocol/sdk) to read org/project/runner/task state
 * and forward chat to Dash. For now `MockSource` provides fake data.
 */
export interface DashSource {
  snapshot(): WorldState;
  /** Subscribe to state changes; returns an unsubscribe function. */
  subscribe(onDelta: (d: Delta) => void): () => void;
  /** Send a chat message to Dash and resolve with the reply text. */
  chat(text: string): Promise<string>;
}

export class MockSource implements DashSource {
  private state: WorldState = {
    org: { id: 'org-1', name: 'Demo Org' },
    projects: [{ id: 'proj-1', orgId: 'org-1', name: 'Demo Project' }],
    runners: [
      {
        id: 'runner-1',
        name: 'runner-1',
        online: true,
        slots: [
          { index: 0, state: 'idle' },
          { index: 1, state: 'idle' },
        ],
      },
    ],
    tasks: [],
    goals: [],
  };

  snapshot(): WorldState {
    return this.state;
  }

  subscribe(): () => void {
    return () => {};
  }

  async chat(text: string): Promise<string> {
    return `(mock) you said: ${text}`;
  }
}
