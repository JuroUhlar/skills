---
name: exp-formal-verification
description: Use when the user invokes exp-formal-verification.
disable-model-invocation: true
metadata:
  inspiration: https://github.com/mattzcarey/everystate/tree/c752c4c1c07f7036e74ca0caf6bd24400cc82e86/skills/formal-verification
---

# Formal verification

Model-check a small TLA+ model of the design with [everystate](https://github.com/mattzcarey/everystate), a TLC-compatible checker (TLC is the standard TLA+ model checker) in one binary, no Java.

- Use it for questions like "can these steps happen in an order that breaks a promise?": races, retries, timeouts, locks, leases, queues, state machines, distributed protocols. Tests rarely reach those interleavings; the checker tries every one.
- It checks the model, not the code. For "is this function right for every input", use property-based tests. To check the code against the model, see [Check the code against the model](#check-the-code-against-the-model).

## The tool

```sh
npx everystate Spec.tla                    # reads Spec.cfg next to it
npx everystate -config Other.cfg Spec.tla  # another config of the same spec
npx everystate -json Spec.tla              # last stdout line: {status, state counts, name, trace}
npx everystate pcal Spec.tla               # translate PlusCal
npx everystate -simulate num=10000 Spec.tla  # random behaviours when the model is too big; a pass covers only those
```

- Exit codes: `0` nothing found, `10` false `ASSUME`, `11` deadlock, `12` invariant violated, `13` liveness violated, `150`/`151` spec/cfg doesn't parse.
- On failure, `trace` is the shortest list of `{action, state}` steps that reaches it.
- `-workers auto` uses every core. No TLAPS proofs. A few million states is fine.

## Steps

1. **Pick the promise.** One sentence the code must keep, where a break harms users: "a card is charged at most once". Take it from the code; ask the user only what the code doesn't show.
2. **Model the steps, not the code.**
   - One variable per piece of state that matters, one action per step that can interleave.
   - A read then a write is two actions unless a lock or transaction makes it one.
   - Include failures: lost messages, timeouts, crashes, retries.
   - Use the code's names; comment each action with the function it stands for.
3. **Bound it.** Keep constants small in the `.cfg` (2-3 workers, 3 retries). Most design bugs show up at these sizes.
4. **State the properties.** A type invariant first (catches modelling mistakes), then the promise as an `INVARIANT` ("never bad") or a `PROPERTY` ("eventually good", needs fairness in `Spec`).
5. **Read the result.** Retell a counterexample trace as a short story in the code's words. Then check the code: real bug, or a step the model allows that the code can't take?
6. **See it fail.** Break the model the way the code could break (drop the guard, swap two steps) and confirm the checker reports it. Keep it as a second `.cfg`.
7. **Report the scope.** What was checked, at which bounds, under which assumptions, and what the model leaves out. A pass covers the model at those bounds only.

- Never weaken a property or the model to get a pass.
- Don't change product code unless asked; a counterexample on current code is a finding.

## Example

[`example/Charge.tla`](example/Charge.tla): a client retries a card charge when the reply is lost. The constant `Idempotent` says whether the server remembers the request key.

```sh
cd example
npx everystate Charge.tla                           # Idempotent = TRUE: exit 0
npx everystate -config ChargeBroken.cfg Charge.tla  # Idempotent = FALSE: exit 12, ChargedAtMostOnce violated
```

Trace story: the client sends, times out, sends again; the server handles both and charges twice.

## Check the code against the model

Trace conformance: record what the running code did, then check the recording is a behaviour the spec allows. A mismatch means a code bug or a model that doesn't describe the code.

```sh
npx everystate conform -trace run.jsonl Spec.tla
```

- **Record** one JSON line per model step, where the step takes effect in code, using the model's action and variable names. See [`example/observe.ts`](example/observe.ts).
- **Line keys:** `action` (omitted: any action), `params` (`["w1"]` or `{"w": "w1"}`), `state` (variables after the step; omitted ones are unconstrained). Other keys are ignored. The first line is the initial state.
- **Values** match by the spec's type: `[1, 2]` is a sequence or a set; `{"a": 1}` is a record or a function; `{"a": 1, "...": 0}` means "at least `a |-> 1`"; `"w1"` also matches model value `w1`.
- **Options:** `-hidden N` allows N unlogged steps before each line; `-stutter` lets a line without `action` be an unchanged snapshot; `-behavior` prints a full matching behaviour; `-json`; `-limit N` caps tracked states (default 100000).
- **Exit codes:** `0` conforms, `20` doesn't (report names the first unmatched line), `12` the run violates an invariant (the model is wrong), `21`/`22` malformed trace or too many candidate states, `150`/`151` parse error.
- Example: `charge-ok.jsonl` exits 0; `charge-double.jsonl` exits 20 against `Charge.cfg` and 12 against `ChargeBroken.cfg`.

Using it well:
- On a mismatch, decide against the code which side is wrong.
- If the report suggests `-hidden` or `-stutter`, the log is missing or repeating steps. Fix the logging rather than loosen the check.
- Log in step order. With several processes, use one ordered log, or check each process's log separately with `-hidden`.
- Log only the variables the promise is about, and name the action. Fewer logged variables means more runs pass.
- A pass covers the recorded runs only. Run it in CI next to the model check, fed by an integration test that exercises retries and failures.

## Keep it for the next change

If the check should outlive the task, commit the spec and `.cfg` next to the code with:
- the command that runs it
- which file and function each action stands for
- the bounds
- the commit at which the model last matched the code
