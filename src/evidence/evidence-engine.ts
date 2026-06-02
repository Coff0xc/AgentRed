import { createHash } from 'node:crypto';

import { newId, nowIso } from '../domain/ids.js';
import type { Evidence, EvidenceKind, RedactionState } from '../domain/types.js';
import type { RunEventService } from '../events/run-event-service.js';
import type { EvidenceBlob, PlatformStore } from '../storage/store.js';

export class EvidenceEngine {
  constructor(
    private readonly store: PlatformStore,
    private readonly events?: RunEventService,
  ) {}

  addEvidence(input: {
    runId: string;
    kind: EvidenceKind;
    content: string | Buffer;
    redactionState: RedactionState;
    toolCallId?: string;
    cloudUri?: string;
  }): Evidence {
    if (!this.store.state.runs[input.runId]) {
      throw new Error(`Run not found: ${input.runId}`);
    }
    const content = Buffer.isBuffer(input.content) ? input.content : Buffer.from(input.content);
    const localUri = `local://evidence/${newId('blob')}`;
    const evidence: Evidence = {
      id: newId('evidence'),
      runId: input.runId,
      kind: input.kind,
      localUri,
      cloudUri: input.cloudUri,
      sha256: createHash('sha256').update(content).digest('hex'),
      redactionState: input.redactionState,
      toolCallId: input.toolCallId,
      createdAt: nowIso(),
    };
    this.store.state.evidence[evidence.id] = evidence;
    this.store.state.evidenceBlobs[localUri] = {
      encoding: Buffer.isBuffer(input.content) ? 'base64' : 'utf8',
      content: Buffer.isBuffer(input.content) ? content.toString('base64') : content.toString('utf8'),
      sizeBytes: content.byteLength,
    };
    this.events?.record({
      runId: input.runId,
      type: 'evidence.added',
      title: 'Evidence added',
      detail: `${input.kind} ${evidence.sha256}`,
      entityId: evidence.id,
    });
    this.store.commit();
    return evidence;
  }

  readEvidenceContent(evidenceId: string): Buffer {
    const blob = this.readEvidenceBlob(evidenceId);
    return blob.encoding === 'base64' ? Buffer.from(blob.content, 'base64') : Buffer.from(blob.content, 'utf8');
  }

  readEvidenceBlob(evidenceId: string): EvidenceBlob {
    const evidence = this.store.state.evidence[evidenceId];
    if (!evidence) {
      throw new Error(`Evidence not found: ${evidenceId}`);
    }
    const blob = this.store.state.evidenceBlobs[evidence.localUri];
    if (!blob) {
      throw new Error(`Evidence content not found: ${evidence.localUri}`);
    }
    return blob;
  }
}
