import type { AgentState } from '../types/agent';
let snapshot: AgentState[] = [];
const listeners = new Set<(agents: AgentState[]) => void>();
export function publishRoles(agents: AgentState[]): void {
  snapshot = agents;
  for (const listener of listeners) listener(snapshot);
}
export function subscribeRoles(listener: (agents: AgentState[]) => void): () => void {
  listeners.add(listener);
  listener(snapshot);
  return () => { listeners.delete(listener); };
}
export const isContentRole = (id: string): boolean => id.startsWith('content-role:');

export const latestRole = (id: string): AgentState | undefined => snapshot.find(agent => agent.id === id);
