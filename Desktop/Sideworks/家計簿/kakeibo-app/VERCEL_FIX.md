# Vercel 404エラー解決手順

## 問題
- ビルドログが50msと短い（ビルドコマンドが実行されていない）
- 404エラーが表示される

## 解決方法：Vercelダッシュボードで直接設定

`vercel.json`が無視されている可能性があるため、Vercelダッシュボードで直接設定します。

### ステップ1: Vercelダッシュボードにアクセス

1. https://vercel.com/dashboard にログイン
2. `kakeibo-app` プロジェクトを選択

### ステップ2: プロジェクト設定を開く

1. **Settings** タブをクリック
2. **General** セクションに移動

### ステップ3: ビルド設定を変更

以下の設定を**必ず**変更してください：

#### Framework Preset
- **Other** を選択（既に設定済みならそのまま）

#### Build and Output Settings

**Build Command**:
```
npm run build
```

**Output Directory**:
```
dist
```

**Install Command**:
（空欄のまま、または削除）

### ステップ4: 保存と再デプロイ

1. ページ下部の **Save** をクリック
2. **Deployments** タブに移動
3. 最新のデプロイの右側の「...」メニューをクリック
4. **Redeploy** を選択
5. **Use existing Build Cache** のチェックを**外す**
6. **Redeploy** をクリック

### ステップ5: ビルドログを確認

再デプロイ後、ビルドログで以下を確認：

✅ **正常なビルドログ**:
```
Running "npm run build"
Installing dependencies...
Exporting for web...
✓ Export complete
Build time: 2-5 minutes
```

❌ **問題がある場合**:
```
Build Completed in /vercel/output [50ms]
```
（この場合は、設定が反映されていません）

## 代替案：vercel.jsonを削除

もし上記の方法でも解決しない場合：

1. `vercel.json`を一時的に削除またはリネーム
2. Vercelダッシュボードで上記の設定を行う
3. 再デプロイ

## 確認事項

- [ ] Framework Presetが「Other」になっている
- [ ] Build Commandが「npm run build」になっている
- [ ] Output Directoryが「dist」になっている
- [ ] 環境変数（EXPO_PUBLIC_SUPABASE_URL、EXPO_PUBLIC_SUPABASE_ANON_KEY）が設定されている
- [ ] 再デプロイ時に「Use existing Build Cache」のチェックを外した
