#!/usr/bin/env python3
"""Parse Codex --json JSONL output and extract the last assistant message as JSON."""

import json
import sys


def main():
    if len(sys.argv) < 2:
        print("Usage: specflow-parse-jsonl.py <jsonl-file>", file=sys.stderr)
        sys.exit(1)

    jsonl_path = sys.argv[1]

    last_assistant_text = None

    with open(jsonl_path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                entry = json.loads(line)
            except json.JSONDecodeError:
                continue

            # Codex JSONL: look for assistant messages
            role = entry.get("role") or entry.get("type")
            if role in ("assistant", "message"):
                # Extract text content
                content = entry.get("content") or entry.get("text") or ""
                if isinstance(content, list):
                    # content can be a list of blocks
                    parts = []
                    for block in content:
                        if isinstance(block, dict):
                            parts.append(block.get("text", ""))
                        elif isinstance(block, str):
                            parts.append(block)
                    content = "\n".join(parts)
                if content:
                    last_assistant_text = content

    if last_assistant_text is None:
        print("{}", file=sys.stdout)
        sys.exit(0)

    # Try to parse as JSON (Codex review output should be JSON)
    try:
        parsed = json.loads(last_assistant_text)
        print(json.dumps(parsed, indent=2, ensure_ascii=False))
    except json.JSONDecodeError:
        # Extract JSON block from markdown if present
        import re
        m = re.search(r"```(?:json)?\s*\n(.*?)\n```", last_assistant_text, re.DOTALL)
        if m:
            try:
                parsed = json.loads(m.group(1))
                print(json.dumps(parsed, indent=2, ensure_ascii=False))
                return
            except json.JSONDecodeError:
                pass
        # Fall back to raw text
        print(json.dumps({"raw": last_assistant_text}, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
