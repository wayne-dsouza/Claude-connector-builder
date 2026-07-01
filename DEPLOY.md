# Put your Lemlist connector online (no coding) 🚀

This guide gets your Lemlist connector running on a free cloud service and connected to Claude.
No terminal, no coding — just clicking and pasting. Takes about 10 minutes.

You'll do two things:
- **Part 1:** Put the connector online (using a free service called Render).
- **Part 2:** Tell Claude its web address.

---

## Before you start, grab two things

1. **Your Lemlist API key.** In Lemlist, go to **Settings → Integrations → API**, generate a key, and copy it somewhere safe. (Lemlist only shows it once.)
2. **A GitHub account** (this is where your connector's code lives). If you don't have one, create a free account at [github.com](https://github.com).

---

## Part 1 — Put the connector online (Render)

1. Go to **[render.com](https://render.com)** and click **Get Started** / **Sign up**. Choose **Sign up with GitHub** and approve — this lets Render see your code.
2. In the Render dashboard, click the **New +** button (top right) and choose **Blueprint**.
3. Find and select the repository **`claude-connector-builder`**, then click **Connect**.
4. Render reads the setup file automatically and shows a service called **lemlist-mcp**. It will ask you to fill in one secret:
   - **LEMLIST_API_KEY** → paste your Lemlist API key here.
5. Click **Apply** (or **Create Services**). Render now builds and starts your connector — this takes **2–3 minutes**. Wait until the status shows **Live** (green).
6. At the top of your service page you'll see its web address, something like:
   `https://lemlist-mcp-xxxx.onrender.com`
   **Your connector address is that, with `/mcp` on the end:**
   `https://lemlist-mcp-xxxx.onrender.com/mcp`
   Copy it — you need it for Part 2.

> ✅ Quick check: open `https://lemlist-mcp-xxxx.onrender.com/health` in your browser. If you see `{"status":"ok",...}`, it's working.

---

## Part 2 — Connect it to Claude

1. Open **Claude** (claude.ai) in your browser.
2. Go to **Settings → Connectors**.
3. Click **Add custom connector**.
4. Give it a name like **Lemlist**, and in the URL field paste your connector address from Part 1 (the one ending in `/mcp`).
5. Click **Add** / **Save**.
6. Test it: start a new chat and ask **"List my Lemlist campaigns."** Claude will ask permission to use the connector the first time — allow it.

That's it — Claude can now work with your Lemlist account. 🎉

---

## Good to know

- **Keep your connector address private.** Anyone who has it could use your Lemlist account through it. Don't post it publicly. You can change your Lemlist key anytime in Lemlist's settings if you're ever worried.
- **First message after a quiet spell may be slow.** On Render's *free* plan, the connector "goes to sleep" after ~15 minutes of no use, so the first request might take up to a minute to wake it up. If it seems to fail, just send the message again. For instant, always-on responses, Render has a paid plan (about **$7/month**) — on your service page, change the plan from *Free* to *Starter*.
- **Adding custom connectors in Claude may require a paid Claude plan** (Pro/Max/Team). If you don't see "Add custom connector", that's likely why.
- **Prefer to keep everything on your own computer instead?** See the "local" setup in [README.md](./README.md) — it doesn't need any cloud service, but it's a bit more hands-on.

---

## If something goes wrong

- **Render build failed?** Open the service's **Logs** tab in Render and look at the last lines. The most common cause is a typo in the API key — re-check the **Environment** tab.
- **Claude says it can't connect?** Make sure your address ends in **`/mcp`**, and that the Render service shows **Live**. Try the `/health` link above.
- **"Unauthorized" or Lemlist errors?** Your Lemlist API key is probably wrong or was regenerated. Make a fresh one in Lemlist → Settings → Integrations → API and update it in Render's **Environment** tab.
