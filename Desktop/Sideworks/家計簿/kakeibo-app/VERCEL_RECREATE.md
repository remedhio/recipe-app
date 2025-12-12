# Vercelプロジェクト再作成手順

設定が正しいのに`package.json`が見つからないエラーが出る場合、プロジェクトを再作成することをお勧めします。

## 方法1: Vercelダッシュボードで再作成（推奨）

### ステップ1: 現在のプロジェクトを削除

1. Vercelダッシュボードにアクセス
2. `kakeibo-app` プロジェクトを選択
3. **Settings** → **General** → ページ最下部
4. **Delete Project** をクリック
5. 確認して削除

### ステップ2: 新しいプロジェクトを作成

1. Vercelダッシュボードで **New Project** をクリック
2. GitHubリポジトリ `kakeibo-app` を選択
3. **Import** をクリック

### ステップ3: プロジェクト設定

以下の設定を**必ず**行ってください：

#### Framework Preset
- **Other** を選択

#### Root Directory
- **空欄のまま**（何も設定しない）

#### Build and Output Settings

**Build Command**:
```
npm install && npm run build
```
- **Override** トグルを **ON** にする

**Output Directory**:
```
dist
```
- **Override** トグルを **ON** にする

**Install Command**:
- **Override** トグルを **OFF** のまま（デフォルト）

### ステップ4: 環境変数を設定

**Environment Variables** セクションで以下を追加：

1. `EXPO_PUBLIC_SUPABASE_URL`
   - Value: あなたのSupabase URL
   - Environment: Production, Preview, Development すべてにチェック

2. `EXPO_PUBLIC_SUPABASE_ANON_KEY`
   - Value: あなたのSupabase Anon Key
   - Environment: Production, Preview, Development すべてにチェック

### ステップ5: デプロイ

1. **Deploy** をクリック
2. ビルドログを確認

## 方法2: Vercel CLIでデプロイ（代替案）

もしダッシュボードでの再作成がうまくいかない場合：

```bash
# Vercel CLIをインストール（まだの場合）
npm install -g vercel

# プロジェクトディレクトリで実行
cd /Users/kazuma/Desktop/Sideworks/家計簿/kakeibo-app
vercel

# 初回は設定を聞かれるので、以下を選択：
# - Set up and deploy? Yes
# - Which scope? あなたのアカウント
# - Link to existing project? No
# - Project name? kakeibo-app
# - Directory? ./
# - Override settings? No

# 環境変数を設定
vercel env add EXPO_PUBLIC_SUPABASE_URL
vercel env add EXPO_PUBLIC_SUPABASE_ANON_KEY

# 本番環境にデプロイ
vercel --prod
```

## 確認ポイント

再作成後、ビルドログで以下を確認：

✅ 正常なビルドログ:
```
Installing dependencies...
Exporting for web...
✓ Export complete
Build time: 2-5 minutes
```

❌ 問題がある場合:
```
npm error enoent Could not read package.json
```
（この場合は、Root Directoryが空欄になっているか再確認）
