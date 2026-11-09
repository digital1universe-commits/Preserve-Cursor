import { createServer } from "./http.js";

const port = Number(process.env.PORT || 8787);
const server = createServer();
server.listen(port, "0.0.0.0", () => {
  console.log(`PRESERVE listening on ${port}`);
});
