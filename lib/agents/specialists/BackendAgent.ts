import { SharedProjectState } from '../state/SharedProjectState';
import { Defect } from '../types';

export class BackendAgent {
  private state: SharedProjectState;

  constructor(stateManager?: SharedProjectState) {
    this.state = stateManager || new SharedProjectState();
  }

  public async implementTask(taskId: string): Promise<{ success: boolean; message: string }> {
    this.state.updateAgentRoleState('backend', 'active', taskId);
    this.state.updateTaskStatus(taskId, 'in_progress');
    this.state.appendAuditLog('BACKEND_WORK', `Backend Agent began implementation on task: ${taskId}`);

    // Simulate work completion
    this.state.updateTaskStatus(taskId, 'implementation_complete');
    this.state.updateAgentRoleState('backend', 'waiting_validation', taskId);
    this.state.appendAuditLog('BACKEND_WORK', `Backend Agent finished code artifacts for task: ${taskId}`);

    return {
      success: true,
      message: `Backend implementation complete for ${taskId}. Code submitted for QA validation.`
    };
  }

  public async fixDefect(defect: Defect): Promise<{ success: boolean; message: string }> {
    this.state.updateAgentRoleState('backend', 'active', defect.task_id);
    this.state.appendAuditLog(
      'DEFECT_FIX_ATTEMPT',
      `Backend Agent addressing ${defect.defect_id} (Attempt #${defect.retry_attempt}): ${defect.title}`
    );

    // Update defect state
    const defects = this.state.getDefects();
    const target = defects.find(d => d.defect_id === defect.defect_id);
    if (target) {
      target.status = 'fixing';
    }

    // Mark task as fix applied
    this.state.updateTaskStatus(defect.task_id, 'fix_applied');
    this.state.updateAgentRoleState('backend', 'waiting_validation', defect.task_id);
    this.state.appendAuditLog(
      'DEFECT_FIX_COMPLETE',
      `Backend Agent applied resolution for ${defect.defect_id}. Requesting QA regression test.`
    );

    return {
      success: true,
      message: `Fix applied for defect ${defect.defect_id}. Ready for QA regression validation.`
    };
  }
}
