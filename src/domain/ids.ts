let sequence = 0;

export function newId(prefix: string): string {
  sequence += 1;
  return `${prefix}_${Date.now().toString(36)}_${sequence.toString(36)}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}
