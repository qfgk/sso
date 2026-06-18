# Cloudflare Workers OpenAI OIDC SSO

這是一個部署於 Cloudflare Workers 的 Custom OIDC SSO Provider，用於對接 OpenAI SSO。使用者登入時只輸入帳號；註冊新帳號時需要輸入邀請碼。系統會把帳號固定轉成 `ACCOUNT_DOMAIN` 指定的信箱域名。已建立帳號之後仍可登入，不會再消耗邀請碼。

## 功能

- OIDC discovery：`/.well-known/openid-configuration`
- JWKS：`/jwks.json`
- 授權端點：`/authorize`
- 登入端點：`/login`
- 註冊頁與註冊端點：`/register`
- Token 端點：`/token`
- UserInfo 端點：`/userinfo`
- 邀請碼管理：`/admin/invite-codes`
- Cloudflare Turnstile 人機驗證
- Cloudflare D1 儲存使用者、邀請碼與授權碼

## 部署方式

推薦使用 **Cloudflare Dashboard 網頁版 + GitHub 自動部署**。本倉庫已避免把正式環境變數、D1 database id、OIDC secret、私鑰 JWK 寫進公開程式碼。

公開倉庫中的 `wrangler.toml` 只保留安全設定：

- `keep_vars = true`：避免 Wrangler 部署時覆蓋 Dashboard 裡的 Text Variables。
- 不包含 `[vars]`：避免公開倉庫保存正式環境變數。
- 不包含真實 `[[d1_databases]]`：避免公開 D1 database id。

自動部署時請使用 `npm run deploy`。這個命令會從 Cloudflare Build variable `D1_DATABASE_ID` 生成臨時 `wrangler.deploy.toml`，再執行 Wrangler deploy。臨時檔只存在於構建環境，不會提交到 GitHub。

整體流程如下：

1. 在 Cloudflare 網頁建立 D1 database。
2. 在 D1 Console 貼上 [schema.sql](schema.sql) 初始化資料表。
3. 在 Cloudflare Workers & Pages 連接 GitHub 倉庫。
4. 在 Cloudflare 的 **Build environment variables** 填 `D1_DATABASE_ID`。
5. 在 Worker 的 **Variables and Secrets** 填 SSO runtime 變數與密鑰。
6. 將部署命令改成 `npm run deploy`，如果頁面有版本命令，改成 `npm run deploy:version`。
7. 重新部署，確認 OIDC discovery 與 JWKS 端點可正常開啟。

## 你需要準備

- Cloudflare 帳號。
- GitHub 倉庫。
- 一個 Cloudflare D1 database。
- 一個要作為 SSO Provider 的 HTTPS 網域，例如 `https://auth.example.com`。
- 一個帳號信箱尾綴域名，例如 `example.com`。
- OpenAI SSO 後台提供的 callback URL 與 Tile URL。
- 一組 OIDC Client ID / Client Secret。
- 一個 RS256 私鑰 JWK，用於簽發 token 與提供 JWKS。

## 1. 建立 D1 Database

1. 進入 Cloudflare Dashboard。
2. 打開 **Storage & Databases → D1 SQL Database**。
3. 選擇 **Create database**。
4. Database name 建議填：

```text
openai_oidc_sso
```

5. 建立後複製 `database_id`，稍後會填到 Cloudflare Builds 的 `D1_DATABASE_ID`。

## 2. 初始化資料表

1. 在 Cloudflare Dashboard 進入剛建立的 D1 database。
2. 打開 **Console**。
3. 複製本倉庫 [schema.sql](schema.sql) 的全部內容。
4. 貼到 D1 Console 並執行。
5. 到 **Tables** 確認已建立：

- `users`
- `invite_codes`
- `authorization_codes`

也可以在 D1 Console 執行：

```sql
SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name;
```

## 3. 連接 GitHub 自動部署

1. 將本倉庫推送到 GitHub。
2. 進入 Cloudflare Dashboard 的 **Workers & Pages**。
3. 選擇 **Create application**。
4. 選擇 **Import a repository** 或連接 Git repository 的部署方式。
5. 選擇你的 GitHub 倉庫與 production branch。
6. 建立完成後，進入這個 Worker 的 **Settings → Builds**，確認 Build settings：

