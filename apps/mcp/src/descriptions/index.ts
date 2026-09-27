import { v1 } from "./v1.ts";
import { v2 } from "./v2.ts";

const versions = { v1, v2 } as const;
export const descriptionVersions = versions;
export type DescriptionVersion = keyof typeof versions;

export const descriptionVersion: DescriptionVersion =
  (process.env.TOOL_DESCRIPTIONS as DescriptionVersion) in versions ? (process.env.TOOL_DESCRIPTIONS as DescriptionVersion) : "v2";

export function describe(toolName: string): string {
  const d = versions[descriptionVersion][toolName];
  if (!d) throw new Error(`description 누락: ${descriptionVersion}.${toolName}`);
  return d;
}
