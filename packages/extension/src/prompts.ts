// The prompt a user pastes into Claude to bring the collector back up. Shared
// by the popup and the in-page panel so both surfaces copy the same text.
export const CLAUDE_RESTART_PROMPT =
	"My Claudback collector is offline — can you get it running again? Try the " +
	"list_origins tool. (If Claudback isn't registered with this client: " +
	"claude mcp add --scope user claudback -- npx -y claudback-mcp, then I'll " +
	"restart the session.)";
