---
name: write-well
description: Always appy. Use whenever writing or editing prose, docs, comments, commit messages, PR descriptions, or composing chat responses.
metadata:
  inspiration:
    - https://github.com/cursor/plugins/tree/main/pstack/skills/unslop
---

# Write well

## Preferences

* Maximize clarity, brevity, semantic density. Get brevity by cutting content, not by dropping articles or verbs (see [Over-compression](#over-compression)).
* No walls of text, turn long paragraphs into lists or other structured text.
* When referencing something that can be a clickable link (PR, issue, user, document, repo), make it a clickable link.
* Link to the section, not just the document (`doc.md#anchor`).

## Unslop process

1. Scan for the patterns below.
2. Rewrite. Preserve meaning, match intended tone.
3. Self-audit: "What makes this obviously AI generated?" Fix remaining tells.

## Content

- **Superficial -ing phrases.** "highlighting...", "ensuring...", "showcasing...". Delete, or say what actually happens.
- **Vague attributions.** "Experts believe", "some argue". Name the source or delete.

## Language

- **Plain words.** Drop AI vocabulary: additionally, crucial, delve, enduring, enhance, garner, interplay, intricate, landscape (abstract), pivotal, tapestry, testament, underscore, vibrant. "utilize"/"leverage" become "use", "facilitate" becomes "help", "in the event that" becomes "if".
- **Fancy ways to say "is".** "serves as", "stands as", "boasts", "features". Say "is" or "has".
- **"Not just X, but Y."** State the point directly.
- **Rule of three.** Use the natural number of items, not three by habit.
- **Synonym cycling.** Pick one name for a thing and repeat it.
- **False ranges.** "from X to Y" where X and Y aren't on a scale. List the topics.

## Style

- **Em dashes.** Avoid entirely. Use periods or commas (no parentheses, en dashes, or hyphen-as-dash substitutes).
- **Boldface overuse.** Don't bold every proper noun or acronym.
- **Inline-header lists.** A bold label and colon that restates the line ("**Performance:** Performance improved...") becomes prose. A bold lead-in followed by new detail is fine.
- **Title case headings.** Use sentence case.
- **Decorative emojis.** Remove from headings and bullets.
- **Curly quotes.** Use straight quotes.

### Colon overuse

Colons are fine before a list or example, not as mid-sentence connectors.
- BAD: "If you're coming from traditional automation: instead of registering event handlers, you describe conditions."
- GOOD: "Describing when the scheduler should fire works best as plain English."

## Chat and filler

- **Chatbot phrases.** "I hope this helps!", "Let me know if...", "Certainly!", "Found the smoking gun!" Remove.
- **Sycophancy.** "Great question! You're absolutely right!" Respond directly.
- **Filler phrases.** "In order to" becomes "to", "due to the fact that" becomes "because", "it is important to note that" gets deleted.
- **Excessive hedging.** "could potentially possibly be argued that it might" becomes "may".
- **Generic conclusions.** "The future looks bright." State specific plans or facts.

## Plain speech

- **Dense sentences.** If the reader has to backtrack, split it or drop clauses. One idea per sentence.
- **Passive voice.** Name the actor: "queries are validated" becomes "the compiler validates queries". Passive is fine only when the actor is unknown or doesn't matter.
- **Adverbs.** "runs quickly" becomes "is fast" or the number; "significantly improves" becomes the measured delta.

### Say what it does, not how it feels

"SQL you can read", "types that follow your schema" name a feeling. Name the mechanism or a number instead: "`.toSQL()` returns the exact string sent to the database", "a column rename fails the build".
- Ask what the sentence tells the reader to do or know, then write that. If you can't restate it as a concrete instruction, fact, or number, cut it.
- If the sentence could appear unchanged in another project's docs, it says nothing about this one. Cut it.

### Literal over figurative

- Metaphor nouns: substrate, wedge, vector, locus, nexus, primitive (as noun), harness (as metaphor), surface (as in "API surface"), bedrock, scaffolding (as metaphor), paradigm, gold-plating, ratchet (as metaphor), evacuate (for moving code), endgame, north star, flywheel. "Wedge in" becomes "add"; "gold-plating" becomes "more than the job needs"; "ratchet" becomes "a limit that only tightens".
- Mannered prose: aphorisms ("wire it or delete it"), rhetorical fragments, personified code ("the plan holds it"), figurative verbs ("rides along", "stands on"). "A dial worth turning" becomes "a parameter worth varying".

### Over-compression

Dropped articles, verbless fragments, symbol-speak, and abbreviations make the reader decode instead of read. "Parser rejects bad date → exit 2, no write" becomes "The parser rejects a bad date, exits with code 2, and writes nothing." Write whole sentences, and spell out arrows and abbreviations.
