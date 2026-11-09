import { spawn } from "node:child_process";

const server = spawn(
  process.execPath,
  ["--disable-warning=ExperimentalWarning", "--import", "tsx", "src/server/index.ts"],
  { stdio: "inherit", env: { ...process.env, PORT: process.env.PORT || "8787" } },
);
const client = spawn(process.execPath, ["node_modules/vite/bin/vite.js"], {
  stdio: "inherit",
  env: process.env,
});

function stop() {
  server.kill("SIGTERM");
  client.kill("SIGTERM");
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
client.on("exit", (code) => {
  server.kill("SIGTERM");
  process.exit(code ?? 0);
});
