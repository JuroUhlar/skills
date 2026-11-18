#!/usr/bin/env python3
"""Condense Claude Code transcripts into readable per-session files, stats, and review batches.

Usage: condense.py OUT_DIR [--since YYYY-MM-DD] [--skills-dir DIR] [--batch-kb 450]

Writes OUT_DIR/sessions/*.md, OUT_DIR/stats.json, OUT_DIR/models.json (one row per main session
and sub-agent run: model, turns, tokens), and OUT_DIR/batches/*.txt (one file list per sub-agent).
Sessions in the skills repo itself go to batch "meta"; scheduled and headless temp-dir runs go to batch "automated".

The previous audit is the newest sibling of OUT_DIR with a stats.json and an earlier name. Without --since,
only sessions after it are read, and stats.json gets "change": the delta in skill loads and tool errors.
"""
import argparse, collections, glob, json, os, re

ap = argparse.ArgumentParser()
ap.add_argument("out")
ap.add_argument("--since")
ap.add_argument("--skills-dir", default=os.path.normpath(os.path.join(os.path.dirname(__file__), "../..")))
ap.add_argument("--batch-kb", type=int, default=450)
a = ap.parse_args()

out_parent, out_name = os.path.split(os.path.abspath(a.out))
prev = max((d for d in os.listdir(out_parent) if d < out_name and os.path.isfile(os.path.join(out_parent, d, "stats.json"))),
           default=None) if os.path.isdir(out_parent) else None
a.since = a.since or prev or "0000"

root = os.path.join(os.environ.get("CLAUDE_CONFIG_DIR", os.path.expanduser("~/.claude")), "projects")
skills = {d for d in os.listdir(a.skills_dir) if os.path.isfile(os.path.join(a.skills_dir, d, "SKILL.md"))}
os.makedirs(f"{a.out}/sessions", exist_ok=True)
os.makedirs(f"{a.out}/batches", exist_ok=True)

def short(s, n):
    s = s if isinstance(s, str) else json.dumps(s)
    return s if len(s) <= n else s[:n] + f" …[+{len(s) - n}]"

def text_of(content):
    if isinstance(content, str):
        return content
    return " ".join(x.get("text", "") for x in content or [] if isinstance(x, dict) and x.get("type") == "text")

# First match wins. Order matters: a gh 403 inside "Exit code 1" output is "external", not "exit".
ERR_CLASSES = [
    ("denied", r"doesn't want to proceed|tool use was rejected"),
    ("hook", r"hook error"),
    ("harness", r"<tool_use_error>"),
    ("external", r"(HTTP|status|code|failed)\W{0,4}(401|403|404|429|5\d\d)\b|Forbidden|Unauthorized|timed out|not installed|"
                 r"current credentials|not authenticated|sign in|insufficient scope|ECONN\w+|ENOTFOUND|rate limit"),
    ("exit", r"^Exit code \d+"),
]

def err_class(body):
    # Only the head: long command output quotes "403" or "timed out" without failing for that reason.
    return next((c for c, rx in ERR_CLASSES if re.search(rx, body[:300], re.I)), "other")

SHELL_WORDS = {"cd", "export", "sudo", "time", "set", "umask", "source", "for", "while", "if", "then", "else", "do", "done", "fi", "[", "[[", "{", "(", "!"}

def tool_key(name, inp):
    """Group calls by MCP server, by program for Bash, else by tool name."""
    if name.startswith("mcp__"):
        return "mcp:" + name.split("__")[1]
    if name == "Bash":
        for seg in re.split(r"&&|\|\||;|\|", inp.get("command", "")):
            words = [w for w in seg.split() if "=" not in w]
            if words and words[0] not in SHELL_WORDS:
                return "Bash:" + os.path.basename(words[0])
    return name

def skill_name(s):
    return s.split(":")[-1]

def usage(path):
    """Assistant turns per model and total tokens (fresh, cached, and output) in one transcript."""
    models, tokens, seen = collections.Counter(), 0, set()
    for raw in open(path, errors="ignore"):
        try:
            o = json.loads(raw)
        except ValueError:
            continue
        m = o.get("message") or {}
        if o.get("type") != "assistant" or m.get("id") in seen or m.get("model", "<synthetic>") == "<synthetic>":
            continue
        seen.add(m.get("id"))
        u = m.get("usage") or {}
        models[m["model"]] += 1
        tokens += sum(u.get(k) or 0 for k in ("input_tokens", "cache_creation_input_tokens", "cache_read_input_tokens", "output_tokens"))
    return models, tokens

loads = collections.defaultdict(lambda: {"model": 0, "user": 0, "sessions": set()})
hooks, mcp, rows, runs = collections.Counter(), collections.Counter(), [], []
tools = collections.defaultdict(lambda: {"calls": 0, "sessions": set(), "classes": collections.Counter(), "loops": 0, "sample": ""})

