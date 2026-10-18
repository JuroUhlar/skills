# Agent skills

My personal agent skills for planning, building, verifying, and reviewing code.
Grouped by workflow stage.

## Install

Claude Code, as a plugin:

```
/plugin marketplace add JuroUhlar/skills
/plugin install juraj-skills@juraj-skills
```

Skills are then available as `/juraj-skills:<skill>`, for example `/juraj-skills:tdd`.

Any agent harness, with [`skills`](https://github.com/vercel-labs/skills):

```
npx skills add JuroUhlar/skills
```

Or copy a skill folder into `~/.claude/skills/`.

## Skills

> Note: when adding or removing a skill, update this list and `.claude-plugin/marketplace.json`.
> Skills prefixed `fp-` are private and gitignored.

### Building non-trivial stuff

1. Get shared understanding.
   1. [`grill-me`](grill-me/SKILL.md)
2. Capture shared understanding 
   1. [`to-spec`](to-spec/SKILL.md) (spec is client-exposed interface + expected behavior, NOT line-by-line implementation plan)
3. (Optional) Plan implementation steps
   1. [`to-tickets`](to-tickets/SKILL.md) Prefer building in vertical slices (tracer bullets), not horizontal layers.
4. Implement. 
5. Verify it works
   1. [`verify-with-proof`](verify-with-proof/SKILL.md)
6. Self-review
   1. [`code-review`](code-review/SKILL.md)
   2. [`tdd`](tdd/SKILL.md)
   3. Apply [`core-principles`](core-principles/SKILL.md)
7. Human review
   1. [`visual-pr-description`](visual-pr-description/SKILL.md)
      * [`show-me`](show-me/SKILL.md)
   2. [`stage-pr`](stage-pr/SKILL.md)
   3. [`pr-comments`](pr-comments/SKILL.md)

### Architecting, gardening

* [`improve-codebase-architecture`](improve-codebase-architecture/SKILL.md)
* [`improve-codebase-docs`](improve-codebase-docs/SKILL.md)
* [`improve-codebase-guardrails`](improve-codebase-guardrails/SKILL.md)

### Agent rules and nudges

* [`write-well`](write-well/SKILL.md)
  * Say defaults out loud; approval covers only what was shown (superpowers brainstorming)
* [`code-comments`](code-comments/SKILL.md)
* [`commit-rules`](commit-rules/SKILL.md)
* [`orchestrator`](orchestrator/SKILL.md)

### Debugging

* [`diagnose-bug`](diagnose-bug/SKILL.md)

### Meta

* [`write-agent-skill`](write-agent-skill/SKILL.md)

## Inspiration

* [mattpocock/skills](https://github.com/mattpocock/skills)
* [poteto pstack](https://github.com/cursor/plugins/tree/main/pstack)
* [Obra superpowers](https://github.com/obra/superpowers)
* [humanlayer/skills](https://github.com/humanlayer/skills)

## License

MIT, see [LICENSE](LICENSE). Some skills adapt MIT-licensed material from the projects above.


