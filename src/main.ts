import { mount } from "svelte";
import App from "./App.svelte";
import { installProjectShell } from "./lib/project/shell";
import "./lib/tokens.css";
import "./app.css";
import "./lib/preferences.css";

const target = document.getElementById("app");

if (!target) {
  throw new Error("ALLOY: missing #app mount point");
}

// Task 3.3: undo / redo shortcuts, autosave to localStorage, the `?debug` handle.
// Task 4.1: the stored settings (motion onto <html>) and the last opened project
// are in place before the first paint, so it is installed before the mount.
installProjectShell(window);

mount(App, { target });
