#!/usr/bin/env node

/**
 * MCP Server for mylg-app
 * Provides context and tools for the project management application
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

// Create MCP server
const server = new Server(
  {
    name: 'mylg-app-mcp',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Register tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'get_project_structure',
        description: 'Get the structure of the mylg-app project',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'get_backend_info',
        description: 'Get information about backend services and Lambda functions',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'get_frontend_info',
        description: 'Get information about frontend React components and structure',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  switch (name) {
    case 'get_project_structure':
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              description: 'mylg-app is a full-stack project management application',
              structure: {
                backend: 'AWS Lambda functions, DynamoDB, S3, Cognito',
                frontend: 'React + TypeScript with Vite',
                features: [
                  'Authentication',
                  'Project Management',
                  'Messaging/Chat',
                  'File Management',
                  'Budget Tracking',
                  'Calendar/Timeline',
                  'Real-time WebSocket notifications',
                ],
              },
            }, null, 2),
          },
        ],
      };

    case 'get_backend_info':
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              services: [
                'auth - Cognito authentication handlers',
                'messages - Project messaging system',
                'projects - Project CRUD operations',
                'user - User profile management',
                'websocket - Real-time communication',
                'create-gallery - PDF to gallery conversion',
              ],
              infrastructure: 'Serverless Framework',
              database: 'DynamoDB',
              storage: 'S3',
            }, null, 2),
          },
        ],
      };

    case 'get_frontend_info':
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              framework: 'React 18 with TypeScript',
              buildTool: 'Vite',
              mainFeatures: [
                'Dashboard with project overview',
                'Project detail pages',
                'Real-time messaging',
                'File management and galleries',
                'Budget tracking and invoicing',
                'Calendar and timeline views',
              ],
              styling: 'CSS Modules + custom CSS architecture',
            }, null, 2),
          },
        ],
      };

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
});

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('mylg-app MCP server running on stdio');
}

main().catch((error) => {
  console.error('Server error:', error);
  process.exit(1);
});
