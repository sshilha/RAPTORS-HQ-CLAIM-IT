// Address search for Locations, through Google's Places API (New). The key stays on the server.
// Set GOOGLE_MAPS_API_KEY in Railway (with "Places API (New)" turned on for that key's project).
const BASE = () => process.env.PLACES_BASE_URL || "https://places.googleapis.com/v1";
const key = () => process.env.GOOGLE_MAPS_API_KEY || "";
const enabled = () => !!key();

// Suggestions as you type. sessionToken groups the typing + the pick into one billed session.
async function suggest(input, sessionToken) {
  const res = await fetch(`${BASE()}/places:autocomplete`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key() },
    body: JSON.stringify({ input: String(input).slice(0, 120), includedRegionCodes: ["us"], sessionToken,
      locationBias: { circle: { center: { latitude: 44.8113, longitude: -91.4985 }, radius: 50000 } } }),   // near Eau Claire
  });
  if (!res.ok) throw new Error(`Places suggest ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const j = await res.json();
  return (j.suggestions || []).filter((s) => s.placePrediction).slice(0, 6).map((s) => ({
    id: s.placePrediction.placeId,
    main: (s.placePrediction.structuredFormat && s.placePrediction.structuredFormat.mainText && s.placePrediction.structuredFormat.mainText.text) || s.placePrediction.text.text,
    sub: (s.placePrediction.structuredFormat && s.placePrediction.structuredFormat.secondaryText && s.placePrediction.structuredFormat.secondaryText.text) || "",
  }));
}
// The picked place's full address and name
async function details(id, sessionToken) {
  const res = await fetch(`${BASE()}/places/${encodeURIComponent(id)}${sessionToken ? `?sessionToken=${encodeURIComponent(sessionToken)}` : ""}`, {
    headers: { "X-Goog-Api-Key": key(), "X-Goog-FieldMask": "formattedAddress,displayName" },
  });
  if (!res.ok) throw new Error(`Places details ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const j = await res.json();
  return { address: j.formattedAddress || "", name: (j.displayName && j.displayName.text) || "" };
}
module.exports = { enabled, suggest, details };
