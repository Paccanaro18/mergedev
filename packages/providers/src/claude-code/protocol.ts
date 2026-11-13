import type { PermissionDecision } from "@merge/core";

/** One line of stream-json input: the user's prompt. */
export function userMessageLine(prompt: string): string {
  return JSON.stringify({ type: "user", message: { role: "user", content: prompt } }) + "\n";
}

/** Answer to a `can_use_tool` control_request (see docs/permissions-spike.md). */
export function permissionResponseLine(
  requestId: string,
  input: unknown,
  { decision, reason }: PermissionDecision,
): string {
  const response =
    decision === "allow"
      ? { behavior: "allow", updatedInput: input }
      : { behavior: "deny", message: reason ?? "Denied by the user" };
  return (
    JSON.stringify({
      type: "control_response",
      response: { subtype: "success", request_id: requestId, response },
    }) + "\n"
  );
}
