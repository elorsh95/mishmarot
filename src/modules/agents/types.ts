export interface Agent {
  id: string;
  employeeNumber: string;
  firstName: string;
  lastName: string;
  teamId: string;
  isActive: boolean;
  /** Monthly quota for quota locations (e.g. home). null = use the global default. */
  monthlyQuota: number | null;
  /** Defaults used by "fill from defaults" in the weekly schedule. */
  defaultShiftId: string | null;
  defaultLocationId: string | null;
  /** Weekdays the agent usually works (0 = Sunday). */
  defaultDays: number[];
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export function agentName(agent: Pick<Agent, "firstName" | "lastName">) {
  return `${agent.firstName} ${agent.lastName}`.trim();
}
