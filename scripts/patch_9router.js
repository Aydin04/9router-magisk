const fs = require("fs");
const path = require("path");

function patch(targetDir) {
  console.log(`[Patch] Starting 9router patch in: ${targetDir}`);

  const registryDir = path.join(targetDir, "open-sse/providers/registry");
  const publicProvidersDir = path.join(targetDir, "public/providers");
  const assetsDir = path.join(__dirname, "../extra-assets/providers");
  const extractedFile = path.join(__dirname, "extracted_providers.json");

  if (!fs.existsSync(registryDir)) {
    console.error(`[Error] Registry dir not found: ${registryDir}`);
    process.exit(1);
  }

  // 1. Copy Logos (SVG & PNG)
  if (fs.existsSync(assetsDir) && fs.existsSync(publicProvidersDir)) {
    const assets = fs.readdirSync(assetsDir);
    let copied = 0;
    for (const file of assets) {
      fs.copyFileSync(path.join(assetsDir, file), path.join(publicProvidersDir, file));
      copied++;
    }
    console.log(`[Patch] Copied ${copied} logo assets to public/providers/`);
  }

  // 2. Patch ProviderIcon.js with SVG fallback without syntax error
  const providerIconCompPath = path.join(targetDir, "src/shared/components/ProviderIcon.js");
  if (fs.existsSync(providerIconCompPath)) {
    let compSrc = fs.readFileSync(providerIconCompPath, "utf8");
    const oldOnError = `      onError={() => {
        const m = effectiveSrc.match(/^\\/providers\\/([^/]+)\\.png$/i);
        if (m) markProviderIconMissing(m[1]);
        if (providerId) markProviderIconMissing(providerId);
        setErrored(true);
      }}`;

    const newOnError = `      onError={(e) => {
        const cur = e?.currentTarget?.src || "";
        if (cur.endsWith(".png")) {
          e.currentTarget.src = cur.slice(0, -4) + ".svg";
          return;
        }
        const m = effectiveSrc.match(/^\\/providers\\/([^/]+)\\.png$/i);
        if (m) markProviderIconMissing(m[1]);
        if (providerId) markProviderIconMissing(providerId);
        setErrored(true);
      }}`;

    if (compSrc.includes(oldOnError)) {
      compSrc = compSrc.replace(oldOnError, newOnError);
      fs.writeFileSync(providerIconCompPath, compSrc, "utf8");
      console.log(`[Patch] Enhanced ProviderIcon.js with SVG fallback support`);
    }
  }

  // 3. Inject new providers into open-sse/providers/registry/
  if (fs.existsSync(extractedFile)) {
    const extracted = JSON.parse(fs.readFileSync(extractedFile, "utf8"));
    const existing = new Set(
      fs.readdirSync(registryDir)
        .filter(f => f.endsWith(".js") && f !== "index.js")
        .map(f => f.replace(".js", ""))
    );

    let addedCount = 0;
    for (const [id, prov] of Object.entries(extracted)) {
      if (existing.has(id)) continue;

      const isWeb = prov.category === "webCookie";
      const cleanName = (prov.name || id).replace(/"/g, '\\"');
      const cleanWebsite = prov.website || "";
      const cleanColor = prov.color || "#4F46E5";
      const cleanTextIcon = prov.textIcon || id.slice(0, 2).toUpperCase();
      const cleanHint = (prov.authHint || `API key for ${prov.name}`).replace(/"/g, '\\"');

      const trimmedWebsite = cleanWebsite ? cleanWebsite.replace(/\/+$/, "") : "";
      let baseUrl = "";
      if (isWeb) {
        baseUrl = trimmedWebsite ? `${trimmedWebsite}/chat` : `https://${id}.com`;
      } else {
        baseUrl = trimmedWebsite ? `${trimmedWebsite}/v1/chat/completions` : `https://api.${id}.com/v1/chat/completions`;
      }

      const fileContent = `export default {
  id: "${id}",
  alias: "${id}",
  display: {
    name: "${cleanName}",
    icon: "${prov.icon || 'auto_awesome'}",
    color: "${cleanColor}",
    textIcon: "${cleanTextIcon}",
    website: "${cleanWebsite}",
  },
  category: "${isWeb ? 'webCookie' : 'apikey'}",
  authType: "${isWeb ? 'cookie' : 'apikey'}",
  authHint: "${cleanHint}",
  ${prov.hasFree ? "hasFree: true," : ""}
  transport: {
    baseUrl: "${baseUrl}",
    format: "openai",
    authType: "${isWeb ? 'cookie' : 'apikey'}",
  },
  models: [
    { id: "default", name: "${cleanName} Default" },
  ],
  passthroughModels: true,
};
`;
      fs.writeFileSync(path.join(registryDir, `${id}.js`), fileContent, "utf8");
      addedCount++;
    }
    console.log(`[Patch] Successfully generated ${addedCount} new provider modules!`);

    // 4. Regenerate registry/index.js
    const allFiles = fs.readdirSync(registryDir)
      .filter(f => f.endsWith(".js") && f !== "index.js")
      .sort();

    const imports = [];
    const exportsList = [];
    allFiles.forEach((file, idx) => {
      const varName = `p${idx}`;
      imports.push(`import ${varName} from "./${file}";`);
      exportsList.push(`  ${varName},`);
    });

    const indexContent = `// Auto-generated: static imports for all registry entries\n` +
      imports.join("\n") + "\n" +
      "export default [\n" +
      exportsList.join("\n") + "\n" +
      "];\n";

    fs.writeFileSync(path.join(registryDir, "index.js"), indexContent, "utf8");
    console.log(`[Patch] Regenerated open-sse/providers/registry/index.js with ${allFiles.length} providers!`);
  }

  // 5. Patch Universal Auto Fetch Models API
  const modelsRoutePath = path.join(targetDir, "src/app/api/providers/[id]/models/route.js");
  if (fs.existsSync(modelsRoutePath)) {
    let routeSrc = fs.readFileSync(modelsRoutePath, "utf8");
    const oldConfigCheck = `    const config = PROVIDER_MODELS_CONFIG[connection.provider];
    if (!config) {
      return NextResponse.json(
        { error: \`Provider \${connection.provider} does not support models listing\` },
        { status: 400 }
      );
    }`;

    const newUniversalFallback = `    let config = PROVIDER_MODELS_CONFIG[connection.provider];
    if (!config) {
      // Universal OpenAI-compatible auto-discovery for any provider
      const token = connection.providerSpecificData?.copilotToken || connection.accessToken || connection.apiKey;
      let targetBase = connection.providerSpecificData?.baseUrl || "";
      if (!targetBase) {
        try {
          const { PROVIDERS } = require("open-sse/config/providers.js");
          targetBase = PROVIDERS[connection.provider]?.baseUrl || "";
        } catch (_) {}
      }
      
      if (token && targetBase && /^https?:\\/\\//i.test(targetBase)) {
        let modelsUrl = targetBase.replace(/\\/+$/, "");
        modelsUrl = modelsUrl.replace(/\\/(chat\\/completions|responses|chat|messages)$/i, "");
        if (!modelsUrl.endsWith("/models")) {
          modelsUrl = \`\${modelsUrl}/models\`;
        }
        config = createOpenAIModelsConfig(modelsUrl);
      } else {
        // Fallback to static catalog if no URL can be probed
        const staticList = getStaticProviderModels(connection.provider);
        return NextResponse.json({
          provider: connection.provider,
          connectionId: connection.id,
          models: staticList,
          warning: "Provider does not expose dynamic endpoint; loaded static catalog."
        });
      }
    }`;

    if (routeSrc.includes(oldConfigCheck)) {
      routeSrc = routeSrc.replace(oldConfigCheck, newUniversalFallback);
      fs.writeFileSync(modelsRoutePath, routeSrc, "utf8");
      console.log(`[Patch] Injected Universal Models Auto-Discovery into /api/providers/[id]/models/route.js`);
    }
  }

  // 6. Patch "Fetch Models from API" Button on Provider Detail Page
  const providerDetailPath = path.join(targetDir, "src/app/(dashboard)/dashboard/providers/[id]/page.js");
  if (fs.existsSync(providerDetailPath)) {
    let detailSrc = fs.readFileSync(providerDetailPath, "utf8");

    const qoderBtnAnchor = `{/* Import Qoder models button — only show for qoder provider */}`;
    const universalImportBtn = `{/* Universal Fetch Models from API button for any active connection */}
        {connections.some((conn) => conn.isActive !== false) && (
          <button
            onClick={async () => {
              const activeConn = connections.find((c) => c.isActive !== false);
              if (!activeConn) return;
              try {
                const res = await fetch(\`/api/providers/\${activeConn.id}/models\`);
                const data = await res.json();
                if (!res.ok) {
                  alert(data.error || translate("Failed to fetch models"));
                  return;
                }
                const models = data.models || [];
                if (models.length === 0) {
                  alert(translate("No models returned"));
                  return;
                }
                let count = 0;
                for (const m of models) {
                  const mId = m.id || m.name;
                  if (!mId) continue;
                  const exists = customModels.some(e => e.providerAlias === providerStorageAlias && e.id === mId);
                  if (exists) continue;
                  await handleAddCustomModel(mId, m.kind || m.type || "llm", providerStorageAlias);
                  count++;
                }
                alert(translate("Successfully added") + \` \${count} \` + translate("models"));
              } catch (err) {
                alert("Error: " + err.message);
              }
            }}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-emerald-500/40 px-3 py-2 text-xs text-emerald-600 dark:text-emerald-400 transition-colors hover:border-emerald-500 hover:bg-emerald-500/5 sm:w-auto"
            title="Auto-fetch all models from upstream API key"
          >
            <span className="material-symbols-outlined text-sm">cloud_download</span>
            {translate("Fetch Models from API")}
          </button>
        )}
        ` + qoderBtnAnchor;

    if (!detailSrc.includes("Fetch Models from API") && detailSrc.includes(qoderBtnAnchor)) {
      detailSrc = detailSrc.replace(qoderBtnAnchor, universalImportBtn);
      fs.writeFileSync(providerDetailPath, detailSrc, "utf8");
      console.log(`[Patch] Injected 'Fetch Models from API' button into Provider detail page`);
    }
  }

  // 7. Patch "Free Only" Filter on Providers Dashboard with 100% valid JSX
  const providersPagePath = path.join(targetDir, "src/app/(dashboard)/dashboard/providers/page.js");
  if (fs.existsSync(providersPagePath)) {
    let pageSrc = fs.readFileSync(providersPagePath, "utf8");

    if (!pageSrc.includes("showFreeOnly")) {
      pageSrc = pageSrc.replace(
        `const [statusFilter, setStatusFilter] = useState("all");`,
        `const [statusFilter, setStatusFilter] = useState("all");
  const [showFreeOnly, setShowFreeOnly] = useState(false);`
      );

      pageSrc = pageSrc.replace(
        `  const oauthEntries = sortByPriority(
    Object.entries(OAUTH_PROVIDERS).filter(`,
        `  const oauthEntries = sortByPriority(
    Object.entries(OAUTH_PROVIDERS).filter(([k, info]) => (!showFreeOnly || info.hasFree || info.category === "free" || info.category === "freeTier")).filter(`
      );

      pageSrc = pageSrc.replace(
        `  const apikeyEntries = Object.entries(APIKEY_PROVIDERS)
    .filter(`,
        `  const apikeyEntries = Object.entries(APIKEY_PROVIDERS)
    .filter(([k, info]) => (!showFreeOnly || info.hasFree || info.category === "free" || info.category === "freeTier"))
    .filter(`
      );

      // Clean, exact replace around <select ...> with balanced tags
      const oldHeader = `      <div className="flex items-center justify-end">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="h-8 rounded-lg border border-black/10 bg-black/[0.02] px-2 text-xs text-text-primary outline-none transition-colors hover:bg-black/5 dark:border-white/10 dark:bg-white/[0.03] dark:hover:bg-white/10"
          aria-label="Filter providers by connection status"
        >
          {STATUS_FILTER_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>`;

      const newHeader = `      <div className="flex items-center justify-end gap-3">
        <button
          type="button"
          onClick={() => setShowFreeOnly(!showFreeOnly)}
          className={\`flex items-center gap-1.5 h-8 px-3 rounded-lg border text-xs font-medium transition-all \${
            showFreeOnly
              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400 font-semibold"
              : "border-black/10 bg-black/[0.02] text-text-muted hover:bg-black/5 dark:border-white/10 dark:bg-white/[0.03]"
          }\`}
        >
          <span className="material-symbols-outlined text-[15px]">
            {showFreeOnly ? "check_circle" : "paid"}
          </span>
          Free Only
        </button>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="h-8 rounded-lg border border-black/10 bg-black/[0.02] px-2 text-xs text-text-primary outline-none transition-colors hover:bg-black/5 dark:border-white/10 dark:bg-white/[0.03] dark:hover:bg-white/10"
          aria-label="Filter providers by connection status"
        >
          {STATUS_FILTER_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>`;

      if (pageSrc.includes(oldHeader)) {
        pageSrc = pageSrc.replace(oldHeader, newHeader);
        fs.writeFileSync(providersPagePath, pageSrc, "utf8");
        console.log(`[Patch] Injected 'Free Only' filter toggle into Providers Dashboard`);
      }
    }
  }
}

// Support CLI call
const target = process.argv[2] || "/tmp/decolua-9router";
patch(target);
