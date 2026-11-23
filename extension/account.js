import { authorize, serverOrigin } from "./stalwart.js";
import { byId, notice, send } from "./ui.js";

let current;
async function display() {
  current = await send("status");
  byId("signin").hidden = !!current;
  byId("connected").hidden = !current;
  if (current) {
    byId("user").textContent = current.username;
    byId("host").textContent = current.origin;
  }
}

byId("connect-form").addEventListener("submit", async event => {
  event.preventDefault();
  const button = byId("connect");
  button.disabled = true;
  try {
    const origin = serverOrigin(byId("server").value);
    const granted = await browser.permissions.request({ origins: ["https://" + new URL(origin).hostname + "/*"] });
    if (!granted) throw new Error("Firefox needs permission to connect to this server.");
    notice("Waiting for Stalwart sign-in…");
    const connection = await authorize(origin, browser.identity);
    await send("connect", { connection });
    await display();
    notice();
  } catch (error) {
    notice(error.message, true);
  } finally {
    button.disabled = false;
  }
});

byId("disconnect").addEventListener("click", async () => {
  byId("disconnect").disabled = true;
  try {
    const message = await send("disconnect", { key: current.key });
    await display();
    notice(message);
  } catch (error) {
    notice(error.message, true);
  } finally {
    byId("disconnect").disabled = false;
  }
});

display().catch(error => notice(error.message, true));
