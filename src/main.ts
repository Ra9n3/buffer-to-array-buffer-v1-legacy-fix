import { mount } from "svelte";
import App from "./App.svelte";
import { installProjectShell } from "./lib/project/shell";
import { mountMeterDebugTable } from "./lib/metering/debug-table";
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

// Stage 1: the ?debug=meters numeric meter table. Mounted only when the URL
// asks for it (the rAF redraw loop does not exist otherwise), and it adds
// nothing to window.alloy. The module is imported statically — the one-file
// build keeps it inline — but nothing in it runs until it is mounted.
if (new URLSearchParams(window.location.search).get("debug") === "meters") {
  mountMeterDebugTable(document);
}
