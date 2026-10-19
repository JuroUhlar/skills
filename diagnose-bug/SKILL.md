---
name: diagnose-bug
description: Use when the user says "diagnose" or "debug this", or reports something broken, throwing, failing, flaky, or slow whose cause isn't obvious.
metadata:
  inspiration:
    - https://github.com/mattpocock/skills/tree/main/skills/engineering/diagnosing-bugs
    - https://github.com/obra/superpowers/tree/main/skills/systematic-debugging
    - https://github.com/cursor/plugins/tree/main/pstack
---

# Diagnose a bug

Phases run in order. Skip one only with a stated reason.

## 1. Build a feedback loop

The loop is the skill. With a command that goes red on _this_ bug, bisection and hypotheses become mechanical. Without one, reading code won't save you. Spend most effort here.

### Loop options

If the repo has a `VERIFICATION.md` or a project verification skill, start from how it drives the project. Then, roughly in order of preference:

- Failing test at whatever level reaches the bug.
- `curl`/HTTP script against a running dev server.
- CLI run on a fixture, diffed against a known-good snapshot.
- Headless browser script asserting on DOM, console, or network.
- Replay of a captured request, payload, or event log.
- Throwaway harness: minimal slice of the system, mocked deps.
- Fuzz loop for "sometimes wrong output".
- `git bisect run` when the bug appeared between two known states.
- Differential run: same input through old vs new version or config.
- Human in the loop, last resort: drive them with [scripts/hitl-loop.template.sh](scripts/hitl-loop.template.sh).

### Tighten the loop

- Faster: cache setup, skip unrelated init, narrow scope.
- Sharper: assert the exact symptom, not "didn't crash".
- Deterministic: pin time, seed RNG, isolate filesystem and network.

### Flaky bugs

Aim for a higher repro rate, not a clean repro. Loop the trigger 100×, parallelize, add stress, widen timing windows. 50% is debuggable, 1% isn't.

### No loop possible

Stop and say so. List what you tried. Ask for an environment that reproduces it, a captured artifact (HAR, logs, core dump, timestamped recording), or permission for temporary prod instrumentation. Don't hypothesize without a loop.

### Loop done when

You've run one named command (show invocation and output) that is:

- Red-capable: hits the real code path and asserts the user's exact symptom.
- Deterministic, or a pinned high repro rate.
- Fast: seconds.
- Runnable unattended (human only via the HITL script).

Reading code to build a theory before this exists is the failure this skill prevents.

## 2. Reproduce and minimize

- Confirm it's the user's failure, not a nearby one. Wrong bug, wrong fix.
- Capture the exact symptom so the fix can be checked against it.
- Cut inputs, callers, config, data, and steps one at a time, re-running after each. Done when removing anything turns it green.

## 3. Hypothesize

- Write 3–5 ranked hypotheses before testing any. One hypothesis anchors.
- Each states a prediction: "If X is the cause, changing Y makes it disappear." No prediction, discard it.
- Show the list to the user. They often re-rank instantly. Don't block if they're away.

## 4. Instrument

- Each probe tests one prediction. Change one variable at a time.
- Debugger or REPL over logs. Targeted logs at boundaries that split hypotheses. Never log everything and grep.
- Tag debug logs with a unique prefix (`[DEBUG-a4f2]`) so cleanup is one grep.
- Perf: measure a baseline (timer, profiler, query plan) and bisect. Logs mislead here.

## 5. Fix with a regression test

- Test first, but only where a test can reproduce the real bug pattern. A too-shallow test (single caller when the bug needs several, unit test missing the triggering chain) gives false confidence.
- If no test can reproduce it, that's a finding. Record it.
- Otherwise: minimized repro → failing test → fix → passing test → re-run the original phase 1 loop.

### Fix the root cause

- No guards, retries, or catches that hide the symptom.
- Fix every instance of the pattern, not just the reported one.
- A numeric cap (retry limit, timeout, max size) lumps two failures together. Fix the bad behavior, not the count.

### When fixes keep failing

- After 2 failed fixes that rest on the same premise, write the premise down and question it.
- After 3, question the architecture before trying a 4th.

## 6. Clean up

- Original loop no longer reproduces.
- Regression test passes, or why none is possible is noted.
- `[DEBUG-` prefix greps clean. Throwaway harnesses deleted.
- Commit or PR states the confirmed hypothesis.
- Say what would have prevented the bug (untestable code path, tangled callers, hidden coupling). See [Shape of the code](../core-principles/SKILL.md#shape-of-the-code).
