export type GovernanceWorkflowStatus = "open" | "in_progress" | "resolved" | "escalated";

export type GovernanceWorkflowTaskState = {
  owner: string;
  deadline: string;
  status: GovernanceWorkflowStatus;
  updatedAt: string;
};

const GOVERNANCE_WORKFLOW_KEY = "DilMart-admin-governance-workflow-v1";

function readAll(): Record<string, GovernanceWorkflowTaskState> {
  try {
    const raw = localStorage.getItem(GOVERNANCE_WORKFLOW_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeAll(state: Record<string, GovernanceWorkflowTaskState>) {
  localStorage.setItem(GOVERNANCE_WORKFLOW_KEY, JSON.stringify(state));
}

export function getGovernanceWorkflowTask(taskId: string): GovernanceWorkflowTaskState | null {
  const all = readAll();
  return all[taskId] ?? null;
}

export function upsertGovernanceWorkflowTask(
  taskId: string,
  patch: Partial<GovernanceWorkflowTaskState> & Pick<GovernanceWorkflowTaskState, "status">,
) {
  const all = readAll();
  const previous = all[taskId] ?? { owner: "", deadline: "", status: "open", updatedAt: "" };
  const next: GovernanceWorkflowTaskState = {
    owner: patch.owner ?? previous.owner,
    deadline: patch.deadline ?? previous.deadline,
    status: patch.status,
    updatedAt: new Date().toISOString(),
  };
  all[taskId] = next;
  writeAll(all);
  return next;
}
