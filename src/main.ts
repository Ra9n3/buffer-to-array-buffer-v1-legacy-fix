import { mount } from "svelte";
import App from "./App.svelte";
import "./lib/tokens.css";
import "./app.css";

const target = document.getElementById("app");

if (!target) {
  throw new Error("ALLOY: missing #app mount point");
}

mount(App, { target });
