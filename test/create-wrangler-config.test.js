import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

import {
  DEFAULT_CONFIG_PATH,
  createWranglerConfig,
  validateDeployEnv
} from "../scripts/create-wrangler-config.js";

describe("臨時 Wrangler 設定生成", () => {
  it("缺少 D1 database id 時會拒絕生成部署設定", () => {
    assert.throws(
      () => validateDeployEnv({}),
      /缺少必要構建環境變數：D1_DATABASE_ID/
    );
  });

  it("會生成不包含 runtime vars 的 D1 部署設定", () => {
    const config = createWranglerConfig({
      D1_DATABASE_ID: "11111111-2222-3333-4444-555555555555",
      D1_DATABASE_NAME: "openai_oidc_sso",
      WORKER_NAME: "sso"
    });

    assert.match(config, /keep_vars = true/);
    assert.match(config, /\[\[d1_databases\]\]/);
    assert.match(config, /binding = "DB"/);
    assert.match(config, /database_id = "11111111-2222-3333-4444-555555555555"/);
    assert.doesNotMatch(config, /\[vars\]/);
    assert.doesNotMatch(config, /ISSUER/);
  });

  it("部署指令會使用專案根目錄的臨時 Wrangler 設定", async () => {
    const packageJson = JSON.parse(
      await readFile(new URL("../package.json", import.meta.url), "utf8")
    );

    assert.equal(DEFAULT_CONFIG_PATH, "wrangler.deploy.toml");
    assert.equal(
      packageJson.scripts.deploy,
      `npm run deploy:config && wrangler deploy --config ${DEFAULT_CONFIG_PATH}`
    );
    assert.equal(
      packageJson.scripts["deploy:version"],
      `npm run deploy:config && wrangler versions upload --config ${DEFAULT_CONFIG_PATH}`
    );
  });
});
