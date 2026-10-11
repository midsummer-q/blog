import fs from "node:fs";

try {
  if (fs.existsSync("dist/pagefind")) {
    fs.cpSync("dist/pagefind", "public/pagefind", { recursive: true });
  }
} catch (err) {
  console.warn("Notice: could not copy pagefind to public:", err);
}
