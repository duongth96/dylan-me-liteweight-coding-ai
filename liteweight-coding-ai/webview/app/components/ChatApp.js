import { MessageList } from "./MessageList";
import { PromptInput } from "./PromptInput";

export function createChatApp(bus) {
  return {
    name: "ChatApp",
    data() {
      return {
        messages: [],
        inputValue: "",
        models: [],
        selectedModel: "",
      };
    },
    mounted() {
      this._disposeResponse = bus.on("addResponse", (message) => {
        this.messages.push({ role: "assistant", text: message.value ?? "" });
        this.$nextTick(() => {
          const el = document.querySelector(".messages");
          if (el) {
            el.scrollTop = el.scrollHeight;
          }
        });
      });

      this._disposeModels = bus.on("ollamaModels", (message) => {
        const payload = message.value ?? {};
        const models = Array.isArray(payload.models) ? payload.models : [];
        this.models = models;

        const selected = typeof payload.selectedModel === "string" ? payload.selectedModel : "";
        if (selected && models.includes(selected)) {
          this.selectedModel = selected;
        } else if (!this.selectedModel && models.length > 0) {
          this.selectedModel = String(models[0]);
        }
      });

      bus.send("getModels");
    },
    beforeUnmount() {
      if (this._disposeResponse) {
        this._disposeResponse();
      }
      if (this._disposeModels) {
        this._disposeModels();
      }
    },
    methods: {
      sendMessage() {
        const text = (this.inputValue ?? "").trim();
        if (!text) {
          return;
        }

        this.messages.push({ role: "user", text });
        bus.send("onSendMessage", {
          prompt: text,
          model: this.selectedModel,
        });
        this.inputValue = "";

        this.$nextTick(() => {
          const el = document.querySelector(".messages");
          if (el) {
            el.scrollTop = el.scrollHeight;
          }
        });
      },
    },
    render() {
      const { h } = Vue;

      const list = h(MessageList, { messages: this.messages });
      const input = h(PromptInput, {
        modelValue: this.inputValue,
        "onUpdate:modelValue": (v) => {
          this.inputValue = v ?? "";
        },
        models: this.models,
        selectedModel: this.selectedModel,
        "onUpdate:selectedModel": (v) => {
          this.selectedModel = v ?? "";
        },
        onSend: this.sendMessage,
      });

      return h(
        "div",
        { class: "chat-container flex h-screen w-full flex-col overflow-hidden" },
        [list, input]
      );
    },
  };
}
