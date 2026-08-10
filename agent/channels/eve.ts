import { eveChannel } from "eve/channels/eve"
import { none } from "eve/channels/auth"

/**
 * The HTTP channel the browser chat panel talks to (same-origin via `withEve`).
 *
 * This is a public, in-app demo playground with no sensitive data or
 * side-effects (every external capability is mocked), so the channel is open.
 * For a real agent, replace `none()` with `[vercelOidc(), localDev()]` or your
 * own auth policy. See https://eve.dev/docs/guides/auth-and-route-protection
 */
export default eveChannel({
  auth: none(),
})
