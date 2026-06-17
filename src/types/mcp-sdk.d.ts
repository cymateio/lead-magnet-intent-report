// Ambient shims so the MCP SDK ESM subpaths can be dynamically imported from
// our CommonJS build without TS module-resolution complaints. The SDK ships
// its own types, but classic node resolution doesn't pick up the exports map;
// we treat these entry points as `any` and rely on runtime behavior.
declare module "@modelcontextprotocol/sdk/client/index.js" {
  export const Client: any;
}
declare module "@modelcontextprotocol/sdk/client/streamableHttp.js" {
  export const StreamableHTTPClientTransport: any;
}
declare module "@modelcontextprotocol/sdk/client/sse.js" {
  export const SSEClientTransport: any;
}
