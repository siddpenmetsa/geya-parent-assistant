const launcher = document.querySelector("#widgetLauncher");
const panel = document.querySelector("#widgetPanel");
const closeButton = document.querySelector("#widgetClose");
const input = document.querySelector("#messageInput");

function setWidgetOpen(isOpen) {
  panel.hidden = !isOpen;
  launcher.hidden = isOpen;
  launcher.setAttribute("aria-expanded", String(isOpen));
  if (isOpen) input?.focus();
}

launcher?.addEventListener("click", () => setWidgetOpen(true));
closeButton?.addEventListener("click", () => setWidgetOpen(false));

setWidgetOpen(false);
