#!/usr/bin/env python3
"""Condense Claude Code transcripts into readable per-session files, stats, and review batches.

Usage: condense.py OUT_DIR [--since YYYY-MM-DD] [--skills-dir DIR] [--batch-kb 450]

Writes OUT_DIR/sessions/*.md, OUT_DIR/stats.json, and OUT_DIR/batches/*.txt (one file list per
sub-agent). Sessions in the skills repo itself go to batch "meta"; scheduled and headless
temp-dir runs go to batch "automated".
"""
import argparse, collections, glob, json, os, re

ap = argparse.ArgumentParser()
ap.add_argument("out")
ap.add_argument("--since", default="0000")
ap.add_argument("--skills-dir", default=os.path.normpath(os.path.join(os.path.dirname(__file__), "../..")))
ap.add_argument("--batch-kb", type=int, default=450)
a = ap.parse_args()

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

def skill_name(s):
    return s.split(":")[-1]

loads = collections.defaultdict(lambda: {"model": 0, "user": 0, "sessions": set()})
hooks, mcp, rows = collections.Counter(), collections.Counter(), []

for f in sorted(glob.glob(f"{root}/*/*.jsonl")):
    sid = os.path.basename(f)[:-6]
    lines, title, cost, start, cwd, last_user = [], "", None, None, "", ""
    n_user = n_interrupt = 0
    s_loads, s_hooks, s_mcp = [], collections.Counter(), collections.Counter()
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
                    if it.get("is_error"):
                        lines.append("  TOOL_ERR: " + short(body, 300))
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
    project = os.path.basename(os.path.dirname(f))
    in_skills_repo = os.path.realpath(cwd or "/nonexistent") == os.path.realpath(a.skills_dir)
    name = f"{start[:10]}_{project[-40:]}_{sid[:8]}.md"
    header = f"# {project} | {sid} | {start} | title={title} | cost=${cost and round(cost, 2)} | user_msgs={n_user} | interrupts={n_interrupt}\n\n"
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

stats = {
    "since": a.since,
    "sessions": collections.Counter(r["group"] for r in rows),
    "cost_usd": round(sum(r["cost"] for r in rows), 2),
    "skill_loads": {k: {"model": v["model"], "user": v["user"], "sessions": len(v["sessions"])}
                    for k, v in sorted(loads.items(), key=lambda kv: -len(kv[1]["sessions"]))},
    "never_loaded": sorted(skills - set(loads)),
    "hook_firings": dict(hooks.most_common()),
    "mcp_calls": dict(mcp.most_common()),
    "batches": {k: len(v) for k, v in sorted(batches.items())},
}
json.dump(stats, open(f"{a.out}/stats.json", "w"), indent=1)
print(json.dumps(stats, indent=1))
