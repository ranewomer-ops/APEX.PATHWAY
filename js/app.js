import { ApexStore } from "./store.js";
import { renderApp, renderChatMessages, renderEstimatorResult } from "./views.js";
import { getChatState, getLastAssistantMessage, sendChatMessage, subscribeToChat } from "./aiChat.js";

class ApexApp {
  constructor(root) {
    this.root = root;
    this.store = new ApexStore();
    this.notice = "";
    this.route = this.getRoute();
    this.estimator = {
      stockHp: 300,
      boostPsi: 7,
      engineType: "supercharged",
      efficiency: 0.78
    };

    this.store.subscribe(() => this.render());
    window.addEventListener("hashchange", () => {
      this.route = this.getRoute();
      document.body.classList.remove("nav-open");
      this.render();
    });

    // Chat updates: patch only the chat messages div to preserve input focus
    subscribeToChat(() => this.updateChatUI());

    this.root.addEventListener("submit", (event) => this.handleSubmit(event));
    this.root.addEventListener("click", (event) => this.handleClick(event));
    this.root.addEventListener("change", (event) => this.handleChange(event));
    this.root.addEventListener("input", (event) => this.handleInput(event));
    this.root.addEventListener("keydown", (event) => this.handleKeydown(event));
  }

  async init() {
    await this.store.init();
    this.render();
  }

  getRoute() {
    const route = window.location.hash.replace(/^#\/?/, "").split("?")[0];
    return route || "planner";
  }

  render() {
    this.root.innerHTML = renderApp(this.store.state, this.route, this.estimator, this.notice);
    if (window.lucide) {
      window.lucide.createIcons();
    }
  }

  updateChatUI() {
    const { messages, loading, chatError } = getChatState();

    const messagesEl = this.root.querySelector("#chat-messages");
    if (messagesEl) {
      messagesEl.innerHTML = renderChatMessages(messages, loading, chatError);
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    const inputEl = this.root.querySelector(".chat-input");
    if (inputEl) inputEl.disabled = loading;

    const sendBtn = this.root.querySelector("[data-action='chat-send']");
    if (sendBtn) sendBtn.disabled = loading;

    if (window.lucide) window.lucide.createIcons();
  }

  setNotice(message) {
    this.notice = message || "";
    this.render();
  }

  clearNoticeSoon() {
    window.clearTimeout(this.noticeTimer);
    this.noticeTimer = window.setTimeout(() => {
      this.notice = "";
      this.render();
    }, 2400);
  }

  async run(action, successMessage = "Saved") {
    try {
      this.setNotice("Working...");
      await action();
      this.notice = successMessage;
      this.render();
      this.clearNoticeSoon();
    } catch (error) {
      this.setNotice(error.message || "Something went wrong.");
    }
  }

  handleKeydown(event) {
    if (event.key !== "Enter" || event.shiftKey) return;
    const input = event.target;
    if (!input.classList.contains("chat-input")) return;
    event.preventDefault();
    this.submitChatInput(input);
  }

  submitChatInput(inputEl) {
    const text = (inputEl?.value ?? "").trim();
    if (!text) return;
    inputEl.value = "";
    void sendChatMessage(text);
  }

  async handleSubmit(event) {
    const form = event.target.closest("form[data-form]");
    if (!form) {
      return;
    }

    event.preventDefault();
    const data = Object.fromEntries(new FormData(form).entries());

    switch (form.dataset.form) {
      case "create-build":
        await this.run(() => this.store.createBuild(data), "Build created");
        break;
      case "create-plan":
        await this.run(() => this.store.createPlanFromBrief(data), "Customer build plan created");
        window.location.hash = "#/build";
        break;
      case "update-build":
        await this.run(() => this.store.updateCurrentBuild(data), "Build saved");
        break;
      case "create-part":
        await this.run(() => this.store.addPart(data), "Part added");
        break;
      case "create-maintenance":
        await this.run(() => this.store.addMaintenanceItem(data), "Maintenance added");
        break;
      default:
        break;
    }
  }

  async handleClick(event) {
    const target = event.target.closest("[data-action]");
    if (!target) {
      return;
    }

    const { action, id } = target.dataset;

    if (action === "toggle-nav") {
      document.body.classList.toggle("nav-open");
      return;
    }

    if (action === "chat-send") {
      const inputEl = this.root.querySelector(".chat-input");
      this.submitChatInput(inputEl);
      return;
    }

    if (action === "use-as-brief") {
      const brief = getLastAssistantMessage();
      const briefArea = this.root.querySelector("#customer-brief");
      if (briefArea && brief) {
        briefArea.value = brief;
        briefArea.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      return;
    }

    if (action === "delete-build") {
      if (window.confirm("Delete this build and all its parts? This cannot be undone.")) {
        await this.run(() => this.store.deleteBuild(id), "Build deleted");
      }
      return;
    }

    if (action === "delete-part") {
      if (window.confirm("Delete this part?")) {
        await this.run(() => this.store.deletePart(id), "Part deleted");
      }
      return;
    }

    if (action === "complete-maintenance") {
      await this.run(() => this.store.completeMaintenanceItem(id), "Maintenance completed");
      return;
    }

    if (action === "delete-maintenance") {
      if (window.confirm("Delete this maintenance item?")) {
        await this.run(() => this.store.deleteMaintenanceItem(id), "Maintenance deleted");
      }
    }
  }

  async handleChange(event) {
    const target = event.target;
    const action = target.dataset.action;

    if (action === "select-build") {
      await this.run(() => this.store.setCurrentBuild(target.value), "Build loaded");
      return;
    }

    if (action === "part-status") {
      await this.run(() => this.store.updatePart(target.dataset.id, { status: target.value }), "Part updated");
      return;
    }

    if (action === "part-price") {
      await this.run(() => this.store.updatePart(target.dataset.id, { price: target.value }), "Part updated");
      return;
    }

    if (action === "part-name") {
      await this.run(() => this.store.updatePart(target.dataset.id, { name: target.value.trim() }), "Part updated");
      return;
    }

    if (action === "part-category") {
      await this.run(() => this.store.updatePart(target.dataset.id, { category: target.value.trim() || "General" }), "Part updated");
    }
  }

  handleInput(event) {
    const target = event.target;
    const key = target.dataset.estimator;
    if (!key) {
      return;
    }

    this.estimator[key] = target.value;

    const label = this.root.querySelector("#efficiency-label");
    if (label) {
      label.textContent = `${Math.round(Number(this.estimator.efficiency) * 100)}%`;
    }

    const output = this.root.querySelector("[data-estimator-output]");
    if (output) {
      output.innerHTML = renderEstimatorResult(this.estimator);
      if (window.lucide) {
        window.lucide.createIcons();
      }
    }
  }
}

const app = new ApexApp(document.getElementById("app"));
app.init();
