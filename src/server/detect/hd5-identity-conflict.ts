import "server-only";
import { canonicalId, identityKey, sourcePaths, type DetectorContext } from "./context.js";
import type { RawSignal } from "../ledger/schema.js";

export type ConflictKind = "exact_id_collision" | "near_duplicate" | "id_format_mismatch";

export interface ConflictMemberResult {
  ledgerIndex: number;
  signal: RawSignal;
  idMatchesRule: boolean;
}

export interface ConflictGroupResult {
  groupId: string; // "HD5:" + sorted member ledger indices joined by ","
  kind: ConflictKind;
  members: ConflictMemberResult[];
  sharedSourcePaths: string[];
}

class UnionFind {
  private readonly parent = new Map<number, number>();

  constructor(indices: Iterable<number>) {
    for (const i of indices) this.parent.set(i, i);
  }

  find(x: number): number {
    let root = x;
    while (this.parent.get(root) !== root) root = this.parent.get(root)!;
    while (this.parent.get(x) !== root) {
      const next = this.parent.get(x)!;
      this.parent.set(x, root);
      x = next;
    }
    return root;
  }

  union(a: number, b: number): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(ra, rb);
  }
}

function intersectSourcePaths(members: { signal: RawSignal }[]): string[] {
  if (members.length === 0) return [];
  let result = sourcePaths(members[0]!.signal);
  for (const m of members.slice(1)) {
    const paths = sourcePaths(m.signal);
    result = new Set([...result].filter((p) => paths.has(p)));
  }
  return [...result].sort();
}

function makeGroup(kind: ConflictKind, members: { ledgerIndex: number; signal: RawSignal }[]): ConflictGroupResult {
  const sortedIndices = [...members.map((m) => m.ledgerIndex)].sort((a, b) => a - b);
  return {
    groupId: `HD5:${sortedIndices.join(",")}`,
    kind,
    members: members
      .slice()
      .sort((a, b) => a.ledgerIndex - b.ledgerIndex)
      .map((m) => ({ ledgerIndex: m.ledgerIndex, signal: m.signal, idMatchesRule: m.signal.id === canonicalId(m.signal) })),
    sharedSourcePaths: intersectSourcePaths(members),
  };
}

/** HD5 · identity_conflict · records sharing an id or a (date, match_key) pair (spec §3.7). */
export function detectHD5(ctx: DetectorContext): ConflictGroupResult[] {
  const indices = ctx.signals.map((s) => s.ledgerIndex);
  const uf = new UnionFind(indices);

  const byId = new Map<string, number[]>();
  const byIdentityKey = new Map<string, number[]>();
  for (const { ledgerIndex, signal } of ctx.signals) {
    const id = signal.id;
    const ik = identityKey(signal);
    (byId.get(id) ?? byId.set(id, []).get(id)!).push(ledgerIndex);
    (byIdentityKey.get(ik) ?? byIdentityKey.set(ik, []).get(ik)!).push(ledgerIndex);
  }
  for (const group of [...byId.values(), ...byIdentityKey.values()]) {
    for (let i = 1; i < group.length; i++) uf.union(group[0]!, group[i]!);
  }

  const components = new Map<number, number[]>();
  for (const ledgerIndex of indices) {
    const root = uf.find(ledgerIndex);
    (components.get(root) ?? components.set(root, []).get(root)!).push(ledgerIndex);
  }

  const groups: ConflictGroupResult[] = [];
  for (const memberIndices of components.values()) {
    const members = memberIndices.map((li) => ({ ledgerIndex: li, signal: ctx.signalByIndex.get(li)! }));
    if (members.length >= 2) {
      const allSameId = members.every((m) => m.signal.id === members[0]!.signal.id);
      groups.push(makeGroup(allSameId ? "exact_id_collision" : "near_duplicate", members));
    } else {
      const only = members[0]!;
      if (only.signal.id !== canonicalId(only.signal)) {
        groups.push(makeGroup("id_format_mismatch", members));
      }
    }
  }

  return groups;
}