for f in sorted(glob.glob(f"{root}/*/*.jsonl")):
    sid = os.path.basename(f)[:-6]
    lines, title, cost, start, cwd, last_user = [], "", None, None, "", ""
    n_user = n_interrupt = 0
    s_loads, s_hooks, s_mcp = [], collections.Counter(), collections.Counter()
    s_tool_ids, s_calls, s_errs, s_loops = {}, collections.Counter(), [], collections.Counter()
    streak = None  # [signature, line index, count] of the current run of identical failures
    automated = os.path.basename(os.path.dirname(f)).startswith("-private-tmp")
    for raw in open(f, errors="ignore"):
        try:
            o = json.loads(raw)
        except ValueError:
            continue
        t = o.get("type")
        if t == "ai-title":
            title = o.get("aiTitle", "")
        elif t == "cost-state":
            cost = o.get("totalCostUSD")
        elif t == "attachment" and "hook" in (o.get("attachment") or {}).get("type", ""):
            att = o["attachment"]
            cmd = str(att.get("command") or "").replace('"', "").split()
            s_hooks[f'{att.get("hookName") or att.get("hookEvent")} {os.path.basename(cmd[0]) if cmd else ""}'.strip()] += 1
        if t in ("user", "assistant") and not start:
            start, cwd = o.get("timestamp", "")[:16], o.get("cwd", "")
        if t == "user" and not o.get("isMeta"):
            content = o["message"].get("content")
            for it in content if isinstance(content, list) else [{"type": "text", "text": content}]:
                if it.get("type") == "tool_result":
                    body = text_of(it.get("content")) if not isinstance(it.get("content"), str) else it["content"]
                    if not it.get("is_error"):
                        streak = None
                        continue
                    (key, tool), cls = s_tool_ids.get(it.get("tool_use_id"), ("?", "?")), err_class(body)
                    s_errs.append((key, tool, cls, body))
                    line, sig = f"  TOOL_ERR {key} [{cls}]: " + short(body, 300), (key, body[:120])
                    if streak and streak[0] == sig:
                        streak[2] += 1
                        lines[streak[1]] = f"{line} (repeated {streak[2]} times)"
                        s_loops[key] += streak[2] == 2
                    else:
                        streak = [sig, len(lines), 1]
                        lines.append(line)
                    continue
                tx = it.get("text") or ""
                if tx.startswith(("<system-reminder>", "<local-command")) or "Base directory for this skill" in tx:
                    continue
                if "<scheduled-task" in tx[:300]:
                    automated = True
                if "Request interrupted" in tx:
                    n_interrupt += 1
                    lines.append("USER: [INTERRUPTED]")
                    continue
                n_user += 1
                last_user = tx
                cmd = re.search(r"<command-name>/([^<]+)</command-name>", tx)
                if cmd and skill_name(cmd.group(1)) in skills:
                    s_loads.append((skill_name(cmd.group(1)), "user"))
                lines.append("USER: " + short(re.sub(r"<command-(message|name)>[^<]*</command-\1>\s*", "", tx), 3000))
        elif t == "assistant":
            for it in o["message"].get("content", []):
                if it.get("type") == "text" and it["text"].strip():
                    lines.append("ASSISTANT: " + short(it["text"], 900))
                elif it.get("type") == "tool_use":
                    name, inp = it["name"], it.get("input", {})
                    key = tool_key(name, inp)
                    s_tool_ids[it.get("id")] = (key, name)
                    s_calls[key] += 1
                    if name == "Skill":
                        sk = skill_name(inp.get("skill", ""))
                        if sk in skills:
                            # Typed by the user if their last message named it; else the model chose it.
                            by = "user" if re.search(rf"(/|\b){re.escape(sk)}\b", last_user) else "model"
                            s_loads.append((sk, by))
                        lines.append(f"  >> SKILL {inp.get('skill')}")
                    elif name in ("Agent", "Task"):
                        lines.append(f"  >> AGENT {short(inp.get('description', ''), 80)} :: {short(inp.get('prompt', ''), 300)}")
                    elif name == "Bash":
                        lines.append("  >> Bash: " + short(inp.get("command", ""), 160))
                    elif name in ("Edit", "Write", "Read"):
                        lines.append(f"  >> {name} {inp.get('file_path', '')}")
                    else:
                        if name.startswith("mcp__"):
                            s_mcp[name.split("__")[1]] += 1
                        lines.append(f"  >> {name} {short(inp, 120)}")
    if n_user == 0 or (start or "") < a.since:
        continue
    for sk, by in s_loads:
        loads[sk][by] += 1
        loads[sk]["sessions"].add(sid)
    hooks.update(s_hooks)
    mcp.update(s_mcp)
    for key, n in s_calls.items():
        tools[key]["calls"] += n
    for key, n in s_loops.items():
        tools[key]["loops"] += n
    for key, tool, cls, body in s_errs:
        t = tools[key]
        t["classes"][cls] += 1
        if cls != "exit":  # Mostly harmless (grep with no match); counted, but no sample and no session.
            t["sessions"].add(sid)
            t["sample"] = t["sample"] or f"{tool}: {short(body, 200)}"
    project = os.path.basename(os.path.dirname(f))
    models, tokens = usage(f)
    model = models.most_common(1)[0][0] if models else "?"
    runs.append({"session": sid, "kind": "main", "model": model, "turns": sum(models.values()), "tokens": tokens, "job": title})
    for sub in sorted(glob.glob(f"{f[:-6]}/subagents/*.jsonl")):
        meta_path = sub[:-6] + ".meta.json"
        meta = json.load(open(meta_path)) if os.path.exists(meta_path) else {}
        s_models, s_tokens = usage(sub)
        if not s_models:
            continue
        run = {"session": sid, "kind": meta.get("agentType", "subagent"), "model": s_models.most_common(1)[0][0],
               "turns": sum(s_models.values()), "tokens": s_tokens, "job": meta.get("description", "")}
        runs.append(run)
        lines.append(f"  SUBAGENT {run['kind']} on {run['model']}, {run['turns']} turns, {s_tokens / 1e6:.1f}M tokens: {run['job']}")
    in_skills_repo = os.path.realpath(cwd or "/nonexistent") == os.path.realpath(a.skills_dir)
    name = f"{start[:10]}_{project[-40:]}_{sid[:8]}.md"
    header = f"# {project} | {sid} | {start} | title={title} | model={model} | turns={sum(models.values())} | cost=${cost and round(cost, 2)} | user_msgs={n_user} | interrupts={n_interrupt}\n\n"
    path = f"{a.out}/sessions/{name}"
    open(path, "w").write(header + "\n".join(lines) + "\n")
    group = "automated" if automated else "meta" if in_skills_repo else "work"
    rows.append({"file": path, "bytes": os.path.getsize(path), "group": group, "cost": cost or 0, "date": start[:10]})

