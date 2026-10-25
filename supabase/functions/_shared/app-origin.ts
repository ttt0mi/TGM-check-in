export function appOrigin() {
  // Retain the fallback until APP_ORIGIN is verified in the shared live project.
  const source = Deno.env.get("APP_ORIGIN") || Deno.env.get("HOST_DECISION_ORIGIN");
  if (!source) throw new Error("APP_ORIGIN is required");
  const url = new URL(source);
  const localHttp = url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname);
  if ((!localHttp && url.protocol !== "https:") || url.username || url.password || url.search || url.hash || url.pathname !== "/") {
    throw new Error("APP_ORIGIN must be an HTTPS origin");
  }
  return url.origin;
}
