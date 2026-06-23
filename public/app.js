const chatLog = document.querySelector("#chatLog");
const chatForm = document.querySelector("#chatForm");
const messageInput = document.querySelector("#messageInput");
const sportFilter = document.querySelector("#sportFilter");
const ageFilter = document.querySelector("#ageFilter");
const sourcePanel = document.querySelector("#sourcePanel");
const sourceList = document.querySelector("#sourceList");
const followUps = document.querySelector("#followUps");
const themeToggle = document.querySelector("#themeToggle");
const printChecklist = document.querySelector("#printChecklist");

const history = [];

function addMessage(role, text = "") {
  const message = document.createElement("div");
  message.className = `message ${role}`;
  message.textContent = text;
  chatLog.append(message);
  chatLog.scrollTop = chatLog.scrollHeight;
  return message;
}

function addTyping() {
  const message = document.createElement("div");
  message.className = "message assistant";
  message.innerHTML = '<span class="typing" aria-label="Assistant is typing"><span></span><span></span><span></span></span>';
  chatLog.append(message);
  chatLog.scrollTop = chatLog.scrollHeight;
  return message;
}

function renderSources(sources) {
  sourceList.innerHTML = "";
  if (!sources.length) {
    sourcePanel.hidden = true;
    return;
  }

  for (const source of sources) {
    const item = document.createElement("li");
    if (source.url) {
      const link = document.createElement("a");
      link.href = source.url;
      link.target = "_blank";
      link.rel = "noreferrer";
      link.textContent = source.title || source.url;
      item.append(link);
    } else {
      item.textContent = source.title || "GEYA resource";
    }
    sourceList.append(item);
  }
  sourcePanel.hidden = false;
}

function renderFollowUps(items) {
  followUps.innerHTML = "";
  if (!items.length) {
    followUps.hidden = true;
    return;
  }

  for (const text of items) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = text;
    button.addEventListener("click", () => submitQuestion(text));
    followUps.append(button);
  }
  followUps.hidden = false;
}

async function submitQuestion(rawText) {
  const text = rawText.trim();
  if (!text) {
    messageInput.focus();
    return;
  }

  addMessage("user", text);
  history.push({ role: "user", text });
  messageInput.value = "";
  chatForm.querySelector("button").disabled = true;
  renderFollowUps([]);
  renderSources([]);

  const assistantMessage = addTyping();

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: text,
        sport: sportFilter.value,
        ageGroup: ageFilter.value,
        history
      })
    });

    if (!response.ok || !response.body) throw new Error("Chat request failed.");

    assistantMessage.textContent = "";
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let finalText = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split("\n\n");
      buffer = events.pop() || "";

      for (const eventText of events) {
        const event = eventText.match(/^event: (.+)$/m)?.[1];
        const dataText = eventText.match(/^data: (.+)$/m)?.[1];
        if (!event || !dataText) continue;
        const data = JSON.parse(dataText);

        if (event === "status" && !finalText) {
          assistantMessage.className = "message status";
          assistantMessage.textContent = data.text;
        }

        if (event === "message") {
          if (assistantMessage.classList.contains("status")) {
            assistantMessage.className = "message assistant";
            assistantMessage.textContent = "";
          }
          finalText += data.text;
          assistantMessage.textContent = finalText;
          chatLog.scrollTop = chatLog.scrollHeight;
        }

        if (event === "done") {
          renderSources(data.sources || []);
          renderFollowUps(data.followUps || []);
        }
      }
    }

    history.push({ role: "assistant", text: finalText });
  } catch {
    assistantMessage.className = "message assistant";
    assistantMessage.textContent = "Something went wrong. Please try again in a moment.";
  } finally {
    chatForm.querySelector("button").disabled = false;
    messageInput.focus();
  }
}

chatForm.addEventListener("submit", (event) => {
  event.preventDefault();
  submitQuestion(messageInput.value);
});

messageInput.addEventListener("input", () => {
  messageInput.style.height = "auto";
  messageInput.style.height = `${messageInput.scrollHeight}px`;
});

document.querySelectorAll(".prompt-chips button").forEach((button) => {
  button.addEventListener("click", () => submitQuestion(button.textContent));
});

themeToggle.addEventListener("click", () => {
  const nextTheme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = nextTheme;
  localStorage.setItem("geya-theme", nextTheme);
});

printChecklist.addEventListener("click", () => {
  const sport = sportFilter.options[sportFilter.selectedIndex].text;
  const printWindow = window.open("", "_blank");
  printWindow.document.write(`
    <title>GEYA Equipment Checklist</title>
    <main class="printable" style="font-family: system-ui; padding: 32px;">
      <h1>GEYA Equipment Checklist</h1>
      <p>Sport filter: ${sport}</p>
      <p>Use this checklist with the official GEYA program guidance returned by the assistant.</p>
      <ul>
        <li>Water bottle</li>
        <li>Weather-appropriate athletic clothing</li>
        <li>Required sport-specific equipment verified from GEYA resources</li>
        <li>Any forms or confirmations requested by the program</li>
      </ul>
    </main>
  `);
  printWindow.document.close();
  printWindow.print();
});

const savedTheme = localStorage.getItem("geya-theme");
if (savedTheme) document.documentElement.dataset.theme = savedTheme;

addMessage(
  "assistant",
  "Hi, I'm the GEYA Parent Assistant. Ask me about registration, divisions, equipment, fields, coaching, or volunteer information. I'll answer directly from official GEYA resources."
);
