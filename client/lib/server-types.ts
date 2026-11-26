/* Auto-generated from FastAPI OpenAPI schema. Do not edit manually. */

export type AgentOwner = "manager" | "frontend" | "backend" | "qa";

export interface AuditEntry {
  id: string;
  run_id: string;
  category: string;
  actor: string;
  message: string;
  requirement_refs?: Array<string>;
  created_at?: string;
}

export interface CreateRunRequest {
  prompt: string;
  template_type?: "react" | "node";
  mode?: LlmMode;
}

export interface CreateRunResponse {
  run_id: string;
  status: RunStatus;
}

export interface Defect {
  id: string;
  run_id: string;
  task_id: string;
  failing_check: string;
  evidence: string;
  owner?: AgentOwner | null;
  status?: DefectStatus;
  requirement_refs?: Array<string>;
  created_at?: string;
  updated_at?: string;
}

export type DefectStatus = "open" | "fixing" | "resolved" | "escalated";

export interface HTTPValidationError {
  detail?: Array<ValidationError>;
}

export type LlmMode = "auto" | "fast" | "local";

export interface Run {
  id: string;
  clerk_user_id: string;
  prompt: string;
  template_type: string;
  mode?: LlmMode;
  status?: RunStatus;
  escalation_reason?: string | null;
  created_at?: string;
  updated_at?: string;
}

export type RunStatus = "queued" | "planning" | "generating" | "validating" | "fixing" | "succeeded" | "escalated" | "failed" | "cancelled";

export interface RunSummaryResponse {
  run: Run;
  tasks: Array<Task>;
  defects: Array<Defect>;
  test_results: Array<TestResult>;
  audit_entries: Array<AuditEntry>;
  retries: Record<string, number>;
  artifact_xml?: string | null;
}

export interface Task {
  id: string;
  run_id: string;
  plan_id?: string | null;
  owner: AgentOwner;
  title: string;
  description?: string;
  acceptance_criteria?: Array<string>;
  size_hint?: string;
  status?: TaskStatus;
  requirement_refs?: Array<string>;
  created_at?: string;
  updated_at?: string;
}

export type TaskStatus = "pending" | "in_progress" | "implemented" | "validated" | "failed" | "fix_applied";

export type TestCaseStatus = "pending" | "passed" | "failed" | "skipped" | "blocked";

export interface TestResult {
  id: string;
  run_id: string;
  check_name: string;
  status: TestCaseStatus;
  duration_ms?: number;
  evidence?: string;
  created_at?: string;
}

export interface ValidationError {
  loc: Array<string | number>;
  msg: string;
  type: string;
  input?: unknown;
  ctx?: Record<string, unknown>;
}
