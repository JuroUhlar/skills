---
name: explain-diff
description: Use when the user invokes explain-diff or asks for a rich, interactive explanation of a code change, diff, branch, or PR.
disable-model-invocation: true
metadata:
  inspiration: https://gist.github.com/geoffreylitt/a29df1b5f9865506e8952488eac3d524
---

# Explain diff

Write a rich, interactive explanation of the specified code change as one self-contained HTML page.

## Sections

One long page with section headers and a table of contents. No tabs for the top-level structure.

1. Background: the existing system the change touches. Explore the surrounding code broadly first.
   - Start with a deep background for beginners, marked as skippable for readers who know the system.
   - Then a narrow background directly relevant to the change.
2. Intuition: the essence of the change, not the full details. Use concrete examples with toy data, and diagrams liberally.
3. Code: a high-level walkthrough of the changes, grouped and ordered so they're easy to follow, not in diff order.
4. Quiz: five multiple-choice questions.
   - Medium difficulty: answering needs real understanding of the change, but no gotchas.
   - Clicking an answer says whether it's correct and explains why.

## Writing

- Write with the clarity and flow of Martin Kleppmann, in classic style. Make transitions between sections smooth.
- Use callouts for key concepts, definitions, and important edge cases.

## Diagrams

- Pick a few diagram families and reuse them throughout to explain different cases. Useful families:
  - A simplified mock of the UI the user sees, for UI changes.
  - A system diagram of data flow or communication between components, with example data on it.
- Build diagrams from simple HTML and CSS, and lists as HTML lists. Never ASCII diagrams.

## Format

- One HTML file with inline CSS and JavaScript, readable on a phone.
- Save it outside the repo, with a filename starting with today's date so files sort by time and stay out of version control. For example `/tmp/2026-01-12-explanation-<slug>.html`.
- Code blocks use `<pre>`. A custom styled element needs `white-space: pre-wrap`, or the browser collapses every newline. Before saving, check each code block's CSS for `white-space: pre` or `pre-wrap`.
- Open the file for the user and give them its path.
