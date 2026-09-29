import "server-only";
import { z } from "zod";

const Actor = z.strictObject({
  kind: z.enum(["human", "agent"]),
  name: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .regex(/^[\p{L}\p{N} ._'-]+$/u),
});

const Target = z.strictObject({
  signalId: z.string().min(1).max(200),
  project: z.string().regex(/^[a-z0-9_]{1,64}$/),
});

const base = {
  target: Target,
  baseRevision: z.string().regex(/^[0-9a-f]{64}$/),
  actor: Actor,
};

export const RepairRequest = z.discriminatedUnion("op", [
  z.strictObject({
    op: z.literal("requeue_analysis"),
    ...base,
    reason: z.string().trim().max(280).optional(),
  }),
  z.strictObject({
    op: z.literal("set_summary"),
    ...base,
    summary: z
      .string()
      .transform((v) => v.replace(/\r\n?/g, "\n").trim())
      .pipe(
        z
          .string()
          .min(20)
          .max(2000)
          .refine(
            (v) => !/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(v),
            "control characters are not allowed",
          ),
      ),
  }),
]);

export type RepairRequestInput = z.infer<typeof RepairRequest>;
