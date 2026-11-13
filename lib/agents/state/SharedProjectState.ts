import fs from 'fs';
import path from 'path';
import {
  Requirement,
  Task,
  TaskStatus,
  Defect,
  TestRunResult,
  AgentStatusTracker,
  AgentRole
} from '../types';

export class SharedProjectState {
  private baseDir: string;

  constructor(customPath?: string) {
    this.baseDir = customPath || path.resolve(process.cwd(), '.project-state');
    this.ensureDirectory();
  }

  private ensureDirectory(): void {
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true });
    }
  }

  private readJson<T>(filename: string, defaultValue: T): T {
    const filePath = path.join(this.baseDir, filename);
    if (!fs.existsSync(filePath)) {
      this.writeJson(filename, defaultValue);
      return defaultValue;
    }
    try {
      const data = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(data) as T;
    } catch {
      return defaultValue;
    }
  }

  private writeJson<T>(filename: string, data: T): void {
    this.ensureDirectory();
    const filePath = path.join(this.baseDir, filename);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  }

  // --- Requirements ---
  public getRequirements(): Requirement[] {
    const raw = this.readJson<{ active_requirements: Requirement[] }>('requirements.json', { active_requirements: [] });
    return raw.active_requirements;
  }

  public getRequirement(reqId: string): Requirement | undefined {
    return this.getRequirements().find(r => r.requirement_id === reqId);
  }

  public saveRequirement(req: Requirement): void {
    const reqs = this.getRequirements();
    const index = reqs.findIndex(r => r.requirement_id === req.requirement_id);
    if (index >= 0) {
      reqs[index] = req;
    } else {
      reqs.push(req);
    }
    this.writeJson('requirements.json', { active_requirements: reqs });
    this.appendAuditLog('REQUIREMENT', `Updated requirement ${req.requirement_id}: ${req.title}`);
  }

  // --- Tasks ---
  public getTasks(): Task[] {
    const raw = this.readJson<{ tasks: Task[] }>('tasks.json', { tasks: [] });
    return raw.tasks;
  }

  public getTask(taskId: string): Task | undefined {
    return this.getTasks().find(t => t.task_id === taskId);
  }

  public updateTaskStatus(taskId: string, status: TaskStatus): void {
    const tasks = this.getTasks();
    const task = tasks.find(t => t.task_id === taskId);
    if (task) {
      task.status = status;
      this.writeJson('tasks.json', { tasks });
      this.appendAuditLog('TASK_STATUS', `Task ${taskId} moved to status: ${status}`);
    }
  }

  // --- Agent Status & Retries ---
  public getAgentStatus(): AgentStatusTracker {
    return this.readJson<AgentStatusTracker>('agent-status.json', {
      manager: { status: 'idle', current_step: 'Understand', active_requirement_id: null },
      agents: {
        architect: { state: 'idle' },
        frontend: { state: 'idle' },
        backend: { state: 'idle' },
        database: { state: 'idle' },
        qa: { state: 'idle' },
        devops: { state: 'idle' },
        manager: { state: 'idle' }
      },
      retry_counters: {},
      max_retries_per_task: 3,
      escalated: false
    });
  }

  public updateAgentRoleState(role: AgentRole, state: AgentStatusTracker['agents'][AgentRole]['state'], currentTask?: string): void {
    const status = this.getAgentStatus();
    if (!status.agents[role]) {
      status.agents[role] = { state: 'idle' };
    }
    status.agents[role].state = state;
    if (currentTask) {
      status.agents[role].current_task = currentTask;
    }
    this.writeJson('agent-status.json', status);
  }

  public getRetryCount(taskId: string): number {
    const status = this.getAgentStatus();
    return status.retry_counters[taskId] || 0;
  }

  public incrementRetry(taskId: string): number {
    const status = this.getAgentStatus();
    const count = (status.retry_counters[taskId] || 0) + 1;
    status.retry_counters[taskId] = count;
    this.writeJson('agent-status.json', status);
    this.appendAuditLog('RETRY', `Retry counter for task ${taskId} incremented to ${count}/${status.max_retries_per_task}`);
    return count;
  }

  public canRetry(taskId: string): boolean {
    const status = this.getAgentStatus();
    const count = status.retry_counters[taskId] || 0;
    return count < status.max_retries_per_task;
  }

  public setEscalated(reason: string): void {
    const status = this.getAgentStatus();
    status.escalated = true;
    status.escalation_reason = reason;
    status.manager.status = 'escalated';
    this.writeJson('agent-status.json', status);
    this.appendAuditLog('ESCALATION', `CRITICAL ESCALATION TO HUMAN: ${reason}`);
  }

  // --- Test Results ---
  public getTestResults(): TestRunResult | null {
    return this.readJson<TestRunResult | null>('test-results.json', null);
  }

  public recordTestResults(results: TestRunResult): void {
    this.writeJson('test-results.json', results);
    this.appendAuditLog(
      'TEST_RUN',
      `Test run ${results.run_type} completed: ${results.status.toUpperCase()} (${results.summary.passed}/${results.summary.total} passed)`
    );
  }

  // --- Defects ---
  public getDefects(): Defect[] {
    const raw = this.readJson<{ defects: Defect[] }>('defects.json', { defects: [] });
    return raw.defects;
  }

  public logDefect(defect: Defect): void {
    const raw = this.readJson<{ defects: Defect[] }>('defects.json', { defects: [] });
    raw.defects.push(defect);
    this.writeJson('defects.json', raw);
    this.appendAuditLog('DEFECT_LOGGED', `Defect ${defect.defect_id} logged by QA against ${defect.assigned_to}: ${defect.title}`);
  }

  public resolveDefect(defectId: string): void {
    const raw = this.readJson<{ defects: Defect[] }>('defects.json', { defects: [] });
    const defect = raw.defects.find(d => d.defect_id === defectId);
    if (defect) {
      defect.status = 'resolved';
      this.writeJson('defects.json', raw);
      this.appendAuditLog('DEFECT_RESOLVED', `Defect ${defectId} marked as RESOLVED by QA regression suite.`);
    }
  }

  // --- Audit Log ---
  public appendAuditLog(category: string, message: string): void {
    this.ensureDirectory();
    const logPath = path.join(this.baseDir, 'audit.log');
    const entry = `[${new Date().toISOString()}] [${category}] ${message}\n`;
    fs.appendFileSync(logPath, entry, 'utf-8');
  }
}
