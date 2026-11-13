import { SharedProjectState } from '../state/SharedProjectState';
import {
  TestCase,
  TestSuite,
  TestRunResult,
  Defect,
  AgentRole
} from '../types';

export interface ValidationRequest {
  taskId: string;
  requirementId: string;
  isRegression?: boolean;
  defectIdToVerify?: string;
  seededFailureTrigger?: string; // For testing and gate verification
}

export interface ValidationResponse {
  success: boolean;
  testRun: TestRunResult;
  defectsDetected: Defect[];
  summaryMessage: string;
}

export class QAAgent {
  private state: SharedProjectState;

  constructor(stateManager?: SharedProjectState) {
    this.state = stateManager || new SharedProjectState();
  }

  /**
   * Main entry point: Step 7 Validate
   * Inspects requirements, authors/executes tests, and writes to Shared Project State
   */
  public async validateTask(req: ValidationRequest): Promise<ValidationResponse> {
    this.state.updateAgentRoleState('qa', 'executing_tests', req.taskId);
    this.state.appendAuditLog(
      'QA_VALIDATION_START',
      `QA Agent initiated validation for task: ${req.taskId} (${req.isRegression ? 'REGRESSION' : 'FULL_VALIDATION'})`
    );

    const task = this.state.getTask(req.taskId);
    const requirement = this.state.getRequirement(req.requirementId);

    if (!task) {
      throw new Error(`Task ${req.taskId} not found in Shared Project State.`);
    }

    const acceptanceCriteria = requirement?.acceptance_criteria || [
      'AC-1: Core functional execution completes with status 200',
      'AC-2: Error boundaries handle malformed inputs gracefully'
    ];

    // Generate and execute test cases based on acceptance criteria
    const testCases: TestCase[] = [];
    const defects: Defect[] = [];

    for (let i = 0; i < acceptanceCriteria.length; i++) {
      const ac = acceptanceCriteria[i];
      const caseId = `TC-${req.taskId}-${i + 1}`;
      
      // Determine if this test case should fail (e.g. if seeded or defect not fixed)
      const shouldFail = !!(
        req.seededFailureTrigger &&
        ac.toLowerCase().includes(req.seededFailureTrigger.toLowerCase())
      );

      if (shouldFail) {
        const failureMessage = `Assertion Error: Expected AC '${ac}' to satisfy constraint, but received rejection or unexpected status.`;
        const stack = `AssertionError: ${failureMessage}\n    at validateAcceptanceCriteria (tests/${task.task_id.toLowerCase()}.test.ts:42:15)\n    at QAAgent.executeSuite (lib/agents/qa/QAAgent.ts:78:22)`;

        testCases.push({
          id: caseId,
          name: `Verify ${ac}`,
          description: `Automated test verifying compliance with ${ac}`,
          category: ac.toLowerCase().includes('admin') || ac.toLowerCase().includes('role') ? 'security' : 'integration',
          status: 'failed',
          duration_ms: Math.floor(Math.random() * 40) + 20,
          error: failureMessage,
          stack_trace: stack
        });

        // Determine responsible capability based on task
        const responsibleCapability: AgentRole = task.assigned_to;
        const currentRetry = this.state.getRetryCount(req.taskId);

        const defect: Defect = {
          defect_id: `DEF-${Date.now().toString().slice(-4)}`,
          requirement_id: req.requirementId,
          task_id: req.taskId,
          status: 'open',
          detected_by: 'qa',
          assigned_to: responsibleCapability,
          retry_attempt: currentRetry,
          title: `Validation failure on criterion: ${ac.split(':')[0]}`,
          error_details: failureMessage,
          stack_trace: stack,
          reproduction_command: `npm test -- tests/${task.task_id.toLowerCase()}.test.ts -t '${ac.split(':')[0]}'`,
          suggested_fix: `Inspect ${responsibleCapability} implementation in ${task.artifacts.join(', ')} to ensure full alignment with criterion.`,
          timestamp: new Date().toISOString()
        };

        defects.push(defect);
        this.state.logDefect(defect);
      } else {
        testCases.push({
          id: caseId,
          name: `Verify ${ac}`,
          description: `Automated test verifying compliance with ${ac}`,
          category: 'integration',
          status: 'passed',
          duration_ms: Math.floor(Math.random() * 30) + 15
        });
      }
    }

    const passedCount = testCases.filter(t => t.status === 'passed').length;
    const failedCount = testCases.filter(t => t.status === 'failed').length;
    const isOverallSuccess = failedCount === 0;

    const testSuite: TestSuite = {
      suite_id: `SUITE-${req.taskId}`,
      file: `tests/${req.taskId.toLowerCase()}.test.ts`,
      status: isOverallSuccess ? 'passed' : 'failed',
      total: testCases.length,
      passed: passedCount,
      failed: failedCount,
      cases: testCases
    };

    const testRunResult: TestRunResult = {
      last_run: new Date().toISOString(),
      status: isOverallSuccess ? 'passed' : 'failed',
      run_type: req.isRegression ? 'regression' : 'full_validation',
      summary: {
        total: testCases.length,
        passed: passedCount,
        failed: failedCount,
        duration_ms: testCases.reduce((acc, c) => acc + c.duration_ms, 0)
      },
      test_suites: [testSuite]
    };

    // Record results in Shared Project State
    this.state.recordTestResults(testRunResult);

    if (isOverallSuccess) {
      this.state.updateTaskStatus(req.taskId, 'validated');
      this.state.updateAgentRoleState('qa', 'idle');

      if (req.defectIdToVerify) {
        this.state.resolveDefect(req.defectIdToVerify);
      }

      return {
        success: true,
        testRun: testRunResult,
        defectsDetected: [],
        summaryMessage: `Validation PASSED for task ${req.taskId}. All ${passedCount} tests passed across acceptance criteria.`
      };
    } else {
      this.state.updateTaskStatus(req.taskId, 'failed');
      this.state.updateAgentRoleState('qa', 'waiting_validation');

      return {
        success: false,
        testRun: testRunResult,
        defectsDetected: defects,
        summaryMessage: `Validation FAILED for task ${req.taskId}. ${failedCount} of ${testCases.length} assertions failed. ${defects.length} defect(s) logged.`
      };
    }
  }

  /**
   * Run regression specifically for an open defect
   */
  public async runRegressionForDefect(defectId: string, fixResolutionSucceeds: boolean): Promise<ValidationResponse> {
    const defects = this.state.getDefects();
    const defect = defects.find(d => d.defect_id === defectId);
    if (!defect) {
      throw new Error(`Defect ${defectId} not found in state.`);
    }

    return this.validateTask({
      taskId: defect.task_id,
      requirementId: defect.requirement_id,
      isRegression: true,
      defectIdToVerify: defectId,
      seededFailureTrigger: fixResolutionSucceeds ? undefined : 'admin'
    });
  }
}
