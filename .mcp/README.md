# MCP Server for mylg-app

This directory contains the Model Context Protocol (MCP) server configuration for the mylg-app project.

## Setup

1. Install dependencies:
```bash
cd .mcp
npm install
```

2. Test the server:
```bash
npm start
```

## Configuration

The MCP server provides context about:
- Project structure and architecture
- Backend services (Lambda functions, DynamoDB, S3)
- Frontend components and features
- Available tools and capabilities

## Tools

- `get_project_structure` - Get overview of the project
- `get_backend_info` - Get backend services information
- `get_frontend_info` - Get frontend architecture information

## Integration

To use this MCP server with Continue or other MCP clients, add the configuration from `config.json` to your client's MCP settings.

For Continue, add to your `~/.continue/config.json`:

```json
{
  "mcpServers": {
    "mylg-app": {
      "command": "node",
      "args": ["D:\\WEB DEVELOPMENT\\kiro-env\\mylg-app\\.mcp\\server.js"]
    }
  }
}
```
