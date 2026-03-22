import { MessageList } from "./MessageList";
import { PromptInput } from "./PromptInput";

export function createChatApp(bus) {
  return {
    name: "ChatApp",
    data() {
      return {
        conversations: [],
        activeConversationId: "",
        models: [],
        preferredModel: "",
        showSettings: false,
        systemPrompt: "",
        defaultSystemPrompt: "",
        showConversations: false,
        isProcessing: false,
        toolkits: [],
        defaultEnabledToolkits: [],
      };
    },
    mounted() {
      const saved = typeof bus.getState === "function" ? bus.getState() : {};
      if (saved && typeof saved === "object") {
        const savedConversations = Array.isArray(saved.conversations)
          ? saved.conversations
          : [];
        const savedActiveId =
          typeof saved.activeConversationId === "string" ? saved.activeConversationId : "";

        if (savedConversations.length > 0) {
          const normalized = savedConversations.map((item) => this.normalizeConversation(item));
          const active = normalized.find((item) => item.id === savedActiveId);
          let trimmed = normalized.slice(-10);
          if (active && !trimmed.some((item) => item.id === active.id)) {
            trimmed = [...trimmed.slice(1), active];
          }
          this.conversations = trimmed;
          const exists = this.conversations.some((item) => item.id === savedActiveId);
          this.activeConversationId = exists
            ? savedActiveId
            : this.conversations[0]?.id ?? "";
        } else {
          const legacy = this.normalizeConversation({
            messages: Array.isArray(saved.messages) ? saved.messages : [],
            inputValue: typeof saved.inputValue === "string" ? saved.inputValue : "",
            selectedModel: typeof saved.selectedModel === "string" ? saved.selectedModel : "",
            mode: typeof saved.mode === "string" ? saved.mode : "coder",
            promptHistory: Array.isArray(saved.promptHistory) ? saved.promptHistory : [],
            historyIndex: typeof saved.historyIndex === "number" ? saved.historyIndex : undefined,
            enabledToolkits: Array.isArray(saved.enabledToolkits) ? saved.enabledToolkits : [],
          });
          this.conversations = [legacy];
          this.activeConversationId = legacy.id;
        }
      }

      if (this.conversations.length === 0) {
        const convo = this.createConversation({});
        this.conversations = [convo];
        this.activeConversationId = convo.id;
      }

      this.persistState();

      this._disposeResponse = bus.on("addResponse", (message) => {
        const convo = this.getActiveConversation();
        convo.messages.push({ role: "assistant", text: message.value ?? "" });
        this.persistState();
        this.$nextTick(() => {
          const el = document.querySelector(".messages");
          if (el) {
            el.scrollTop = el.scrollHeight;
          }
        });
      });

      this._disposeProcessingStart = bus.on("processingStart", () => {
        this.isProcessing = true;
      });

      this._disposeProcessingEnd = bus.on("processingEnd", () => {
        this.isProcessing = false;
      });

      this._disposeModels = bus.on("ollamaModels", (message) => {
        const payload = message.value ?? {};
        const models = Array.isArray(payload.models) ? payload.models : [];
        this.models = models;

        const selected = typeof payload.selectedModel === "string" ? payload.selectedModel : "";
        if (selected) {
          this.preferredModel = selected;
        }

        const convo = this.getActiveConversation();
        if (convo.selectedModel && models.includes(convo.selectedModel)) {
          this.persistState();
          return;
        }
        if (selected && models.includes(selected)) {
          convo.selectedModel = selected;
        } else if (models.length > 0) {
          convo.selectedModel = String(models[0]);
        }
        this.persistState();
      });

      this._disposeSystemPrompt = bus.on("systemPrompt", (message) => {
        const payload = message.value ?? {};
        const prompt = typeof payload.systemPrompt === "string" ? payload.systemPrompt : "";
        const defaultPrompt =
          typeof payload.defaultSystemPrompt === "string" ? payload.defaultSystemPrompt : "";
        this.systemPrompt = prompt;
        this.defaultSystemPrompt = defaultPrompt;
      });

      this._disposeToolkits = bus.on("toolkitSettings", (message) => {
        const payload = message.value ?? {};
        const toolkits = Array.isArray(payload.toolkits) ? payload.toolkits : [];
        const enabled = Array.isArray(payload.enabled) ? payload.enabled : [];
        this.toolkits = toolkits;
        this.defaultEnabledToolkits = enabled;
        const convo = this.getActiveConversation();
        if ((convo.enabledToolkits ?? []).length === 0 && enabled.length > 0) {
          convo.enabledToolkits = enabled;
        }
        this.persistState();
      });

      bus.send("getModels");
      bus.send("getSystemPrompt");
      bus.send("getToolkitSettings");
    },
    beforeUnmount() {
      if (this._disposeResponse) {
        this._disposeResponse();
      }
      if (this._disposeModels) {
        this._disposeModels();
      }
      if (this._disposeToolkits) {
        this._disposeToolkits();
      }
      if (this._disposeSystemPrompt) {
        this._disposeSystemPrompt();
      }
      if (this._disposeProcessingStart) {
        this._disposeProcessingStart();
      }
      if (this._disposeProcessingEnd) {
        this._disposeProcessingEnd();
      }
    },
    methods: {
      createConversation(data) {
        const promptHistory = Array.isArray(data?.promptHistory) ? data.promptHistory : [];
        const historyIndex =
          typeof data?.historyIndex === "number" ? data.historyIndex : promptHistory.length;
        const enabledToolkits = Array.isArray(data?.enabledToolkits)
          ? data.enabledToolkits
          : this.defaultEnabledToolkits ?? [];
        return {
          id:
            typeof data?.id === "string"
              ? data.id
              : `c_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          messages: Array.isArray(data?.messages) ? data.messages : [],
          inputValue: typeof data?.inputValue === "string" ? data.inputValue : "",
          selectedModel: typeof data?.selectedModel === "string" ? data.selectedModel : "",
          mode: typeof data?.mode === "string" ? data.mode : "coder",
          promptHistory,
          historyIndex,
          enabledToolkits,
        };
      },
      normalizeConversation(data) {
        return this.createConversation(data ?? {});
      },
      getDefaultModel() {
        if (this.preferredModel && this.models.includes(this.preferredModel)) {
          return this.preferredModel;
        }
        return this.models.length > 0 ? String(this.models[0]) : "";
      },
      getActiveConversation() {
        let convo = this.conversations.find((item) => item.id === this.activeConversationId);
        if (!convo) {
          convo = this.createConversation({
            selectedModel: this.getDefaultModel(),
            enabledToolkits: this.defaultEnabledToolkits,
          });
          this.conversations = [...this.conversations, convo];
          this.activeConversationId = convo.id;
        }
        return convo;
      },
      persistState() {
        if (typeof bus.setState !== "function") {
          return;
        }
        const trimmed = this.conversations.length > 10
          ? this.conversations.slice(-10)
          : this.conversations;
        if (trimmed.length !== this.conversations.length) {
          this.conversations = trimmed;
          if (!this.conversations.some((item) => item.id === this.activeConversationId)) {
            this.activeConversationId = this.conversations[0]?.id ?? "";
          }
        }
        bus.setState({
          conversations: this.conversations,
          activeConversationId: this.activeConversationId,
        });
      },
      createNewConversation() {
        const active = this.getActiveConversation();
        const convo = this.createConversation({
          selectedModel: active.selectedModel,
          mode: active.mode,
          enabledToolkits: active.enabledToolkits,
        });
        this.conversations = [...this.conversations, convo];
        this.activeConversationId = convo.id;
        if (this.conversations.length > 10) {
          this.conversations = this.conversations.slice(-10);
        }
        this.persistState();
        bus.send("resetConversationContext");
        bus.send("updateToolkitSettings", { enabledToolkits: convo.enabledToolkits });
      },
      cancelPrompt() {
        bus.send("cancelPrompt");
      },
      openExtensionSettings() {
        bus.send("openExtensionSettings");
      },
      updateSystemPrompt() {
        bus.send("updateSystemPrompt", { systemPrompt: this.systemPrompt });
      },
      resetSystemPrompt() {
        bus.send("resetSystemPrompt");
      },
      toggleConversationList() {
        this.showConversations = !this.showConversations;
      },
      closeConversationList() {
        this.showConversations = false;
      },
      deleteConversation(id) {
        if (!id) {
          return;
        }
        const filtered = this.conversations.filter((convo) => convo.id !== id);
        this.conversations = filtered;
        if (this.activeConversationId === id) {
          this.activeConversationId = this.conversations[0]?.id ?? "";
          if (!this.activeConversationId) {
            const convo = this.createConversation({});
            this.conversations = [convo];
            this.activeConversationId = convo.id;
          }
          bus.send("resetConversationContext");
        }
        this.persistState();
      },
      selectConversation(id) {
        if (!id) {
          return;
        }
        this.activeConversationId = id;
        const convo = this.getActiveConversation();
        if (!convo.selectedModel) {
          convo.selectedModel = this.getDefaultModel();
        }
        if ((convo.enabledToolkits ?? []).length > 0) {
          bus.send("updateToolkitSettings", { enabledToolkits: convo.enabledToolkits });
        }
        this.persistState();
        this.showConversations = false;
      },
      getConversationLabel(convo) {
        const messages = Array.isArray(convo?.messages) ? convo.messages : [];
        const lastUser = [...messages].reverse().find((item) => item?.role === "user");
        const text = typeof lastUser?.text === "string" ? lastUser.text : "";
        const normalized = text.trim().replace(/\s+/g, " ");
        if (!normalized) {
          return "Hội thoại mới";
        }
        const maxLength = 60;
        if (normalized.length <= maxLength) {
          return normalized;
        }
        return `${normalized.slice(0, maxLength)}...`;
      },
      sendMessage() {
        if (this.isProcessing) {
          return;
        }
        const convo = this.getActiveConversation();
        const text = (convo.inputValue ?? "").trim();
        if (!text) {
          return;
        }

        convo.messages.push({ role: "user", text });
        convo.promptHistory = [...convo.promptHistory, text];
        convo.historyIndex = convo.promptHistory.length;
        this.persistState();
        this.isProcessing = true;
        bus.send("onSendMessage", {
          prompt: text,
          model: convo.selectedModel,
          mode: convo.mode,
        });
        convo.inputValue = "";
        this.persistState();

        this.$nextTick(() => {
          const el = document.querySelector(".messages");
          if (el) {
            el.scrollTop = el.scrollHeight;
          }
        });
      },
      recallPrev() {
        const convo = this.getActiveConversation();
        const total = convo.promptHistory.length;
        if (total === 0) {
          return;
        }
        const currentIndex =
          typeof convo.historyIndex === "number" ? convo.historyIndex : total;
        const nextIndex = Math.max(0, currentIndex - 1);
        convo.historyIndex = nextIndex;
        const nextValue = convo.promptHistory[nextIndex] ?? "";
        convo.inputValue = nextValue;
        this.persistState();
      },
      openSettings() {
        this.showSettings = true;
      },
      closeSettings() {
        this.showSettings = false;
      },
      toggleToolkit(name) {
        if (!name) {
          return;
        }
        const convo = this.getActiveConversation();
        const current = convo.enabledToolkits ?? [];
        const exists = current.includes(name);
        const next = exists ? current.filter((item) => item !== name) : [...current, name];
        convo.enabledToolkits = next;
        this.persistState();
        bus.send("updateToolkitSettings", { enabledToolkits: next });
      },
    },
    render() {
      const { h } = Vue;

      const conversation = this.getActiveConversation();
      const list = h(MessageList, { messages: conversation.messages, isProcessing: this.isProcessing });
      const input = h(PromptInput, {
        modelValue: conversation.inputValue,
        "onUpdate:modelValue": (v) => {
          conversation.inputValue = v ?? "";
          conversation.historyIndex = conversation.promptHistory.length;
          this.persistState();
        },
        models: this.models,
        selectedModel: conversation.selectedModel,
        "onUpdate:selectedModel": (v) => {
          conversation.selectedModel = v ?? "";
          this.persistState();
        },
        mode: conversation.mode,
        "onUpdate:mode": (v) => {
          conversation.mode = v ?? "coder";
          this.persistState();
        },
        isProcessing: this.isProcessing,
        onOpenSettings: this.openSettings,
        onSend: this.sendMessage,
        onRecallPrev: this.recallPrev,
        onNewConversation: this.createNewConversation,
        onShowConversations: this.toggleConversationList,
        onCancel: this.cancelPrompt,
      });

      const settingsRows = (this.toolkits ?? []).map((toolkit) => {
        const name = String(toolkit?.name ?? "");
        const description = String(toolkit?.description ?? "");
        const checked = (conversation.enabledToolkits ?? []).includes(name);
        return h(
          "div",
          {
            key: name,
            style: { display: "flex", alignItems: "flex-start", gap: "8px" },
          },
          [
            h("input", {
              type: "checkbox",
              checked,
              onChange: () => this.toggleToolkit(name),
            }),
            h(
              "div",
              { style: { display: "flex", flexDirection: "column", gap: "2px" } },
              [
                h("div", { style: { fontSize: "12px" } }, name),
                h("div", { style: { fontSize: "11px", opacity: "0.7" } }, description),
              ]
            ),
          ]
        );
      });

      const conversationRows = this.conversations.map((convo) => {
        const isActive = convo.id === this.activeConversationId;
        return h(
          "div",
          {
            key: convo.id,
            style: {
              display: "flex",
              alignItems: "center",
              gap: "8px",
            },
          },
          [
            h(
              "button",
              {
                type: "button",
                onClick: () => this.selectConversation(convo.id),
                style: {
                  flex: "1",
                  textAlign: "left",
                  border: "1px solid var(--vscode-input-border)",
                  background: isActive
                    ? "var(--vscode-list-activeSelectionBackground)"
                    : "var(--vscode-input-background)",
                  color: isActive
                    ? "var(--vscode-list-activeSelectionForeground)"
                    : "var(--vscode-input-foreground)",
                  borderRadius: "6px",
                  padding: "6px 8px",
                  fontSize: "12px",
                },
              },
              this.getConversationLabel(convo)
            ),
            h(
              "button",
              {
                type: "button",
                onClick: () => this.deleteConversation(convo.id),
                style: {
                  border: "1px solid var(--vscode-input-border)",
                  background: "var(--vscode-input-background)",
                  color: "var(--vscode-input-foreground)",
                  borderRadius: "6px",
                  padding: "4px 8px",
                  fontSize: "12px",
                },
              },
              "Xóa"
            ),
          ]
        );
      });

      const conversationsPanel = h(
        "div",
        {
          style: {
            background: "var(--vscode-editor-background)",
            color: "var(--vscode-editor-foreground)",
            border: "1px solid var(--vscode-panel-border)",
            borderRadius: "8px",
            width: "90%",
            maxWidth: "560px",
            maxHeight: "80vh",
            overflow: "auto",
            padding: "16px",
          },
        },
        [
          h(
            "div",
            {
              style: {
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: "12px",
              },
            },
            [
              h("div", { style: { fontSize: "13px", fontWeight: "600" } }, "Danh sách hội thoại"),
            ]
          ),
          h(
            "div",
            { style: { display: "flex", flexDirection: "column", gap: "8px" } },
            conversationRows.length > 0
              ? conversationRows
              : [h("div", { style: { fontSize: "12px", opacity: "0.7" } }, "Không có hội thoại.")]
          ),
          h(
            "div",
            { style: { display: "flex", justifyContent: "flex-end", marginTop: "12px" } },
            [
              h(
                "button",
                {
                  type: "button",
                  onClick: this.closeConversationList,
                  style: {
                    border: "1px solid var(--vscode-input-border)",
                    background: "var(--vscode-input-background)",
                    color: "var(--vscode-input-foreground)",
                    borderRadius: "6px",
                    padding: "4px 8px",
                    fontSize: "12px",
                  },
                },
                "Close"
              ),
            ]
          )
        ]
      );

      const conversationsOverlay = this.showConversations
        ? h(
            "div",
            {
              style: {
                position: "fixed",
                inset: "0",
                background: "rgba(0, 0, 0, 0.4)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: "40",
              },
            },
            [conversationsPanel]
          )
        : null;

      const settingsPanel = h(
        "div",
        {
          style: {
            background: "var(--vscode-editor-background)",
            color: "var(--vscode-editor-foreground)",
            border: "1px solid var(--vscode-panel-border)",
            borderRadius: "8px",
            width: "90%",
            maxWidth: "560px",
            maxHeight: "80vh",
            overflow: "auto",
            padding: "16px",
          },
        },
        [
          h(
            "div",
            {
              style: {
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: "12px",
              },
            },
            [
              h("div", { style: { fontSize: "13px", fontWeight: "600" } }, "System prompt"),
              h(
                "div",
                { style: { display: "flex", gap: "8px" } },
                [
                  h(
                    "button",
                    {
                      type: "button",
                      onClick: this.resetSystemPrompt,
                      style: {
                        border: "1px solid var(--vscode-input-border)",
                        background: "var(--vscode-input-background)",
                        color: "var(--vscode-input-foreground)",
                        borderRadius: "6px",
                        padding: "4px 8px",
                        fontSize: "12px",
                      },
                    },
                    "Reset"
                  ),
                  h(
                    "button",
                    {
                      type: "button",
                      onClick: this.updateSystemPrompt,
                      style: {
                        border: "1px solid var(--vscode-input-border)",
                        background: "var(--vscode-input-background)",
                        color: "var(--vscode-input-foreground)",
                        borderRadius: "6px",
                        padding: "4px 8px",
                        fontSize: "12px",
                      },
                    },
                    "Save"
                  ),
                  h(
                    "button",
                    {
                      type: "button",
                      onClick: this.openExtensionSettings,
                      style: {
                        border: "1px solid var(--vscode-input-border)",
                        background: "var(--vscode-input-background)",
                        color: "var(--vscode-input-foreground)",
                        borderRadius: "6px",
                        padding: "4px 8px",
                        fontSize: "12px",
                      },
                    },
                    "VS Code Settings"
                  )
                ]
              ),
            ]
          ),
          h("textarea", {
            value: this.systemPrompt,
            onInput: (event) => {
              this.systemPrompt = event.target?.value ?? "";
            },
            rows: 6,
            style: {
              width: "100%",
              border: "1px solid var(--vscode-input-border)",
              background: "var(--vscode-input-background)",
              color: "var(--vscode-input-foreground)",
              borderRadius: "6px",
              padding: "8px",
              fontSize: "12px",
              marginBottom: "12px",
            },
          }),
          h(
            "div",
            {
              style: {
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: "12px",
              },
            },
            [
              h("div", { style: { fontSize: "13px", fontWeight: "600" } }, "Toolkit settings"),
            ]
          ),
          h(
            "div",
            { style: { display: "flex", flexDirection: "column", gap: "10px" } },
            settingsRows.length > 0
              ? settingsRows
              : [h("div", { style: { fontSize: "12px", opacity: "0.7" } }, "Không có toolkit.")]
          ),
          h(
            "div",
            { style: { display: "flex", justifyContent: "flex-end", marginTop: "12px" } },
            [
              h(
                "button",
                {
                  type: "button",
                  onClick: this.closeSettings,
                  style: {
                    border: "1px solid var(--vscode-input-border)",
                    background: "var(--vscode-input-background)",
                    color: "var(--vscode-input-foreground)",
                    borderRadius: "6px",
                    padding: "4px 8px",
                    fontSize: "12px",
                  },
                },
                "Close"
              ),
            ]
          ),
        ]
      );

      const settingsOverlay = this.showSettings
        ? h(
            "div",
            {
              style: {
                position: "fixed",
                inset: "0",
                background: "rgba(0, 0, 0, 0.4)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: "30",
              },
            },
            [settingsPanel]
          )
        : null;

      return h(
        "div",
        { class: "chat-container flex h-screen w-full flex-col overflow-hidden" },
        [list, input, settingsOverlay, conversationsOverlay]
      );
    },
  };
}
