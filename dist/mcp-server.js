import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createBattleServer } from './mcp-battle-server.js';
async function main() {
    const server = createBattleServer();
    const transport = new StdioServerTransport();
    await server.connect(transport);
}
main().catch((error) => {
    console.error(error);
    process.exit(1);
});
//# sourceMappingURL=mcp-server.js.map