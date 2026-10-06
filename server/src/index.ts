import { startServer } from './server.js';

const port = Number(process.env.PORT ?? 8080);
startServer({ port }).then(({ port }) => {
  console.log(`STANDOFF server listening on http://localhost:${port}`);
});
