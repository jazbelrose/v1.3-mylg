/**
 * Simple MCP client for testing
 */

// Send a tool list request
const listToolsRequest = {
  jsonrpc: '2.0',
  id: 1,
  method: 'tools/list',
  params: {}
};

console.log('Sending request:', JSON.stringify(listToolsRequest));

// Send a call tool request
const callToolRequest = {
  jsonrpc: '2.0',
  id: 2,
  method: 'tools/call',
  params: {
    name: 'get_project_structure',
    arguments: {}
  }
};

console.log('\nCall tool request:', JSON.stringify(callToolRequest));
