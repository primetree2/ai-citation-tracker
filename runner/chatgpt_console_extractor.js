(async () => {
  const id = location.pathname.match(/\/c\/([\w-]+)/)?.[1];
  if (location.hostname !== "chatgpt.com" || !id)
    throw new Error("Open the saved ChatGPT chat first.");
  const session = await (await fetch("/api/auth/session")).json();
  const response = await fetch("/backend-api/conversation/" + id, {
    headers: { Authorization: "Bearer " + session.accessToken },
  });
  if (!response.ok)
    throw new Error("Saved conversation request failed: " + response.status);
  const raw = await response.text();
  const a = document.createElement("a"),
    url = URL.createObjectURL(new Blob([raw], { type: "application/json" }));
  a.href = url;
  a.download = "chatgpt_raw.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  console.log(
    "Saved chat downloaded. Import it into the dashboard; this is not a live stream capture.",
  );
})();