| 設定 | 值 |
| --- | --- |
| Root directory | 如果專案在倉庫根目錄，留空或填 `/` |
| Build command | 留空 |
| Deploy command | `npm run deploy` |
| Version command / Non-production deploy command | 如果頁面有這一項，填 `npm run deploy:version` |

不要使用 `npx wrangler deploy` 或 `npx wrangler versions upload` 作為部署命令。它們會直接讀公開倉庫的 `wrangler.toml`，無法取得私有 D1 database id。

如果你已經連接過 GitHub 倉庫，只需要打開 **Settings → Builds** 右側的編輯按鈕，把命令改成上表的值，再重新部署。

## 4. 設定 Build Variables

在 Worker 的 **Settings → Builds → Variables and Secrets** 或構建設定彈窗中，加入以下 **Build environment variables**。這些值只在構建時使用，不是 Worker runtime 變數。

| 名稱 | 必填 | 說明 |
| --- | --- | --- |
| `D1_DATABASE_ID` | 是 | 剛建立的 D1 database id。部署腳本會用它生成臨時 Wrangler config。 |
| `D1_DATABASE_NAME` | 否 | D1 database name，預設 `openai_oidc_sso`。 |
| `WORKER_NAME` | 否 | Worker name，預設 `sso`。 |

`D1_DATABASE_ID` 可以設為普通 Build variable，方便日後查看；如果不想讓協作者看到，可以設為加密值。

請確認變數作用在 production branch。若 Cloudflare 頁面同時提供 production 與 preview 的變數區，至少要在 production 區填 `D1_DATABASE_ID`。如果之後也要讓非生產分支部署成功，也要在 preview 區填同一個 database id，或填另一個測試用 D1 database id。

這一步只解決 D1 binding。`ISSUER`、`OIDC_CLIENT_ID`、`PRIVATE_JWK` 等 SSO 設定不要填在這裡，請填到下一節的 runtime variables。

## 5. 設定 Runtime Variables and Secrets

進入 Worker 的 **Settings → Variables and Secrets**，點 **Add** 新增下列 runtime 變數。Worker 程式會透過 `env.變數名` 讀取這些值。

Text 變數可以在 Dashboard 再次查看；Secret 儲存後不能再查看原值。建議把會需要日後查閱的非密鑰設定設成 Text，把真正的密鑰設成 Secret。

| 名稱 | 類型 | 必填 | 說明 |
| --- | --- | --- | --- |
| `ISSUER` | Text | 是 | Worker 對外 URL，不要帶結尾斜線，例如 `https://auth.example.com`。 |
| `OIDC_CLIENT_ID` | Text | 是 | OpenAI Custom OIDC 使用的 Client ID，例如 `openai-sso`。 |
| `ALLOWED_REDIRECT_URIS` | Text | 是 | OpenAI 後台顯示的 callback URL。多個值用逗號分隔。 |
| `ACCOUNT_DOMAIN` | Text | 是 | 使用者帳號的信箱域名，例如 `example.com`。使用者輸入 `neko` 時會變成 `neko@example.com`。 |
| `OPENAI_LOGIN_URL` | Text | 建議 | OpenAI SSO 設定頁提供的 Tile URL。直接訪問 `/` 時會跳轉到這裡。 |
| `AUTHORIZATION_CODE_TTL_SECONDS` | Text | 否 | 授權碼有效秒數，預設 `300`。 |
| `TOKEN_TTL_SECONDS` | Text | 否 | Access token 與 ID token 有效秒數，預設 `3600`。 |
| `TURNSTILE_SITE_KEY` | Text | 否 | Cloudflare Turnstile 前端 Site Key。 |
| `OIDC_CLIENT_SECRET` | Secret | 是 | OpenAI Custom OIDC 使用的 Client Secret。 |
| `PRIVATE_JWK` | Secret | 是 | RS256 私鑰 JWK，必須是單行 JSON，且包含 `kid`。 |
| `ADMIN_TOKEN` | Secret | 否 | 呼叫 `/admin/invite-codes` 建立邀請碼時使用。 |
| `TURNSTILE_SECRET_KEY` | Secret | 否 | Cloudflare Turnstile 後端 Secret Key。設定 Site Key 時也必須設定它。 |

注意：

