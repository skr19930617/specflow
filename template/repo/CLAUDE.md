# Project Guidelines

## specflow Integration

This project uses [specflow](https://github.com/YOUR_USER/spec-scripts) for issue-driven development.

### Spec Kit Slash Commands

<!-- specflow の step 6 で Claude が呼ぶコマンド。Spec Kit を使っている場合はそのまま。使っていなければこのセクションを削除 -->

- `/speckit.plan` — spec から実装計画を生成
- `/speckit.tasks` — 計画からタスクリストを生成

### Workflow Rules

- spec は `.specflow/state/<timestamp>/spec.md` に保存される
- 実装時は spec の acceptance criteria をすべて満たすこと
- `.specflow/` 配下のファイルは実装 diff に含めないこと
- レビュー指摘への対応時、spec の意図を変えないこと

## Tech Stack

<!-- プロジェクトの技術スタックを記載 -->
<!-- 例: TypeScript 5.x, React 19, Node.js 22 LTS -->

## Commands

<!-- ビルド・テスト・リントのコマンドを記載 -->
<!-- 例: npm test && npm run lint -->

## Code Style

<!-- プロジェクト固有のコーディング規約があれば記載 -->

## MANUAL ADDITIONS

<!-- プロジェクト固有のルールをここに追記 -->
