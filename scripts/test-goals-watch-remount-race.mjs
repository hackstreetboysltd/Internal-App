/**
 * Simulates the admin Goals watch race that left production stuck on skeletons.
 * When the effect remounts after every setState (unstable searchParams identity),
 * in-flight gets are cancelled and `seen` never reaches both keys.
 */
import assert from "node:assert/strict";

function runWatchEffect({ remountAfterEachEmit }) {
  const emissions = [];
  let loaded = false;
  let effectGeneration = 0;
  let active = null;

  function mount() {
    effectGeneration += 1;
    const gen = effectGeneration;
    const seen = new Set();
    let cancelled = false;

    const mark = (key) => {
      if (cancelled) return;
      seen.add(key);
      if (seen.size >= 2) loaded = true;
    };

    const emit = (key, data) => {
      if (cancelled) return;
      emissions.push({ gen, key, data });
      mark(key);
      if (remountAfterEachEmit) {
        // Mimic: setState → re-render → new searchParams identity → effect remount
        unmount();
        mount();
      }
    };

    active = {
      unmount() {
        cancelled = true;
      },
      completeGoals() {
        emit("goals", ["g1"]);
      },
      completeProfile() {
        emit("profile", ["u1"]);
      },
    };
  }

  function unmount() {
    active?.unmount();
  }

  mount();
  // Async completions: goals first, then profile (as in production HAR timing)
  active.completeGoals();
  active.completeProfile();
  return { loaded, emissions, generations: effectGeneration };
}

const broken = runWatchEffect({ remountAfterEachEmit: true });
assert.equal(broken.loaded, false, "unstable remount must fail to clear loading");
assert.ok(broken.generations > 2, "remount loop should spawn many effect generations");

const fixed = runWatchEffect({ remountAfterEachEmit: false });
assert.equal(fixed.loaded, true, "stable effect deps must clear loading");
assert.equal(fixed.generations, 1);

console.log("ok — remount race reproduced and fixed-path verified");
