import { mount } from "svelte";
import App from "./App.svelte";
import { installProjectShell } from "./lib/project/shell";
import "./lib/tokens.css";
import "./app.css";

const target = document.getElementById("app");

if (!target) {
  throw new Error("ALLOY: missing #app mount point");
}

mount(App, { target });

// Task 3.3: undo / redo shortcuts, autosave to localStorage, the `?debug` handle.
installProjectShell(window);
