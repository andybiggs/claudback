// The prompt a user pastes into their coding agent to bring the collector back
// up. Shared by the popup and the in-page panel so both surfaces copy the same
// text. Deliberately names no specific client: the registration command differs
// per agent, so it points at the setup guide instead of guessing wrong.
export const RESTART_PROMPT =
	"My Pinback collector is offline — can you get it running again? Try the " +
	"list_origins tool. (If Pinback isn't registered with this client, add the " +
	"MCP server `npx -y pinback-mcp`, then tell me to restart the session.)";
