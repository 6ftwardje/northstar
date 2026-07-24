import { appConfig } from "@/lib/config";

const ACTION_HEADER = "x-northstar-action";
const ACTION_VALUE = "calendar-v1";

export function isTrustedActionRequest(request: Request) {
  const origin = request.headers.get("origin");
  const action = request.headers.get(ACTION_HEADER);

  try {
    return (
      action === ACTION_VALUE &&
      origin === new URL(appConfig.appUrl).origin
    );
  } catch {
    return false;
  }
}
