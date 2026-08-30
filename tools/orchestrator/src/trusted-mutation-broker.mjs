import { createHash } from "node:crypto"

export const trustedMutationBrokerVersion = 1

export const trustedAdvisoryLockBrokerSource = String.raw`
import fcntl
import json
import os
import sys

def fail(code=78):
    sys.exit(code)

try:
    request = json.loads(sys.stdin.readline())
    if request.get("mode") != "advisory_hold":
        fail()
    if request.get("protocolVersion") != 1:
        fail()
    digest = request.get("contentDigest")
    if not isinstance(digest, str) or len(digest) != 64:
        fail()
    try:
        fcntl.flock(3, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        fail(75)
    value = os.fstat(3)
    print("READY %d %s %d %d" % (1, digest, value.st_dev, value.st_ino), flush=True)
    sys.stdin.read()
    final = os.fstat(3)
    if final.st_dev != value.st_dev or final.st_ino != value.st_ino:
        fail()
except Exception:
    fail()
`

export const trustedAdvisoryLockBrokerDigest = createHash("sha256")
  .update(trustedAdvisoryLockBrokerSource)
  .digest("hex")

export function trustedAdvisoryLockBrokerSpec() {
  return {
    command: "/usr/bin/python3",
    args: ["-I", "-c", trustedAdvisoryLockBrokerSource],
    busyCodes: new Set([75]),
    protocolVersion: trustedMutationBrokerVersion,
    contentDigest: trustedAdvisoryLockBrokerDigest,
    request: {
      mode: "advisory_hold",
      protocolVersion: trustedMutationBrokerVersion,
      contentDigest: trustedAdvisoryLockBrokerDigest,
    },
  }
}
