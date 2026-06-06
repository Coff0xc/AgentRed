import type { GraphSnapshot, Intent, RiskLevel } from '../domain/types.js';
import type { WorkerCredentialReferenceContext } from '../credentials/credential-reference-service.js';
import type { WorkerPocTemplateContext } from '../poc/poc-template-service.js';
import type { WorkerDomainSkillContext } from '../skills/domain-skill-service.js';
import type { WorkerToolboxBundleContext } from '../tools/toolbox-runner.js';
import type { WorkerConnectorContext } from '../connectors/connector-registry-service.js';

export type WorkerTask =
  | {
      type: 'bootstrap';
      graph: GraphSnapshot;
      domainSkills?: WorkerDomainSkillContext[];
      credentialReferences?: WorkerCredentialReferenceContext[];
      pocTemplates?: WorkerPocTemplateContext[];
      toolboxBundles?: WorkerToolboxBundleContext[];
      connectors?: WorkerConnectorContext[];
    }
  | {
      type: 'reason';
      graph: GraphSnapshot;
      domainSkills?: WorkerDomainSkillContext[];
      credentialReferences?: WorkerCredentialReferenceContext[];
      pocTemplates?: WorkerPocTemplateContext[];
      toolboxBundles?: WorkerToolboxBundleContext[];
      connectors?: WorkerConnectorContext[];
    }
  | {
      type: 'explore';
      graph: GraphSnapshot;
      intent: Intent;
      domainSkills?: WorkerDomainSkillContext[];
      credentialReferences?: WorkerCredentialReferenceContext[];
      pocTemplates?: WorkerPocTemplateContext[];
      toolboxBundles?: WorkerToolboxBundleContext[];
      connectors?: WorkerConnectorContext[];
      /** Evidence IDs produced in prior rounds of a multi-round explore. Present only on round >= 2. */
      producedEvidenceIds?: string[];
    };

export interface WorkerToolRequest {
  tool: string;
  target: string;
  method?: string;
  riskLevel?: RiskLevel;
  args?: Record<string, unknown>;
  purpose?: string;
  approvalId?: string;
}

export type WorkerTaskResult =
  | {
      accepted: true;
      data: {
        fact?: { description: string };
        complete?: { description: string; from?: string[] };
        intent?: { description: string; from: string[]; riskLevel?: 'R0' | 'R1' | 'R2' | 'R3' | 'R4'; role?: 'scout' | 'exploit' | 'credential' | 'generalist' };
        description?: string;
        toolRequests?: WorkerToolRequest[];
        /** When true, the dispatcher will re-invoke this worker after executing toolRequests,
         *  passing back the produced evidence IDs so the worker can reason on actual results. */
        continueExplore?: boolean;
      };
    }
  | { accepted: false; reason: string };

export interface WorkerAdapter {
  name: string;
  healthcheck(): Promise<boolean>;
  execute(task: WorkerTask): Promise<WorkerTaskResult>;
}
