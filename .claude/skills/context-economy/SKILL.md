---
name: context-economy
description: Maximise output quality per token in a large monorepo — narrow investigation, delegation of open-ended searches to subagents, diff-sized edits, batched tool calls, and cut narration. Use on any multi-file or exploratory task.
---

# Context Economy

Maximize output quality per token spent. Context is a budget, not a scratchpad. This
matters more here than usual: AeroQuant is a monorepo spanning eight apps, four packages,
Airflow DAGs, Terraform and a React terminal.

Investigate narrowly:
- grep/glob for the specific symbol or pattern before reading any file
- read only the line range needed, not whole files, when the file is large
- never re-read a file already in context; trust the last edit succeeded
- stop investigating the moment the question is answered — no speculative reads
- `PROJECT_CONTEXT.md` answers most "how do we do X here" questions; read it instead of
  inferring conventions from five files

Delegate to protect the main context:
- push open-ended or multi-file exploration to a subagent and take back only its conclusion
- push large log/output inspection (Airflow task logs, k6 output, coverage reports) to a
  subagent or a filtered command, not a raw dump into context
- route domain work to the specialist agent — `quant-statistician` for index math,
  `data-engineer` for pipelines, `mcp-engineer` for tools — rather than re-deriving the
  domain rules inline

Act, don't restate:
- prefer Edit (diff-sized) over Write (full-file) for existing files
- never paste unchanged code back to the user; reference `file:line` instead
- don't re-derive facts already established earlier in the session

Batch and cut narration:
- fire independent tool calls in parallel in one turn, not sequential round-trips
- skip step-by-step narration of intent; state findings and decisions, not process
- no summaries, comments, or docs beyond what was asked for

Prefer the smallest correct answer over the most thorough-looking one. Depth is earned by
the question, not added by default.
