import type { SystemicPattern } from "@/lib/contracts";

export default function SystemicBanner({ patterns }: { patterns: SystemicPattern[] }) {
  if (patterns.length === 0) return null;
  return (
    <div className="systemic-banner" role="status">
      {patterns.map((p) => (
        <p key={p.classId}>! {p.message}</p>
      ))}
    </div>
  );
}
