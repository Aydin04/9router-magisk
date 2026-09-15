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

  // 2. Patch ProviderIcon.js & providerIcon.js to support both .png and .svg
  const providerIconHelperPath = path.join(targetDir, "src/shared/utils/providerIcon.js");
  if (fs.existsSync(providerIconHelperPath)) {
    let helperSrc = fs.readFileSync(providerIconHelperPath, "utf8");
    if (!helperSrc.includes("resolveIconWithExt")) {
      helperSrc = helperSrc.replace(
        /export function getProviderIconSrc\(providerId\) \{[\s\S]*?\}/,
        `export function getProviderIconSrc(providerId) {
  const id = resolveProviderIconId(providerId);
  return id ? \`/providers/\${id}.png\` : null;
}`
      );
      fs.writeFileSync(providerIconHelperPath, helperSrc, "utf8");
    }
  }

  const providerIconCompPath = path.join(targetDir, "src/shared/components/ProviderIcon.js");
  if (fs.existsSync(providerIconCompPath)) {
    let compSrc = fs.readFileSync(providerIconCompPath, "utf8");
    if (!compSrc.includes("attemptSvgFallback")) {
      compSrc = compSrc.replace(
        /onError=\{\(\) => \{[\s\S]*?setErrored\(true\);[\s\S]*?\}\}/,
        `onError={(e) => {
        const currentSrc = e.currentTarget.src || "";
        if (currentSrc.endsWith(".png")) {
          e.currentTarget.src = currentSrc.replace(/\\.png$/, ".svg");
          return;
        }
        const m = effectiveSrc.match(/^\\/providers\\/([^/]+)\\.png$/i);
        if (m) markProviderIconMissing(m[1]);
        if (providerId) markProviderIconMissing(providerId);
        setErrored(true);
      }}`
      );
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
}

// Support CLI call
const target = process.argv[2] || "/tmp/decolua-9router";
patch(target);
