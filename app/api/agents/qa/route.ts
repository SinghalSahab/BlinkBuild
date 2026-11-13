import { NextRequest, NextResponse } from 'next/server';
import { ManagerAgent } from '@/lib/agents/manager/ManagerAgent';
import { SharedProjectState } from '@/lib/agents/state/SharedProjectState';
import { Requirement } from '@/lib/agents/types';

export async function GET() {
  try {
    const state = new SharedProjectState();
    return NextResponse.json({
      requirements: state.getRequirements(),
      tasks: state.getTasks(),
      agentStatus: state.getAgentStatus(),
      testResults: state.getTestResults(),
      defects: state.getDefects()
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to fetch agent state' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const mode = body.mode || 'standard'; // 'standard' | 'seeded_defect' | 'unfixable_escalation'

    const sampleRequirement: Requirement = {
      requirement_id: body.requirementId || `REQ-${Date.now().toString().slice(-4)}`,
      title: body.title || 'Add employee authentication with role-based access control',
      description: body.description || 'Implement login endpoint and JWT role validation.',
      acceptance_criteria: body.acceptanceCriteria || [
        'AC-1: Valid credentials return a signed JWT token with user role',
        'AC-2: Protected endpoints reject requests with missing token (401)',
        'AC-3: Admin-only routes return 403 Forbidden for non-admin users',
        'AC-4: Audit log records authentication events'
      ],
      activated_capabilities: ['backend', 'database', 'qa'],
      created_at: new Date().toISOString(),
      status: 'in_progress'
    };

    const manager = new ManagerAgent();

    let report;
    if (mode === 'seeded_defect') {
      report = await manager.orchestrateRequirement(sampleRequirement, {
        seedDefectOnFirstTry: true,
        simulateUnfixableBug: false
      });
    } else if (mode === 'unfixable_escalation') {
      report = await manager.orchestrateRequirement(sampleRequirement, {
        seedDefectOnFirstTry: true,
        simulateUnfixableBug: true
      });
    } else {
      report = await manager.orchestrateRequirement(sampleRequirement);
    }

    return NextResponse.json({
      report,
      stateSnapshot: {
        agentStatus: new SharedProjectState().getAgentStatus(),
        defects: new SharedProjectState().getDefects(),
        testResults: new SharedProjectState().getTestResults()
      }
    });
  } catch (error: any) {
    console.error('Error in QA Agent Orchestration API:', error);
    return NextResponse.json(
      { error: error?.message || 'Multi-agent orchestration error' },
      { status: 500 }
    );
  }
}
