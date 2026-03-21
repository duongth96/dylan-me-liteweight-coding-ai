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
  },
  emits: ["update:modelValue", "update:selectedModel", "send"],
  methods: {
    onInput(event) {
      this.$emit("update:modelValue", event.target?.value ?? "");
    },
    onKeyup(event) {
      if (event?.key === "Enter") {
        this.$emit("send");
      }
    },
    onModelChange(event) {
      this.$emit("update:selectedModel", event.target?.value ?? "");
    },
  },
  render() {
    const { h } = Vue;

    const options = (this.models ?? []).map((m) =>
      h("option", { key: String(m), value: String(m) }, String(m))
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
      onKeyup: this.onKeyup,
    });

    return h(
      "div",
      {
        class:
          "input-container fixed bottom-0 left-0 right-0 flex flex-col gap-2 " +
          "border-t border-[var(--vscode-panel-border)] bg-[var(--vscode-editor-background)] p-3",
      },
      [select, input]
    );
  },
};
