import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createBattleServer } from './mcp-battle-server.js';

async function main(): Promise<void> {
  const server = createBattleServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
