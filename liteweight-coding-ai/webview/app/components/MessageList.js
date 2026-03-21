import MarkdownIt from "markdown-it";

const md = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true
});

export const MessageList = {
  name: "MessageList",
  props: {
    messages: {
      type: Array,
      required: true,
    },
  },
  render() {
    const { h } = Vue;

    const messageNodes = (this.messages ?? []).map((msg, index) => {
      const role = msg?.role;
      const text = String(msg?.text ?? "");

      const bubbleClass = [
        "message",
        role,
        "max-w-[92%] rounded-lg px-3 py-2 text-sm leading-6 shadow-sm",
        role === "user"
          ? "ml-auto bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)]"
          : "mr-auto bg-[var(--vscode-editor-inactiveSelectionBackground)] text-[var(--vscode-editor-foreground)]",
      ];

      const assistantContentClass =
        "content text-sm leading-6 " +
        "[&>p]:mb-2 [&>p:last-child]:mb-0 " +
        "[&>ul]:my-2 [&>ul]:list-disc [&>ul]:pl-5 " +
        "[&>ol]:my-2 [&>ol]:list-decimal [&>ol]:pl-5 " +
        "[&>pre]:my-2 [&>pre]:overflow-x-auto [&>pre]:rounded-md [&>pre]:p-2 " +
        "[&>pre]:bg-[var(--vscode-textCodeBlock-background)] " +
        "[&_code]:rounded [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-xs " +
        "[&_code]:bg-[var(--vscode-textCodeBlock-background)] " +
        "[&_a]:underline [&_a]:text-[var(--vscode-textLink-foreground)]";

      const content =
        role === "assistant"
          ? h("div", { class: assistantContentClass, innerHTML: md.render(text) })
          : h("div", { class: "content whitespace-pre-wrap" }, text);

      return h("div", { key: index, class: bubbleClass }, [content]);
    });

    return h("div", { class: "messages flex-1 overflow-y-auto px-3 py-3 pb-40" }, messageNodes);
  },
};
