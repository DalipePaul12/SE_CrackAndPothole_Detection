import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

export default function offlineShell() {
  return {
    name: "offline-report-shell",
    apply: "build",
    enforce: "post",
    generateBundle(_, bundle) {
      const entry = Object.values(bundle).find(file => file.type === "chunk" && file.isEntry);
      const files = new Set(["/index.html"]);
      function include(chunk) {
        if (files.has("/" + chunk.fileName)) return;
        files.add("/" + chunk.fileName);
        for (const css of chunk.viteMetadata.importedCss) files.add("/" + css);
        for (const dependency of chunk.imports) if (bundle[dependency]) include(bundle[dependency]);
      }
      include(entry);
      const source = readFileSync(new URL("./report-worker.js", import.meta.url), "utf8");
      const assets = JSON.stringify([...files]);
      const hash = createHash("sha256").update(source + assets).digest("hex").slice(0, 12);
      this.emitFile({type: "asset", fileName: "report-worker.js",
        source: "const shell = " + assets + ";\nconst version = 'snap2fix-shell-" + hash + "';\n" + source});
    },
  };
}
