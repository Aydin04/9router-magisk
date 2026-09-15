import os
import re
import json

base_dir = "/home/aydin/atomic-router/src/shared/constants/providers"
files = []
for root, _, filenames in os.walk(base_dir):
    for f in filenames:
        if f.endswith(".ts") and f != "index.ts":
            files.append(os.path.join(root, f))

providers = {}
pattern = re.compile(r"^\s{2}[\"']?([a-zA-Z0-9_\-]+)[\"']?\s*:\s*\{", re.MULTILINE)

for file in files:
    with open(file, "r", encoding="utf-8") as f:
        content = f.read()
    
    matches = list(pattern.finditer(content))
    for m in matches:
        key = m.group(1)
        start = m.end() - 1
        brace_count = 0
        end = -1
        in_string = False
        quote_char = ""
        escape = False
        
        for j in range(start, len(content)):
            char = content[j]
            if escape:
                escape = False
                continue
            if char == "\\":
                escape = True
                continue
            if in_string:
                if char == quote_char:
                    in_string = False
            else:
                if char in ('"', "'", "`"):
                    in_string = True
                    quote_char = char
                elif char == "{":
                    brace_count += 1
                elif char == "}":
                    brace_count -= 1
                    if brace_count == 0:
                        end = j + 1
                        break
        if end != -1:
            body = content[start:end]
            
            def get_field(fname):
                reg = rf"{fname}\s*:\s*[\"']([^\"']+)[\"']"
                match = re.search(reg, body)
                if match:
                    return match.group(1).strip()
                reg2 = rf"{fname}\s*:\s*(true|false|\d+)"
                match2 = re.search(reg2, body)
                if match2:
                    val = match2.group(1)
                    return True if val == "true" else False if val == "false" else int(val)
                return None

            providers[key] = {
                "id": get_field("id") or key,
                "name": get_field("name") or key,
                "icon": get_field("icon") or "auto_awesome",
                "color": get_field("color") or "#4F46E5",
                "textIcon": get_field("textIcon") or key[:2].upper(),
                "website": get_field("website") or "",
                "authHint": get_field("authHint") or get_field("apiHint") or "",
                "category": "webCookie" if "web-cookie" in file else "apikey",
                "hasFree": bool(get_field("hasFree")),
                "source_file": os.path.basename(file)
            }

print(f"Total extracted providers: {len(providers)}")
if "agnes" in providers:
    print("Agnes:", providers["agnes"])
if "gemini-web" in providers:
    print("Gemini Web:", providers["gemini-web"])
if "doubao-web" in providers:
    print("Doubao Web:", providers["doubao-web"])

with open("/home/aydin/9router-magisk/scripts/extracted_providers.json", "w", encoding="utf-8") as f:
    json.dump(providers, f, indent=2)
print("Saved to /home/aydin/9router-magisk/scripts/extracted_providers.json")
