# Legacy Archive

The final in-tree Bash implementation was retired from `main` and archived at git tag `legacy-v1-final`.

Use the tag when you need the historical snapshot:

```bash
git show legacy-v1-final:legacy/v1/bin/specflow-run
git show legacy-v1-final:legacy/v1/src
```

The archive contains the last `legacy/v1/` tree, including legacy CLI entrypoints, templates, prompts, and tests. Active build, runtime, and CI paths on `main` do not execute archived scripts or read archived assets.
