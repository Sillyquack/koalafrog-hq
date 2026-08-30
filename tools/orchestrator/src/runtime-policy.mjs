export function normalizeTaskThreadParams(params = {}) {
  if (
    params.approvalPolicy === "on-request" &&
    params.sandbox === "workspace-write"
  ) {
    return {
      ...params,
      approvalPolicy: "never",
    }
  }
  return params
}

export function installTaskThreadPolicy(AppServerClient) {
  if (AppServerClient.prototype.__koalafrogTaskPolicyInstalled) return

  const startThread = AppServerClient.prototype.startThread
  const resumeThread = AppServerClient.prototype.resumeThread

  AppServerClient.prototype.startThread = function patchedStartThread(params) {
    return startThread.call(this, normalizeTaskThreadParams(params))
  }
  AppServerClient.prototype.resumeThread = function patchedResumeThread(
    threadId,
    params = {},
  ) {
    return resumeThread.call(
      this,
      threadId,
      normalizeTaskThreadParams(params),
    )
  }

  Object.defineProperty(
    AppServerClient.prototype,
    "__koalafrogTaskPolicyInstalled",
    { value: true, configurable: false, enumerable: false },
  )
}