- Cloudflare 介面中，先輸入變數名稱和值；需要 Secret 時再點 **Encrypt** 或選擇密鑰類型。
- 不要把 runtime 變數填到 Build variables；Worker 執行時讀不到。
- `D1_DATABASE_ID` 是例外，它只供部署腳本生成臨時 Wrangler config，不是 runtime 變數。
- Runtime Text 變數不會被 `npm run deploy` 覆蓋，因為臨時 config 只包含 `keep_vars = true` 和 D1 binding，不包含 `[vars]`。
- 修改 runtime variables 後，Cloudflare 通常需要重新部署或建立新版本才會讓最新部署使用新值。

## 6. 產生 RS256 私鑰 JWK

在本機執行：

```powershell
node -e "crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']).then(k=>crypto.subtle.exportKey('jwk',k.privateKey)).then(j=>{j.kid='openai-sso-key';j.alg='RS256';j.use='sig';console.log(JSON.stringify(j))})"
```

把輸出整段 JSON 作為 `PRIVATE_JWK` Secret。請保持單行，不要手動換行。

## 7. 設定 D1 Binding

本專案程式碼固定使用 `env.DB` 存取資料庫。因此 D1 binding 名稱必須是：

```text
DB
```

若你使用本 README 的 `npm run deploy`，部署腳本會從 Build variable `D1_DATABASE_ID` 生成 `DB` binding，通常不需要在 Dashboard 手動建立 binding。

部署後可以進入 Worker 的 **Settings → Bindings** 確認：

| 欄位 | 正確值 |
| --- | --- |
| Binding name / Variable name | `DB` |
| Resource type | D1 database |
| Database | 你建立的 D1 database，例如 `openai_oidc_sso` |

如果 Dashboard 顯示沒有 D1 binding，或 build log 仍提示 `DB` 綁到 `00000000...`，通常代表部署命令沒有改成 `npm run deploy`，或 Build variable `D1_DATABASE_ID` 沒有套用到這次部署。

## 8. 觸發部署

完成上述設定後：

1. 回到 Cloudflare Worker 的 **Deployments** 或 Git build 頁面。
2. 重新部署 production branch。
3. Build log 中應該看到：

```text
Executing user deploy command: npm run deploy
已生成臨時 Wrangler 設定：wrangler.deploy.toml
```

如果有 version upload 或 preview deployment，也應該看到它使用：

```text
npm run deploy:version
```

如果仍看到：

```text
Executing user deploy command: npx wrangler deploy
```

代表部署命令還沒改成功。

如果看到：

```text
缺少必要構建環境變數：D1_DATABASE_ID
```

代表 `D1_DATABASE_ID` 沒有填在 Cloudflare 的 Build environment variables，或沒有套用到目前部署分支。

## 9. 設定自訂網域

部署完成後，若要使用自己的網域：

1. 進入 Worker 的 **Settings → Domains & Routes**。
2. 選擇 **Add → Custom Domain**。
3. 填入 `auth.example.com` 這類完整主機名稱。
4. 等待 Cloudflare 建立 DNS 記錄與憑證。
5. 將 runtime 變數 `ISSUER` 改成正式網域，例如 `https://auth.example.com`。
6. 重新部署。

若先使用 `*.workers.dev` 測試，`ISSUER`、OpenAI OIDC endpoints 與 OpenAI callback 設定也必須使用同一個測試網域。

## 10. OpenAI Custom OIDC 設定

在 OpenAI SSO 設定頁選擇 **Custom OIDC**。建議填入：

| OpenAI 欄位 | 值 |
| --- | --- |
| Issuer | `https://你的網域` |
| Authorization endpoint | `https://你的網域/authorize` |
| Token endpoint | `https://你的網域/token` |
| JWKS URI | `https://你的網域/jwks.json` |
| UserInfo endpoint | `https://你的網域/userinfo` |
| Client ID | 與 `OIDC_CLIENT_ID` 相同 |
| Client Secret | 與 `OIDC_CLIENT_SECRET` 相同 |

OpenAI 後台顯示的 callback URL 必須填入 Worker runtime 變數 `ALLOWED_REDIRECT_URIS`。若有多個 redirect URI，使用逗號分隔。

`OPENAI_LOGIN_URL` 必須填 OpenAI SSO 設定頁提供的 Tile URL，例如：

```text
https://chatgpt.com/auth/login?sso=true&connection=conn_...
```

不要把 OpenAI callback URL 填到 `OPENAI_LOGIN_URL`，否則 OpenAI 端沒有先建立 SSO session，可能出現 `client_id_not_found_in_session`。

