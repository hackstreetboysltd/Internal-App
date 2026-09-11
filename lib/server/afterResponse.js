import { after } from "next/server";

/**
 * Run work after the HTTP response is flushed (Next.js `after` → Vercel waitUntil).
 * Outside a request (unit tests) the callback still runs, detached.
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
  try {
    after(run);
  } catch {
    void run();
  }
}
