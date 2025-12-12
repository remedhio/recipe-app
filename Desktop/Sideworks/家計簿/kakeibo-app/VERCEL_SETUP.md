# Vercelデプロイ設定ガイド

## 問題: ビルドコマンドが実行されない

ビルドログが53msと短い場合、Vercelがビルドコマンドを実行していない可能性があります。

## 解決方法

### 方法1: Vercelダッシュボードで設定を確認・修正

1. Vercelダッシュボードにログイン
2. プロジェクトを選択
3. **Settings** → **General** に移動
4. 以下の設定を確認・変更：

   - **Framework Preset**: `Other` を選択
   - **Build Command**: `npm install && npx expo export --platform web` を設定
   - **Output Directory**: `dist` を設定
   - **Install Command**: （空欄のまま、または `npm install`）

5. **Save** をクリック
6. 新しいデプロイをトリガー（GitHubにプッシュするか、Vercelダッシュボードで「Redeploy」をクリック）

### 方法2: vercel.jsonの設定を確認

`vercel.json` が正しく配置されているか確認してください。プロジェクトのルートディレクトリに配置されている必要があります。

### 方法3: 環境変数の確認

Vercelダッシュボードで環境変数が正しく設定されているか確認：

- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`

これらの変数は、**Production**、**Preview**、**Development** すべての環境に設定されていることを確認してください。

## 正しいビルドログの例

正常にビルドが実行されると、以下のようなログが表示されます：

```
Running "npm install && npx expo export --platform web"
...
Installing dependencies...
...
Exporting for web...
...
Build completed successfully
```

ビルド時間は通常、数分かかります（53msは異常に短いです）。

## トラブルシューティング

### ビルドが失敗する場合

1. ビルドログを確認してエラーメッセージを確認
2. 環境変数が正しく設定されているか確認
3. `package.json` の依存関係が正しいか確認

### 404エラーが続く場合

1. ビルドが正常に完了しているか確認（`dist` ディレクトリにファイルが生成されているか）
2. `vercel.json` の `rewrites` 設定が正しいか確認
3. SupabaseのリダイレクトURLが正しく設定されているか確認
