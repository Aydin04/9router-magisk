const fs = require("fs");
const path = require("path");

function patch(targetDir) {
  console.log(`[Patch] Starting 9router patch in: ${targetDir}`);

  const registryDir = path.join(targetDir, "open-sse/providers/registry");
  const publicProvidersDir = path.join(targetDir, "public/providers");
  const assetsDir = path.join(__dirname, "../extra-assets/providers");
  const extractedFile = path.join(__dirname, "extracted_providers.json");
  const freeCatalogFile = path.join(__dirname, "free_models_catalog.json");

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

      const filePath = path.join(registryDir, `${id}.js`);
      const fileContent = `export default {
  id: ${JSON.stringify(prov.id)},
  name: ${JSON.stringify(prov.name || id)},
  baseUrl: ${JSON.stringify(prov.baseUrl || "")},
  apiType: ${JSON.stringify(prov.apiType || "openai")},
  category: ${JSON.stringify(prov.category || "llm")},
  icon: ${JSON.stringify(prov.icon || "")},
  color: ${JSON.stringify(prov.color || "#4F46E5")},
  authModes: ${JSON.stringify(prov.authModes || ["apikey"])},
  hasFree: ${JSON.stringify(prov.hasFree || false)},
  freeTier: ${JSON.stringify(prov.freeTier || false)},
  pricing: ${JSON.stringify(prov.pricing || null)},
  disabled: false,
  description: ${JSON.stringify(prov.description || "")}
};
`;
      fs.writeFileSync(filePath, fileContent, "utf8");
      addedCount++;
    }
    console.log(`[Patch] Injected ${addedCount} new provider registries!`);

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

  // 6. Patch Provider Detail Page: "Fetch Models from API" & "Free Only" Models Filter
  const providerDetailPath = path.join(targetDir, "src/app/(dashboard)/dashboard/providers/[id]/page.js");
  if (fs.existsSync(providerDetailPath)) {
    let detailSrc = fs.readFileSync(providerDetailPath, "utf8");

    // 6a. Inject Universal Fetch Models button
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
    }

    // 6b. Inject Free Catalog & checkIsModelFree Helper
    if (!detailSrc.includes("checkIsModelFree")) {
      const freeCatalogRaw = fs.existsSync(freeCatalogFile)
        ? fs.readFileSync(freeCatalogFile, "utf8").trim()
        : "{}";
      const catalogHelper = `
const FREE_MODELS_CATALOG = ${freeCatalogRaw};
function checkIsModelFree(pId, mId, isFreeFlag) {
  if (isFreeFlag === true) return true;
  if (!mId) return false;
  const lower = String(mId).toLowerCase();
  if (lower.includes("free") || lower.endsWith(":free")) return true;
  const list = FREE_MODELS_CATALOG[pId];
  if (Array.isArray(list) && list.includes(mId)) return true;
  return false;
}
`;
      // Insert after "use client";
      detailSrc = detailSrc.replace('"use client";', '"use client";\n' + catalogHelper);

      // Add showFreeModelsOnly state
      detailSrc = detailSrc.replace(
        `const [customModels, setCustomModels] = useState([]);`,
        `const [customModels, setCustomModels] = useState([]);
  const [showFreeModelsOnly, setShowFreeModelsOnly] = useState(false);`
      );

      // Filter displayModels in renderModelsSection
      detailSrc = detailSrc.replace(
        `const displayModels = allModels.filter((m) => !disabledSet.has(m.id));`,
        `const filteredByFree = showFreeModelsOnly
      ? allModels.filter((m) => checkIsModelFree(providerId, m.id, m.isFree))
      : allModels;
    const displayModels = filteredByFree.filter((m) => !disabledSet.has(m.id));`
      );

      // Pass accurate isFree prop to ModelRow for both custom and built-in models
      detailSrc = detailSrc.replace(
        `isFree={false}`,
        `isFree={checkIsModelFree(providerId, model.id, false)}`
      );
      detailSrc = detailSrc.replace(
        `isFree={model.isFree}`,
        `isFree={checkIsModelFree(providerId, model.id, model.isFree)}`
      );

      // Add "Free Only" Toggle Button in Available Models Card header
      const oldModelsHeading = `<h2 className="text-lg font-semibold">
              {"Available Models"}
            </h2>`;
      const newModelsHeading = `<div className="flex items-center gap-2.5">
              <h2 className="text-lg font-semibold">
                {"Available Models"}
              </h2>
              <button
                type="button"
                onClick={() => setShowFreeModelsOnly(!showFreeModelsOnly)}
                className={\`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium border transition-all \${
                  showFreeModelsOnly
                    ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-600 dark:text-emerald-400 font-semibold"
                    : "border-border text-text-muted hover:bg-sidebar hover:text-text-primary"
                }\`}
                title="Show only free models"
              >
                <span className="material-symbols-outlined text-[14px]">
                  {showFreeModelsOnly ? "check_circle" : "paid"}
                </span>
                Free Only
              </button>
            </div>`;

      if (detailSrc.includes(oldModelsHeading)) {
        detailSrc = detailSrc.replace(oldModelsHeading, newModelsHeading);
      }

      fs.writeFileSync(providerDetailPath, detailSrc, "utf8");
      console.log(`[Patch] Injected 'Free Only' model filter into Provider Detail Page!`);
    }
  }

  // 7. Patch ModelRow.js to show green FREE badge when isFree is true
  const modelRowPath = path.join(targetDir, "src/app/(dashboard)/dashboard/providers/[id]/ModelRow.js");
  if (fs.existsSync(modelRowPath)) {
    let rowSrc = fs.readFileSync(modelRowPath, "utf8");
    const oldCopyBtnGroup = `        <div className="relative shrink-0 group/btn">
          <button
            onClick={() => onCopy(displayModel, \`model-\${model.id}\`)}
            className="rounded p-0.5 text-text-muted hover:bg-sidebar hover:text-primary"
          >
            <span className="material-symbols-outlined text-sm">
              {copied === \`model-\${model.id}\` ? "check" : "content_copy"}
            </span>
          </button>
          <span className="pointer-events-none absolute mt-1 top-5 left-1/2 -translate-x-1/2 text-[10px] text-text-muted whitespace-nowrap opacity-0 group-hover/btn:opacity-100 transition-opacity">
            {copied === \`model-\${model.id}\` ? "Copied!" : "Copy"}
          </span>
        </div>`;

    const newCopyBtnGroupWithBadge = oldCopyBtnGroup + `
        {isFree && (
          <span className="shrink-0 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-1.5 py-0.5 rounded">
            FREE
          </span>
        )}`;

    if (!rowSrc.includes("isFree &&") && rowSrc.includes(oldCopyBtnGroup)) {
      rowSrc = rowSrc.replace(oldCopyBtnGroup, newCopyBtnGroupWithBadge);
      fs.writeFileSync(modelRowPath, rowSrc, "utf8");
      console.log(`[Patch] Injected FREE badge display into ModelRow.js!`);
    }
  }
}

// Support CLI call
const target = process.argv[2] || "/tmp/decolua-9router";
patch(target);
