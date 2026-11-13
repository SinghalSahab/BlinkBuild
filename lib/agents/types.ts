/**
 * Core Type Definitions for the Multi-Agent System
 * Based on AI Software Engineering Manager Architecture Proposal (MAST Taxonomy, Layers 01-05)
 */

export type AgentRole = 
  | 'manager'
  | 'architect'
  | 'frontend'
  | 'backend'
  | 'database'
  | 'qa'
  | 'devops';

export type TaskStatus = 
  | 'pending'
  | 'in_progress'
  | 'implementation_complete'
  | 'validated'
  | 'fix_applied'
  | 'failed'
  | 'completed';

export type DefectStatus = 'open' | 'fixing' | 'resolved' | 'escalated_unresolved';

export interface Requirement {
  requirement_id: string;
  title: string;
  description: string;
  acceptance_criteria: string[];
  activated_capabilities: AgentRole[];
  created_at: string;
  status: 'pending' | 'in_progress' | 'validated' | 'escalated';
}

export interface Task {
  task_id: string;
  requirement_id: string;
  assigned_to: AgentRole;
  title: string;
  status: TaskStatus;
  dependencies: string[];
  artifacts: string[];
}

export interface TestCase {
  id: string;
  name: string;
  description: string;
  category: 'unit' | 'integration' | 'edge_case' | 'security' | 'regression';
  status: 'passed' | 'failed' | 'skipped';
  duration_ms: number;
  error?: string;
  stack_trace?: string;
}

export interface TestSuite {
  suite_id: string;
  file: string;
  status: 'passed' | 'failed';
  total: number;
  passed: number;
  failed: number;
  cases: TestCase[];
}

export interface TestRunResult {
  last_run: string;
  status: 'passed' | 'failed';
  run_type: 'full_validation' | 'regression';
  summary: {
    total: number;
    passed: number;
    failed: number;
    duration_ms: number;
  };
  test_suites: TestSuite[];
}

export interface Defect {
  defect_id: string;
  requirement_id: string;
  task_id: string;
  status: DefectStatus;
  detected_by: 'qa';
  assigned_to: AgentRole;
  retry_attempt: number;
  title: string;
  error_details: string;
  stack_trace: string;
  reproduction_command: string;
  suggested_fix?: string;
  timestamp: string;
}

export interface AgentStatusTracker {
  manager: {
    status: 'idle' | 'planning' | 'routing' | 'observing' | 'validating' | 'escalated';
    current_step: 'Understand' | 'Analyze' | 'Identify' | 'Select' | 'Execute' | 'Observe' | 'Validate';
    active_requirement_id: string | null;
  };
  agents: Record<AgentRole, {
    state: 'idle' | 'active' | 'executing_tests' | 'waiting_validation' | 'failed';
    current_task?: string;
    last_task?: string;
  }>;
  retry_counters: Record<string, number>;
  max_retries_per_task: number;
  escalated: boolean;
  escalation_reason?: string;
}
