# ⚡ Leadline

**The desk on your machine. One question. Then a crew, working in a Chrome window that is not the browser you live in.**

🌙 Picture the quiet before a send. Other tools want a seat in the cloud and a click on every sentence. Leadline stays on the computer in front of you. A coding agent is the brain. The app has no model of its own. It is the hands 🤲, the memory 🧠, and the gate 🚪.

The story opens with a single question.

> 🗣️ Should the agent start?

| | Your answer | What happens next |
| --- | --- | --- |
| ✅ | **Yes.** | The agent installs, opens the desk, and sends email, forms, and outreach without asking again. |
| ✋ | **Yes, but ask before each send.** | The same desk. Reach waits for you. |
| 🛑 | **No.** | The story stops. |

⚡ **Full power** is the green bar under the title. On, and Allow platforms send. Off, and each send waits. Prepare and Off still wait either way. A captcha, a login, or a restriction stops that one page 🧱. The rest of the desk keeps moving.

<p align="center">
  <img src="docs/screenshots/today.png" alt="Today. Full power is on, and one message can go out." width="980">
</p>

<p align="center"><i>🌅 Today. One next move, in plain language. The people in these pictures are a sample campaign on a local database, not a customer list.</i></p>

## 🖥 The room

Four corners of the same desk.

<table>
  <tr>
    <td width="50%">
      <img src="docs/screenshots/settings.png" alt="Settings, with Full power at the top">
      <br><b>⚙️ Settings.</b> Run, Full power, and Adapt sit above the lanes. One click on the bar saves the rule for the day.
    </td>
    <td width="50%">
      <img src="docs/screenshots/understand.png" alt="Understand, the business profile and materials">
      <br><b>🧭 Understand.</b> You type the offer, or you hand over a PDF, your site, and the social profiles you are already signed into.
    </td>
  </tr>
  <tr>
    <td width="50%">
      <img src="docs/screenshots/reach.png" alt="Reach, one message ready and a follow-up waiting for words">
      <br><b>✉️ Reach.</b> One message can go. The follow-up is born empty, so a second note never leaves blank.
    </td>
    <td width="50%">
      <img src="docs/screenshots/memory.png" alt="Memory, a stuck Instagram login and the playbook">
      <br><b>🧠 Memory.</b> A wall is written down. The next session does not drive into it again.
    </td>
  </tr>
</table>

<p align="center">
  <img src="docs/screenshots/gtm.png" alt="GTM, the Spring clinics campaign" width="980">
</p>

<p align="center"><i>📌 GTM. The folder the day is filed in. It does not find people, and it does not send.</i></p>

## 👥 The crew

Seven lanes. One master 👁️, checking them about every 20 seconds, and writing the result on Today.

| | Lane | The part they play |
| --- | --- | --- |
| 🧭 | **Understand** | Learns the offer, the audience, and the lines that must stay uninvented |
| 🔎 | **Discover** | Finds people on the open web, on Reddit, and on the sites you are signed into |
| ✉️ | **Reach** | Writes one draft, sends one message, then leaves a follow-up waiting for words |
| ✨ | **Create** | Writes the posts and the assets. You are the one who publishes |
| 📌 | **GTM** | Holds the campaign that ties the day together |
| 📈 | **Virality** | Tries one pattern at a time. It never sprays, and it never clicks Post for you |
| 📍 | **Trace** | Writes the line where the run stopped, and keeps it until that step is done |

🎚️ Each lane can be Off, Prepare, Ask first, or On. ✉️ Reach is the only one that sends.

👁️ While the desk is running, Understand, Discover, GTM, Reach, and Trace should be on. Create and Virality may stay off. A lane that cannot do its job shows as **🔎 Needs a look**, with the reason in one sentence.

## 🎛 The controls in your hand

- ⚡ **Full power.** On means Allow platforms send without a fresh question. The bar is on every page.
- 🚦 **Each platform.** Don’t use, Prepare, or Allow. Email, LinkedIn, X, Reddit, Instagram, Facebook, TikTok, WhatsApp, and web forms.
- 📅 **A daily cap.** It resets at local midnight. Zero blocks that platform for the day.
- 🧠 **Adapt.** A step that worked is preferred. A step that failed is skipped. “This is wrong” wins, and the agent cannot clear it.

## 📖 One day, told straight

1. 🗣️ You answer once, in the chat or on Today.
2. 📦 The agent runs `npm install` if it has to, then `npm start`. You never open a terminal.
3. 🧭 It learns the business from the form, a PDF, your website, or your own social profiles. A logged-out page is left unread. Missing proof stays missing.
4. 🪟 Chrome opens on `data/chrome-profile`, port **9333**. That window is not your daily browser. You sign in there once 🔑.
5. 🔎 Discover saves a person only after the page has been read. Fit is yes, maybe, or no.
6. ✉️ Reach sends the one message Today names, then stops. A few days later an empty follow-up appears, waiting for real words.
7. 🧱 A captcha or a login is written under Memory. That platform waits. The others continue.

## 🚫 The lines it will not cross

- 🕵️ No stealth plugin, no spoofed fingerprint, no solved captcha.
- 🔑 No typed password, and no takeover of the Chrome profile you use all day.
- 🚪 The agent cannot approve a message, mark one sent, or publish a post. `execute_send` is the only sender, and it checks the gate again.
- 📭 A click on Send is the click. It is not proof the other person received it.
- 📈 Virality never posts by itself.

## 🎬 A later chapter, on Create

Not in this build. The next chapter may plug picture and video tools into Create: 🎞️ **Higgsfield**, 🗣️ **HeyGen**, and 🌊 **Google Flow** (Veo 3 and Gemini).

🧪 The same place would run an A/B test and keep the score. You would see each thing on its own: the tool, the asset, the test, what worked ✅, and what did not ❌.

🖥 It stays one desk. Each thing gets its own plain control, a short label, and room to change it. No second app to learn.

## 🚀 How the day starts

Node **22.13** or newer.

```bash
npm install
npm test
npm start
```

🚪 Open [http://127.0.0.1:7791](http://127.0.0.1:7791). The story of the desk lives in `data/leadline.db`. That folder is gitignored. Pictures of stuck pages land in `data/encounters/`.

🛡️ A change goes through a pull request. The Test check has to pass. Main rejects a direct push.

Tell the agent one of these, and mean it:

- ✅ **Yes.** Install, start the desk, turn Full power on, open Chrome, and work.
- ✋ **Yes, but ask before each send.** The same story, with Full power left off.
- 🛑 **No.** Stop. Do not run npm.

`npm run chrome` opens the Leadline window on its own. `npm run mcp` speaks MCP on stdio for Grok, Cursor, Claude, Gemini, VS Code, and Kiro. The client configs are already in the repo.

## 🤖 For the next agent

| | Read this | Why |
| --- | --- | --- |
| 📋 | [`AGENTS.md`](AGENTS.md) | The operating rules and the tool list |
| 🗺️ | [`docs/flows/`](docs/flows/) | One page per lane, plus how a change ships |
| 🏗️ | [`ARCHITECTURE.md`](ARCHITECTURE.md) | Why there is one Chrome and one SQLite file |
| 📏 | [`CODING_STANDARDS.md`](CODING_STANDARDS.md) | How to change the code without breaking the gate |

There is no approve tool. `begin` is the only start, and only after a person has answered.

## 📄 License

[MIT](LICENSE) © Maaz Bin Mustaqeem