batches, size = collections.defaultdict(list), 0
for r in sorted(rows, key=lambda r: r["date"]):
    if r["group"] != "work":
        batches[r["group"]].append(r["file"])
        continue
    n = sum(1 for k in batches if k.startswith("batch"))
    if n == 0 or size + r["bytes"] > a.batch_kb * 1024:
        n, size = n + 1, 0
    batches[f"batch{n}"].append(r["file"])
    size += r["bytes"]
for k, files in batches.items():
    open(f"{a.out}/batches/{k}.txt", "w").write("\n".join(files) + "\n")

json.dump(runs, open(f"{a.out}/models.json", "w"), indent=1)
by_model = collections.defaultdict(lambda: {"runs": 0, "turns": 0, "tokens": 0})
for r in runs:
    agg = by_model[f'{"main" if r["kind"] == "main" else "subagent " + r["kind"]} | {r["model"]}']
    agg["runs"] += 1
    agg["turns"] += r["turns"]
    agg["tokens"] += r["tokens"]

stats = {
    "since": a.since,
    "sessions": collections.Counter(r["group"] for r in rows),
    "cost_usd": round(sum(r["cost"] for r in rows), 2),
    "skill_loads": {k: {"model": v["model"], "user": v["user"], "sessions": len(v["sessions"])}
                    for k, v in sorted(loads.items(), key=lambda kv: -len(kv[1]["sessions"]))},
    "never_loaded": sorted(skills - set(loads)),
    "hook_firings": dict(hooks.most_common()),
    "mcp_calls": dict(mcp.most_common()),
    "tool_errors": {k: {"calls": v["calls"], "sessions": len(v["sessions"]), "loops": v["loops"],
                        "classes": dict(v["classes"].most_common()), "sample": v["sample"]}
                    for k, v in sorted(tools.items(), key=lambda kv: (-kv[1]["classes"]["external"] - kv[1]["classes"]["harness"],
                                                                       -kv[1]["loops"], -sum(kv[1]["classes"].values())))
                    if v["sample"]},
    "models": dict(sorted(by_model.items(), key=lambda kv: -kv[1]["tokens"])),
    "batches": {k: len(v) for k, v in sorted(batches.items())},
}
def failures(errs):
    return {k: sum(n for c, n in v.get("classes", {}).items() if c != "exit") or v.get("errors", 0) for k, v in errs.items()}

if prev:
    old = json.load(open(os.path.join(out_parent, prev, "stats.json")))
    old_loads, new_loads = old.get("skill_loads", {}), stats["skill_loads"]
    old_errs, new_errs = failures(old.get("tool_errors", {})), failures(stats["tool_errors"])
    stats["change"] = {
        "previous": prev,
        "model_loads": {k: new_loads.get(k, {}).get("model", 0) - old_loads.get(k, {}).get("model", 0)
                        for k in sorted(set(old_loads) | set(new_loads))},
        "tool_failures": {k: new_errs.get(k, 0) - old_errs.get(k, 0) for k in sorted(set(old_errs) | set(new_errs))},
    }
    for field in ("model_loads", "tool_failures"):
        stats["change"][field] = {k: v for k, v in stats["change"][field].items() if v}
json.dump(stats, open(f"{a.out}/stats.json", "w"), indent=1)
print(json.dumps(stats, indent=1))
