import { appConfig } from "@/lib/config";

const ACTION_HEADER = "x-northstar-action";
const ACTION_VALUES = new Set(["calendar-v1", "northstar-v1"]);

export function isTrustedActionRequest(request: Request) {
  const origin = request.headers.get("origin");
  const action = request.headers.get(ACTION_HEADER);

  try {
    return (
      action !== null &&
      ACTION_VALUES.has(action) &&
      origin === new URL(appConfig.appUrl).origin
    );
  } catch {
    return false;
  }
}
