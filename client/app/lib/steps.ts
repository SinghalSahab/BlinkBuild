
export enum StepType {
    CreateFile,
    CreateFolder,
    EditFile,
    DeleteFile,
    RunScript
  }
  
  export interface Step {
    id: number;
    title: string;
    description: string;
    type: StepType;
    status: 'pending' | 'in-progress' | 'completed';
    code?: string;
    path?: string;
  }


  export function parseXml(response: string): Step[] {
    if (!response) return [];
    const artifactRegex = /<boltArtifact[^>]*>([\s\S]*?)<\/boltArtifact>/;
    const artifactMatch = response.match(artifactRegex);
  
    if (!artifactMatch) {
      return [];
    }
  
    const xmlContent = artifactMatch[1];
    const steps: Step[] = [];
    let stepId = 1;
  
    const titleMatch = response.match(/title="([^"]*)"/);
    const artifactTitle = titleMatch ? titleMatch[1] : 'Project Files';
  
    steps.push({
      id: stepId++,
      title: artifactTitle,
      description: '',
      type: StepType.CreateFolder,
      status: 'pending'
    });
  
    // More flexible regex to support multiline attributes
    const actionRegex = /<boltAction[^>]*type="([^"]*)"(?:[^>]*filePath="([^"]*)")?[^>]*>([\s\S]*?)<\/boltAction>/g;
  
    let match;
    while ((match = actionRegex.exec(xmlContent)) !== null) {
      const [_, type, filePath, content] = match;
  
      if (type === 'file') {
        steps.push({
          id: stepId++,
          title: `Create ${filePath || 'file'}`,
          description: '',
          type: StepType.CreateFile,
          status: 'pending',
          code: content.trim(),
          path: filePath
        });
      } else if (type === 'shell') {
        steps.push({
          id: stepId++,
          title: 'Run command',
          description: '',
          type: StepType.RunScript,
          status: 'pending',
          code: content.trim()
        });
      }
    }
    //console.log("Parsed steps be:", steps);
    return steps;
  }
  