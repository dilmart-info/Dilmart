const indexUrl = "https://store.DilMart.org/";
const html = await fetch(indexUrl).then((r) => r.text());
const scriptMatch = html.match(/src="(\/assets\/index-[^"]+\.js)"/);
if (!scriptMatch) {
  console.error("No index bundle in HTML");
  process.exit(1);
}
const jsUrl = `https://store.DilMart.org${scriptMatch[1]}`;
console.log("bundle:", jsUrl);
const js = await fetch(jsUrl).then((r) => r.text());
const supabaseUrl = js.match(/https:\/\/[a-z0-9]+\.supabase\.co/)?.[0];
const apiBase = js.match(/https:\/\/[^"']+onrender\.com\/api/)?.[0];
const wrongRef = js.match(/oghivndlzickoschjjfg/)?.[0];
console.log("VITE supabase URL in live site:", supabaseUrl ?? "NOT FOUND");
console.log("API base in live site:", apiBase ?? "NOT FOUND");
console.log("Typo ref (zick):", wrongRef ?? "none");
