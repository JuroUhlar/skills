# Agent skills

My personal agent skills for planning, building, verifying, and reviewing code.
Grouped by workflow stage.

Heavily inspired by [pstack](https://github.com/cursor/plugins/tree/main/pstack), streamlined for brevity and lower token cost, and tuned to how I work.

## Install

Install the `all` plugin to get every skill, including the [`pmode`](pmode/SKILL.md) router that links them into one workflow. Or install individual skills; each is its own plugin. Don't install both, or every skill loads twice.

Claude Code:

```
/plugin marketplace add JuroUhlar/skills
/plugin install all@juraj-skills
```

Skills are then available as `/<plugin>:<skill>`, for example `/all:tdd`, or `/tdd:tdd` for the individual plugin.

Plugins are unversioned, so every push to `main` is an update. To receive updates automatically, turn on auto-update under `/plugin` → Marketplaces → `juraj-skills`. Otherwise run `/plugin marketplace update juraj-skills`.

Claude chat (claude.ai): Customize → Plugins → Add → Add marketplace, enter `JuroUhlar/skills`, then install the plugins you want.

Any agent harness, with [`skills`](https://github.com/vercel-labs/skills):

```
npx skills add JuroUhlar/skills
```

Or copy a skill folder into `~/.claude/skills/`.

## Skills

> Note: when adding or removing a skill, update this list and run `npm run build` to regenerate `.claude-plugin/marketplace.json`. `npm run check` (also run in CI) catches the rest.
> Skills prefixed `fp-` are private and gitignored.

### Entry point

* [`pmode`](pmode/SKILL.md) triggers when a conversation opens with a task, issue, or bug. It picks a playbook (bug fix, feature, gardening) and offers the skills below in order. Questions and trivial edits skip it.

### Building non-trivial stuff

1. Get shared understanding.
   1. [`grill-me`](grill-me/SKILL.md)
2. Capture shared understanding 
   1. [`to-spec`](to-spec/SKILL.md) (spec is client-exposed interface + expected behavior, NOT line-by-line implementation plan)
3. (Optional) Plan implementation steps
   1. [`to-tickets`](to-tickets/SKILL.md) Prefer building in vertical slices (tracer bullets), not horizontal layers.
4. Implement.
   1. [`tdd`](tdd/SKILL.md)
5. Verify it works
   1. [`verify-with-proof`](verify-with-proof/SKILL.md)
6. Self-review
   1. [`code-review`](code-review/SKILL.md)
   2. [`tdd`](tdd/SKILL.md) (test audit)
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
* [`create-verification-skill`](create-verification-skill/SKILL.md)

### Agent rules and nudges

* [`write-well`](write-well/SKILL.md)
* [`code-comments`](code-comments/SKILL.md)
* [`commit-rules`](commit-rules/SKILL.md)
* [`orchestrator`](orchestrator/SKILL.md)

### Debugging

* [`diagnose-bug`](diagnose-bug/SKILL.md)

### Meta

* [`write-agent-skill`](write-agent-skill/SKILL.md)

## Evals

[`evals/`](evals) checks which skill loads for typical opening prompts. Each run is a real model call on your account (about $0.12 per case). To run it against the working tree:

```
npm run eval
npm run eval -- --case bug-issue   # one case
```

It bundles the public skills into a temporary plugin and runs `claude plugin eval` with cheap defaults:

- `--ablation none` skips the no-plugin baseline, which halves the runs.
- `--runs 1` instead of the default 3. Pass `--runs 3` to measure a trigger rate.
- `--max-cost-usd 3` stops the run at that cost.
- `--case 'control-*'` or `--case bug-issue` runs only the cases a change affects.
- `--model sonnet` costs about a third less than Opus. Skill choice differs by model, so confirm description changes with `-- --model opus`.
- Cases stop after `max_turns: 3`, and graders are free `tool_used` checks, not paid LLM judges.
- Run it by hand after changing a description, not in CI on every push.

## Inspiration

* [mattpocock/skills](https://github.com/mattpocock/skills)
* [poteto pstack](https://github.com/cursor/plugins/tree/main/pstack)
* [Obra superpowers](https://github.com/obra/superpowers)
* [humanlayer/skills](https://github.com/humanlayer/skills)

## License

MIT, see [LICENSE](LICENSE). Some skills adapt MIT-licensed material from the projects above.


