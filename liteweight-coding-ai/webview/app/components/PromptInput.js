export const PromptInput = {
  name: "PromptInput",
  props: {
    modelValue: {
      type: String,
      default: "",
    },
    models: {
      type: Array,
      default: () => [],
    },
    selectedModel: {
      type: String,
      default: "",
    },
    mode: {
      type: String,
      default: "coder",
    },
    isProcessing: {
      type: Boolean,
      default: false,
    },
  },
  emits: [
    "update:modelValue",
    "update:selectedModel",
    "update:mode",
    "send",
    "openSettings",
    "recallPrev",
    "newConversation",
    "showConversations",
    "cancel",
  ],
  methods: {
    onInput(event) {
      this.$emit("update:modelValue", event.target?.value ?? "");
    },
    onKeydown(event) {
      if (event?.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        if (this.isProcessing) {
          return;
        }
        this.$emit("send");
        return;
      }
      if (event?.key === "ArrowUp") {
        const target = event.target;
        const start = typeof target?.selectionStart === "number" ? target.selectionStart : null;
        const end = typeof target?.selectionEnd === "number" ? target.selectionEnd : null;
        if ((start === null && end === null) || (start === 0 && end === 0)) {
          event.preventDefault();
          this.$emit("recallPrev");
        }
      }
    },
    onModelChange(event) {
      this.$emit("update:selectedModel", event.target?.value ?? "");
    },
    onModeChange(event) {
      this.$emit("update:mode", event.target?.value ?? "");
    },
    onOpenSettings() {
      this.$emit("openSettings");
    },
    onNewConversation() {
      this.$emit("newConversation");
    },
    onShowConversations() {
      this.$emit("showConversations");
    },
    onCancel() {
      this.$emit("cancel");
    },
  },
  render() {
    const { h } = Vue;

    const options = (this.models ?? []).map((m) =>
      h("option", { key: String(m), value: String(m) }, String(m))
    );

    const modeSelect = h(
      "select",
      {
        class:
          "model-select rounded border border-[var(--vscode-input-border)] " +
          "bg-[var(--vscode-input-background)] px-2 py-1 text-xs " +
          "text-[var(--vscode-input-foreground)] " +
          "focus:outline-none focus:border-[var(--vscode-focusBorder)]",
        value: this.mode,
        onChange: this.onModeChange,
      },
      [
        h("option", { key: "coder", value: "coder" }, "Coder"),
        h("option", { key: "chat", value: "chat" }, "Chat"),
      ]
    );

    const select = h(
      "select",
      {
        class:
          "model-select w-full rounded border border-[var(--vscode-input-border)] " +
          "bg-[var(--vscode-input-background)] px-2 py-1 text-xs " +
          "text-[var(--vscode-input-foreground)] " +
          "focus:outline-none focus:border-[var(--vscode-focusBorder)]",
        value: this.selectedModel,
        onChange: this.onModelChange,
      },
      options
    );

    const settingsButton = h(
      "button",
      {
        class:
          "rounded border border-[var(--vscode-input-border)] " +
          "bg-[var(--vscode-input-background)] px-2 py-1 text-xs " +
          "text-[var(--vscode-input-foreground)] " +
          "hover:bg-[var(--vscode-input-background)] " +
          "focus:outline-none focus:border-[var(--vscode-focusBorder)]",
        type: "button",
        onClick: this.onOpenSettings,
      },
      "Settings"
    );

    const newConversationButton = h(
      "button",
      {
        class:
          "rounded border border-[var(--vscode-input-border)] " +
          "bg-[var(--vscode-input-background)] px-2 py-1 text-xs " +
          "text-[var(--vscode-input-foreground)] " +
          "hover:bg-[var(--vscode-input-background)] " +
          "focus:outline-none focus:border-[var(--vscode-focusBorder)]",
        type: "button",
        onClick: this.onNewConversation,
      },
      "New"
    );

    const showConversationsButton = h(
      "button",
      {
        class:
          "rounded border border-[var(--vscode-input-border)] " +
          "bg-[var(--vscode-input-background)] px-2 py-1 text-xs " +
          "text-[var(--vscode-input-foreground)] " +
          "hover:bg-[var(--vscode-input-background)] " +
          "focus:outline-none focus:border-[var(--vscode-focusBorder)]",
        type: "button",
        onClick: this.onShowConversations,
      },
      "Chats"
    );

    const cancelButton = this.isProcessing
      ? h(
          "button",
          {
            class:
              "rounded border border-[var(--vscode-input-border)] " +
              "bg-[var(--vscode-input-background)] px-2 py-1 text-xs " +
              "text-[var(--vscode-charts-red)] " +
              "hover:bg-[var(--vscode-input-background)] " +
              "focus:outline-none focus:border-[var(--vscode-focusBorder)]",
            type: "button",
            onClick: this.onCancel,
          },
          "Cancel"
        )
      : null;

    const input = h("textarea", {
      class:
        "input-box w-full resize-none rounded border border-[var(--vscode-input-border)] " +
        "bg-[var(--vscode-input-background)] px-2 py-2 text-sm leading-6 " +
        "text-[var(--vscode-input-foreground)] " +
        "placeholder:text-[var(--vscode-input-placeholderForeground)] " +
        "focus:outline-none focus:border-[var(--vscode-focusBorder)]",
      rows: 4,
      value: this.modelValue,
      placeholder: "Ask a question...",
      onInput: this.onInput,
      onKeydown: this.onKeydown,
    });

    const headerRow = h(
      "div",
      { class: "flex gap-2" },
      [modeSelect, select, showConversationsButton, newConversationButton, cancelButton, settingsButton]
    );

    return h(
      "div",
      {
        class:
          "input-container fixed bottom-0 left-0 right-0 flex flex-col gap-2 " +
          "border-t border-[var(--vscode-panel-border)] bg-[var(--vscode-editor-background)] p-3",
      },
      [headerRow, input]
    );
  },
};
