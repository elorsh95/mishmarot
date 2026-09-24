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

/** One line of an agents import file, after validation. */
export interface AgentImportRow {
  line: number;
  firstName: string;
  lastName: string;
  employeeNumber: string;
  teamId: string | null;
  teamName: string;
  /** new: will be added; exists: already in the team (skipped); error: see message. */
  status: "new" | "exists" | "error";
  message: string | null;
}

export interface AgentImportResult {
  rows: AgentImportRow[];
  /** Number of agents actually added (0 on a preview). */
  created: number;
}

/** Largest file the import accepts, in rows. */
export const AGENT_IMPORT_MAX_ROWS = 1000;
