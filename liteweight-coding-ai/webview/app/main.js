import { createBus } from "./bus";
import { createChatApp } from "./components/ChatApp";
import { MessageList } from "./components/MessageList";
import { PromptInput } from "./components/PromptInput";

const { createApp } = Vue;

const bus = createBus();
const app = createApp(createChatApp(bus));

app.component("message-list", MessageList);
app.component("prompt-input", PromptInput);

app.mount("#app");
