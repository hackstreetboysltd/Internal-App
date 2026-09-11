/**
 * Run work without holding the HTTP response open.
 *
 * Next.js `after()` has blocked route-handler responses (including on Vercel).
 * Prefer the platform waitUntil hook when present; otherwise detach with
 * setImmediate so EmailJS cannot stall a messages write.
 *
 * @param {() => (void | Promise<void>)} work
 */
export function scheduleAfterResponse(work) {
  const run = async () => {
    try {
      await work();
    } catch (err) {
      console.warn("[after] background work failed:", err);
    }
  };

  const requestContext = globalThis[Symbol.for("@next/request-context")];
  const waitUntil = requestContext && typeof requestContext.get === "function"
    ? requestContext.get()?.waitUntil
    : null;
  if (typeof waitUntil === "function") {
    waitUntil(run());
    return;
  }

  setImmediate(() => {
    void run();
  });
}
