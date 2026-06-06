import { gzipSync, gunzipSync } from 'node:zlib';
import type { GraphSnapshot } from '../domain/types.js';

export interface SerializedGraph {
  version: string;
  compressed: boolean;
  data: string;
  sizeBytes: number;
  uncompressedSizeBytes: number;
}

export interface GraphDelta {
  addedFactIds: string[];
  addedIntentIds: string[];
  addedEvidenceIds: string[];
  addedFindingIds: string[];
  modifiedIntentIds: string[];
}

const SERIALIZER_VERSION = '1.0.0';

export class GraphSerializer {
  /**
   * Serialize a full graph snapshot with optional compression
   */
  serialize(snapshot: GraphSnapshot, compress = true): SerializedGraph {
    const jsonStr = JSON.stringify(snapshot);
    const uncompressedSize = Buffer.byteLength(jsonStr, 'utf8');

    if (!compress) {
      return {
        version: SERIALIZER_VERSION,
        compressed: false,
        data: jsonStr,
        sizeBytes: uncompressedSize,
        uncompressedSizeBytes: uncompressedSize,
      };
    }

    const buffer = Buffer.from(jsonStr, 'utf8');
    const compressed = gzipSync(buffer);
    const base64Data = compressed.toString('base64');

    return {
      version: SERIALIZER_VERSION,
      compressed: true,
      data: base64Data,
      sizeBytes: base64Data.length,
      uncompressedSizeBytes: uncompressedSize,
    };
  }

  /**
   * Deserialize and validate a graph snapshot
   */
  deserialize(serialized: SerializedGraph): GraphSnapshot {
    if (serialized.version !== SERIALIZER_VERSION) {
      throw new Error(`Unsupported serializer version: ${serialized.version}`);
    }

    let jsonStr: string;

    if (serialized.compressed) {
      const buffer = Buffer.from(serialized.data, 'base64');
      const decompressed = gunzipSync(buffer);
      jsonStr = decompressed.toString('utf8');
    } else {
      jsonStr = serialized.data;
    }

    const snapshot = JSON.parse(jsonStr) as GraphSnapshot;
    this.validate(snapshot);
    return snapshot;
  }

  /**
   * Compute delta between two graph snapshots (for incremental checkpoints)
   */
  computeDelta(baseline: GraphSnapshot, current: GraphSnapshot): GraphDelta {
    const baselineFactIds = new Set(baseline.facts.map((f) => f.id));
    const baselineIntentIds = new Set(baseline.intents.map((i) => i.id));
    const baselineEvidenceIds = new Set(baseline.evidence.map((e) => e.id));
    const baselineFindingIds = new Set(baseline.findings.map((f) => f.id));

    const addedFactIds = current.facts.filter((f) => !baselineFactIds.has(f.id)).map((f) => f.id);
    const addedIntentIds = current.intents.filter((i) => !baselineIntentIds.has(i.id)).map((i) => i.id);
    const addedEvidenceIds = current.evidence.filter((e) => !baselineEvidenceIds.has(e.id)).map((e) => e.id);
    const addedFindingIds = current.findings.filter((f) => !baselineFindingIds.has(f.id)).map((f) => f.id);

    // Find modified intents (status changes, lease updates)
    const modifiedIntentIds: string[] = [];
    const baselineIntentMap = new Map(baseline.intents.map((i) => [i.id, i]));

    for (const currentIntent of current.intents) {
      const baselineIntent = baselineIntentMap.get(currentIntent.id);
      if (baselineIntent && JSON.stringify(baselineIntent) !== JSON.stringify(currentIntent)) {
        modifiedIntentIds.push(currentIntent.id);
      }
    }

    return {
      addedFactIds,
      addedIntentIds,
      addedEvidenceIds,
      addedFindingIds,
      modifiedIntentIds,
    };
  }

  /**
   * Validate graph snapshot structure
   */
  private validate(snapshot: GraphSnapshot): void {
    if (!snapshot.run) {
      throw new Error('Invalid graph snapshot: missing run');
    }
    if (!Array.isArray(snapshot.facts)) {
      throw new Error('Invalid graph snapshot: facts must be an array');
    }
    if (!Array.isArray(snapshot.intents)) {
      throw new Error('Invalid graph snapshot: intents must be an array');
    }
    if (!Array.isArray(snapshot.hints)) {
      throw new Error('Invalid graph snapshot: hints must be an array');
    }
    if (!Array.isArray(snapshot.evidence)) {
      throw new Error('Invalid graph snapshot: evidence must be an array');
    }
    if (!Array.isArray(snapshot.findings)) {
      throw new Error('Invalid graph snapshot: findings must be an array');
    }
    if (snapshot.facts.some((f) => f.runId !== snapshot.run.id)) {
      throw new Error('Invalid graph snapshot: fact runId mismatch');
    }
    if (snapshot.intents.some((i) => i.runId !== snapshot.run.id)) {
      throw new Error('Invalid graph snapshot: intent runId mismatch');
    }
  }

  /**
   * Estimate memory size of a graph snapshot
   */
  estimateSize(snapshot: GraphSnapshot): number {
    const jsonStr = JSON.stringify(snapshot);
    return Buffer.byteLength(jsonStr, 'utf8');
  }
}
