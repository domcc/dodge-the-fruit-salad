// Headless game check: runs game.js without a browser and makes sure
// levels can be finished. Usage: node tests/check.js [level ...]
const fs = require("fs");
const path = require("path");
const fn = () => {};
const grad = { addColorStop: fn };
const ctx = new Proxy({}, { get: (t, k) => (k in t ? t[k] : k.startsWith("create") ? () => grad : fn), set: (t, k, v) => ((t[k] = v), true) });
const el = () => ({ classList: { add: fn, remove: fn, toggle: fn }, addEventListener: fn, textContent: "", getContext: () => ctx, width: 800, height: 450, getBoundingClientRect: () => ({ left: 0, width: 800 }) });
global.document = { getElementById: el };
global.window = { addEventListener: fn };
global.localStorage = { getItem: () => null, setItem: fn };
global.requestAnimationFrame = fn;
global.Path2D = class { moveTo() {} lineTo() {} closePath() {} };

const levels = process.argv.slice(2).map(Number);
const src = fs.readFileSync(path.join(__dirname, "..", "game.js"), "utf8");
eval(src + `
;(function () {
  const snap = () => ({ L: structuredClone(L), mode });
  const load = (s) => { L = structuredClone(s.L); mode = s.mode; };
  // actions: 0 nothing, 1 jump, 2 duck, 3 run faster
  const setAct = (a) => { for (const k in keys) keys[k] = false; if (a === 1) keys[" "] = true; if (a === 2) keys["arrowdown"] = true; if (a === 3) keys["arrowright"] = true; };
  // depth-first search over jump / duck / nothing, a few frames at a time
  function solve(from, to, acts, stepN) {
    const stack = [{ s: snap(), i: 0 }];
    let it = 0;
    while (stack.length) {
      if (++it > 400000) return "gave up";
      const top = stack[stack.length - 1];
      if (top.i >= acts.length) { stack.pop(); continue; }
      load(top.s);
      const a = acts[top.i++];
      for (let f = 0; f < stepN; f++) { setAct(a); update(); if (mode !== from) break; }
      if (mode === to) return "ok";
      if (mode === from) stack.push({ s: snap(), i: 0 });
    }
    return "IMPOSSIBLE";
  }
  const list = levels.length ? levels : [1, 3, 5, 10, 20, 40, 60, 80];
  let bad = 0;
  for (const n of list) {
    const res = [];
    for (let t = 0; t < 2; t++) {
      startLevel(n);
      const run = solve("playing", "cutscene", levelConfig(n).alien ? [0, 1, 2, 3] : [0, 1, 2], 4);
      let fly = "-";
      if (run === "ok") { for (let i = 0; i < 200 && mode === "cutscene"; i++) update(); fly = solve("flying", "warp", [0, 1], 3); }
      if (run !== "ok" || fly !== "ok") bad++;
      res.push("run " + run + ", fly " + fly);
    }
    console.log("Level " + n + ": " + res.join(" | "));
  }
  console.log(bad ? bad + " problem(s) found" : "All checked levels can be finished.");
})();
`);
