/**
 * In-process domain events. Services emit after a successful commit; listeners (future
 * notifications, e-mail, webhooks) subscribe without the services knowing about them.
 */
export interface DomainEvents {
  "approval.requested": { approvalIds: string[] };
  "approval.decided": { approvalId: string; status: "approved" | "rejected" };
  "transfer.requested": { transferId: string };
  "transfer.decided": { transferId: string; status: "approved" | "rejected" };
  "week.published": { teamId: string; weekStart: string };
}

type Listener<K extends keyof DomainEvents> = (payload: DomainEvents[K]) => void | Promise<void>;

const listeners = new Map<keyof DomainEvents, Array<Listener<never>>>();

export function on<K extends keyof DomainEvents>(event: K, listener: Listener<K>) {
  listeners.set(event, [...(listeners.get(event) ?? []), listener as Listener<never>]);
}

export function emit<K extends keyof DomainEvents>(event: K, payload: DomainEvents[K]) {
  for (const listener of (listeners.get(event) ?? []) as Array<Listener<K>>) {
    Promise.resolve(listener(payload)).catch((err) => console.error(`event ${event} failed`, err));
  }
}
