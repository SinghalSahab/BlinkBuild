import { SharedProjectState } from '../state/SharedProjectState';
import { QAAgent } from '../qa/QAAgent';
import { BackendAgent } from '../specialists/BackendAgent';
import { Requirement, Task, AgentRole, Defect } from '../types';

export interface ExecutionReport {
  requirementId: string;
  status: 'SUCCESS_PR_READY' | 'ESCALATED_TO_HUMAN';
  completedTasks: string[];
  retryHistory: Record<string, number>;
  defectsResolved: string[];
  auditTrail: string[];
  message: string;
}

export class ManagerAgent {
  private state: SharedProjectState;
  private qaAgent: QAAgent;
  private backendAgent: BackendAgent;

  constructor(stateManager?: SharedProjectState) {
    this.state = stateManager || new SharedProjectState();
    this.qaAgent = new QAAgent(this.state);
    this.backendAgent = new BackendAgent(this.state);
  }

  /**
   * Runs the complete 7-Step Multi-Agent Control Loop (Slide 6)
   */
  public async orchestrateRequirement(
    req: Requirement,
    options: {
      seedDefectOnFirstTry?: boolean;
      simulateUnfixableBug?: boolean;
    } = {}
  ): Promise<ExecutionReport> {
    const auditSummary: string[] = [];
    const log = (msg: string) => {
      auditSummary.push(msg);
      this.state.appendAuditLog('MANAGER_LOOP', msg);
    };

    // Step 1: Understand
    log(`[Step 1: Understand] Parsing requirement: ${req.requirement_id} - ${req.title}`);
    this.state.saveRequirement(req);

    // Step 2: Analyze
    log(`[Step 2: Analyze] Evaluating acceptance criteria (${req.acceptance_criteria.length} criteria defined).`);

    // Step 3: Identify
    log(`[Step 3: Identify] Identifying required engineering disciplines.`);

    // Step 4: Select (Dynamic Activation)
    const activeRoles: AgentRole[] = req.activated_capabilities;
    log(`[Step 4: Select] Dynamically activating modules: [${activeRoles.join(', ')}].`);

    // Step 5: Execute (Task routing to developer)
    const backendTask: Task = {
      task_id: `TASK-BE-${Date.now().toString().slice(-3)}`,
      requirement_id: req.requirement_id,
      assigned_to: 'backend',
      title: `Implement core logic for ${req.title}`,
      status: 'pending',
      dependencies: [],
      artifacts: ['app/api/auth/route.ts']
    };
    
    // Save task in state
    const currentTasks = this.state.getTasks();
    currentTasks.push(backendTask);
    (this.state as any).writeJson('tasks.json', { tasks: currentTasks });

    log(`[Step 5: Execute] Routing task ${backendTask.task_id} to Backend Agent.`);
    await this.backendAgent.implementTask(backendTask.task_id);

    // Step 6: Observe
    log(`[Step 6: Observe] Backend Agent reported implementation complete for ${backendTask.task_id}.`);

    // Step 7: Validate (Hand-off to QA Agent)
    log(`[Step 7: Validate] Routing task ${backendTask.task_id} to QA Agent for objective verification.`);

    let validation = await this.qaAgent.validateTask({
      taskId: backendTask.task_id,
      requirementId: req.requirement_id,
      seededFailureTrigger: options.seedDefectOnFirstTry ? 'admin' : undefined
    });

    log(`[Step 7: Validate Outcome] ${validation.summaryMessage}`);

    const resolvedDefects: string[] = [];

    // DEFECT LOOP (FR-8, FR-9)
    while (!validation.success) {
      const activeDefect = validation.defectsDetected[0];
      if (!activeDefect) break;

      log(`[Defect Loop] Defect ${activeDefect.defect_id} detected. Assigned capability: ${activeDefect.assigned_to}.`);

      // Check Bounded Retries (FR-9 & NFR-3)
      if (!this.state.canRetry(backendTask.task_id)) {
        const escalationMsg = `Task ${backendTask.task_id} reached maximum retry limit (${this.state.getAgentStatus().max_retries_per_task}). Halting autonomous execution.`;
        log(`[CRITICAL SAFEGUARD] ${escalationMsg}`);
        this.state.setEscalated(escalationMsg);

        return {
          requirementId: req.requirement_id,
          status: 'ESCALATED_TO_HUMAN',
          completedTasks: [],
          retryHistory: this.state.getAgentStatus().retry_counters,
          defectsResolved: resolvedDefects,
          auditTrail: auditSummary,
          message: escalationMsg
        };
      }

      // Increment retry counter
      const attempt = this.state.incrementRetry(backendTask.task_id);
      log(`[Defect Loop] Retrying fix (Attempt #${attempt}). Routing defect ${activeDefect.defect_id} to Backend Agent.`);

      // Specialist fixes the defect
      await this.backendAgent.fixDefect(activeDefect);

      // Re-trigger QA for Regression
      log(`[Defect Loop] Triggering QA regression verification for defect ${activeDefect.defect_id}.`);
      
      const fixSucceeds = !options.simulateUnfixableBug;
      validation = await this.qaAgent.runRegressionForDefect(activeDefect.defect_id, fixSucceeds);
      log(`[Regression Outcome] ${validation.summaryMessage}`);

      if (validation.success) {
        resolvedDefects.push(activeDefect.defect_id);
      }
    }

    // All validation passed
    log(`[Completion] All tasks validated by QA. Requirement ${req.requirement_id} ready for Pull Request (FR-11).`);
    this.state.updateAgentRoleState('manager', 'idle');

    return {
      requirementId: req.requirement_id,
      status: 'SUCCESS_PR_READY',
      completedTasks: [backendTask.task_id],
      retryHistory: this.state.getAgentStatus().retry_counters,
      defectsResolved: resolvedDefects,
      auditTrail: auditSummary,
      message: `Requirement ${req.requirement_id} successfully validated by QA Agent. Ready for PR generation.`
    };
  }
}
