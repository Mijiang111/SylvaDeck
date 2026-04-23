import { z } from "zod";

export const installAgentIdSchema = z.enum(["codex", "claude-code", "cursor"]);

export const installOnboardRequestSchema = z.object({
  agentId: installAgentIdSchema.optional().default("codex"),
  installSkill: z.boolean().optional().default(true),
  installDependencies: z.boolean().optional().default(true),
  startDevHint: z.boolean().optional().default(true),
});

export type InstallOnboardRequest = z.infer<typeof installOnboardRequestSchema>;