## 11. 建立邀請碼

初始化資料表不會自動建立邀請碼。你可以直接在 D1 Console 建立：

```sql
INSERT INTO invite_codes (code, max_uses, used_count, enabled, created_at)
VALUES ('JOIN-2026', 100, 0, 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
```

若已設定 `ADMIN_TOKEN`，也可以用管理 API：

```powershell
curl -X POST https://你的網域/admin/invite-codes ^
  -H "Authorization: Bearer 你的_ADMIN_TOKEN" ^
  -H "Content-Type: application/json" ^
  -d "{\"code\":\"JOIN-2026\",\"maxUses\":100}"
```

回傳範例：

```json
{
  "code": "JOIN-2026",
  "maxUses": 100,
  "usedCount": 0,
  "enabled": true,
  "createdAt": "2026-06-08T00:00:00.000Z"
}
```

## 12. 部署後檢查

部署後先開啟：

- `https://你的網域/.well-known/openid-configuration`
- `https://你的網域/jwks.json`

確認兩個端點正常後，再到 OpenAI 後台啟用 Custom OIDC。

常見錯誤：

- `D1 binding 'DB' references database '00000000...'`：部署命令仍在讀公開占位設定，請改成 `npm run deploy`，並設定 `D1_DATABASE_ID`。
- `缺少必要設定：ACCOUNT_DOMAIN`：Worker runtime Variables and Secrets 裡缺少 `ACCOUNT_DOMAIN`。
- `缺少必要設定：PRIVATE_JWK`：`PRIVATE_JWK` Secret 未設定或尚未重新部署。
- `不允許的 redirect_uri`：`ALLOWED_REDIRECT_URIS` 未包含 OpenAI 後台顯示的 callback URL。
- 直接訪問 `/` 失敗：檢查 `OPENAI_LOGIN_URL` 是否填了 OpenAI Tile URL。

## 登入與註冊流程

- 直接入口：訪問 `https://你的網域/` 會跳轉到 `OPENAI_LOGIN_URL`。
- 登入頁：只輸入帳號，例如 `neko`。系統會使用 `neko@ACCOUNT_DOMAIN` 登入。
- 註冊頁：輸入帳號與邀請碼。註冊成功後會直接完成 OIDC 登入。

若使用者輸入完整信箱，例如 `neko@example.com`，系統只接受尾綴符合 `ACCOUNT_DOMAIN` 的地址。其他信箱域名會被拒絕。

## Turnstile

如果同時設定 `TURNSTILE_SITE_KEY` 與 `TURNSTILE_SECRET_KEY`，登入與註冊頁會啟用 Cloudflare Turnstile。

- 兩個值都不設定：停用 Turnstile。
- 只設定其中一個：登入與註冊會因缺少必要設定而失敗。

## 本地設定備份

如果你想在本機保存一份可查看的設定備份，可以複製：

```powershell
Copy-Item .env.example .env
```

`.env` 已被 `.gitignore` 忽略，不會提交到 GitHub。它只是本機備份，不會自動同步到 Cloudflare Dashboard。

## CLI 附錄

主要部署方式是 Cloudflare Dashboard。若偏好本機 CLI：

```powershell
pnpm install
pnpm wrangler d1 create openai_oidc_sso
pnpm wrangler d1 execute openai_oidc_sso --remote --file .\schema.sql
$env:D1_DATABASE_ID = "你的_database_id"
pnpm run deploy
```

Secret 可用 Wrangler CLI 設定：

```powershell
pnpm wrangler secret put PRIVATE_JWK
pnpm wrangler secret put OIDC_CLIENT_SECRET
pnpm wrangler secret put ADMIN_TOKEN
pnpm wrangler secret put TURNSTILE_SECRET_KEY
```

## 本地驗證

```powershell
pnpm install
pnpm test
pnpm check
```

## Cloudflare 官方參考

- Workers Builds 設定：https://developers.cloudflare.com/workers/ci-cd/builds/configuration/
- Workers runtime 環境變數與 Secret：https://developers.cloudflare.com/workers/configuration/environment-variables/
- Workers Secret：https://developers.cloudflare.com/workers/configuration/secrets/
- D1 建立、綁定與 Console 初始化：https://developers.cloudflare.com/d1/get-started/
- Workers 自訂網域：https://developers.cloudflare.com/workers/configuration/routing/custom-domains/
