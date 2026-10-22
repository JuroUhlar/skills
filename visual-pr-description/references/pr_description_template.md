### Context
[{RELEVANT LINK}]({RELEVANT LINK})  | [{RELEVANT LINK 2}]({RELEVANT LINK 2})  | ...

### Why

{Exactly one sentence explaining the problem this PR solves and what becomes possible after it ships.}

### Things to note

- {List 1-3 reviewer-relevant warnings, migrations, constraints, deliberate omissions, or surprising decisions. Use "None." when there are no special considerations.}

### Verification

{How the change was proven to work end to end from user's POV: the command and its output, before vs after, screenshots, or a link to the check script. Pick one or two highest-signal most end-to-end things. Omit low-level things obvious from CI like lint, unit tests, type-check etc. Name what was not verified. Omit this section when nothing could be run.}

### Change outline

{Use the smallest combination of the following `/show-me`-style views that explains the implementation. Prefer `diff` blocks for changes to existing shapes and complete blocks for mostly new shapes. Do not include headings for views that are not relevant.}

{...short-description...}

```diff|sql|json|etc
{Show changed SQL tables, important columns and relationships, and endpoint request/response contracts.}
```

{...short-description...}

```typescript|python|etc
{show new data structures that are key to the implementation}
```

{...short-description...}

```diff
{Show concise pseudocode for the changed behavior.}
```


{...short-description...}

```diff
{Show a shallow file tree with changed responsibilities. Likely only useful if it has multiple files across multiple directories.}
```


{...short-description...}

```diff
{Show changed React component trees, important hooks or state, and package boundaries.}
```

{...short-description...}

```diff
{Show changed call trees, call stacks, control flow, or data flow.}
```

{...short-description...}

| {Item} | {From} | {To} | {Why} |
|---|---|---|---|
| {Show list-like changes with several attributes per item, such as dependency bumps, as a table. Not as a `diff` block: there a `-` line renders as a red deletion.} | | | |

{Tell the story in the order that makes it easiest to understand. It may make sense to show files first, or it may make sense to establish a data structure, SQL table, or API contract first. All views and subheadings are optional. Use only the views that help explain the pr, and name or order them based on the change rather than a fixed template. It should be written as one human would write to another. Use `diff` for a focused change to an existing shape. Show the complete target shape in a language-specific or `text` block when it is new, high-level, or clearer without diff notation.}
