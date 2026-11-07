# 箱庭RTS（仮）

ブラウザで遊ぶ、一人用の島開発ストラテジー。ターンは数秒ごとに自動で進み、プレイヤーを待たない。
仕様は [docs/SPEC.md](docs/SPEC.md) を参照。

## 現在の状態（M1）

自分の島だけで遊べる最小の版。

- 20×20マスの島を自動で生成する
- マスを選んで命令を予約する（最大40件）。1ターンに1命令を実行する
- 資金・食料・人口の経済（農場・工場・住宅地の成長、食料不足）
- ターンの間隔は3・5・10・20秒から選べる（タブが裏に回ると止まる）
- 毎ターン自動セーブ（ブラウザの IndexedDB）。セーブデータの書き出しと読み込み

AI の島・電力・石油・技術・災害・怪獣は、まだ入っていない（M2 以降）。

## 遊ぶ

GitHub Pages で公開している：https://moheronemy.github.io/hakoniwa-rts/

デフォルトブランチにプッシュすると、GitHub Actions（`.github/workflows/deploy-pages.yml`）がテストとビルドを行い、自動で公開する。
初回だけ、リポジトリの Settings → Pages で「Source」を「GitHub Actions」にしておく必要がある。

## 動かし方

```sh
npm install
npm run dev      # 開発サーバー（http://localhost:5173/）
npm test         # ゲームの中身のテスト
npm run build    # 型チェックと本番用ビルド
```

## 構成

- `src/engine/` … ゲームの中身。React に依存しない純粋な TypeScript。
  `advanceTurn(state)` が1ターン分を処理して新しい state を返す。乱数はシード付きで、同じ入力から同じ結果になる。
- `src/ui/` … React の画面。タイマーで一定間隔ごとに `advanceTurn` を呼ぶ。マップは Canvas に仮のドット絵で描く。
- `docs/` … 仕様書と調査メモ。
