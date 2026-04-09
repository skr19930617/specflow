---
description: 実装を破棄し、全変更をリセットする
---
## User Input


```text
$ARGUMENTS
```

## Reject Implementation


全変更を破棄します。

1. 現在の変更状態を確認:
   ```bash
   git status --short
   ```

2. 変更ファイル一覧をユーザーに表示する。

3. 全変更を破棄:
   ```bash
   git checkout -- .
   git clean -fd -- . ':(exclude)openspec'
   ```

   これにより:
   - 変更されたファイルは元に戻る (`git checkout`)
   - 新規作成されたファイルは削除される (`git clean`)
   - `openspec/` 配下の新規ファイルは保持される

4. 破棄後の状態を確認:
   ```bash
   git status --short
   ```

Report: "Implementation rejected. All changes have been discarded." → **END**.
