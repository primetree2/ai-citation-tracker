(async () => {
  const id = location.pathname.match(/\/chat\/([\w-]+)/)?.[1];
  if (location.hostname !== "claude.ai" || !id)
    throw new Error("Open the saved Claude chat first.");
  const orgs = await (await fetch("/api/organizations")).json();
  let response;
  for (const org of orgs) {
    const r = await fetch(
      "/api/organizations/" +
        org.uuid +
        "/chat_conversations/" +
        id +
        "?tree=True&rendering_mode=messages&render_all_tools=true",
    );
    if (r.ok) {
      response = r;
      break;
    }
  }
  if (!response) throw new Error("Saved conversation request failed.");
  const a = document.createElement("a"),
    url = URL.createObjectURL(
      new Blob([await response.text()], { type: "application/json" }),
    );
  a.href = url;
  a.download = "claude_raw.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  console.log(
    "Saved chat downloaded. Import it into the dashboard; this is not a live stream capture.",
  );
})();
