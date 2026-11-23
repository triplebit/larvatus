import { beginSignIn, byId, notice, send } from "./ui.js";

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
  try {
    const signingIn = beginSignIn(byId("server").value);
    button.disabled = true;
    notice("Waiting for Stalwart sign-in…");
    await signingIn;
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
