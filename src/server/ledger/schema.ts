import "server-only";
import { z } from "zod";

// fail -> 500 LEDGER_INVALID
export const Root = z.looseObject({ version: z.literal(4), signals: z.array(z.unknown()) });

export const Entry = z.looseObject({
  state: z.enum(["pending", "analyzed", "deferred"]),
  analyzed_at: z.string().nullable().optional(),
  files_reviewed: z.array(z.string()).optional(),
  analysis_ref: z.unknown().optional(), // HD2 classifies odd refs
});

export const Signal = z.looseObject({
  id: z.string().min(1),
  match_key: z.string(),
  type: z.string(),
  title: z.string(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^\d{2}:\d{2}$/),
  attendees: z.array(z.string()),
  projects: z.array(z.string()).min(1),
  summary: z.unknown(),
  notes: z.unknown(),
  expected_files: z.array(z.unknown()),
  status: z.record(z.string(), Entry),
  sources: z.record(z.string(), z.string().nullable()),
});

export type RawEntry = z.infer<typeof Entry>;
export type RawSignal = z.infer<typeof Signal>;
export type RawRoot = z.infer<typeof Root>;
