/**
 * MCP Client Wrapper
 * Singleton pattern for efficient MCP server communication
 * Maintains connections and handles tool calls with minimal overhead
 */

import { spawn, ChildProcess } from 'child_process';

interface MCPConnection {
  process: ChildProcess;
  ready: Promise<void>;
  callId: number;
}

export class MCPClient {
  private static instance: MCPClient;
  private connections: Map<string, MCPConnection> = new Map();

  private constructor() {}

  public static async getInstance(): Promise<MCPClient> {
    if (!MCPClient.instance) {
      MCPClient.instance = new MCPClient();
    }
    return MCPClient.instance;
  }

  /**
   * Connect to an MCP server on-demand
   */
  private async connect(serverName: string): Promise<MCPConnection> {
    if (this.connections.has(serverName)) {
      return this.connections.get(serverName)!;
    }

    // Get server command from configuration
    const command = this.getServerCommand(serverName);

    const process = spawn(command.cmd, command.args, {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    const ready = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Timeout connecting to ${serverName}`));
      }, 5000);

      process.stdout?.once('data', () => {
        clearTimeout(timeout);
        resolve();
      });

      process.on('error', reject);
    });

    const connection: MCPConnection = {
      process,
      ready,
      callId: 0
    };

    this.connections.set(serverName, connection);
    await ready;

    return connection;
  }

  /**
   * Call a tool on an MCP server
   */
  public async call(
    serverName: string,
    toolName: string,
    params: any
  ): Promise<any> {
    const connection = await this.connect(serverName);

    const request = {
      jsonrpc: '2.0',
      id: ++connection.callId,
      method: `tools/${toolName}`,
      params
    };

    return new Promise((resolve, reject) => {
      const responseHandler = (data: Buffer) => {
        try {
          const response = JSON.parse(data.toString());
          if (response.id === request.id) {
            connection.process.stdout?.removeListener('data', responseHandler);
            if (response.error) {
              reject(new Error(response.error.message));
            } else {
              resolve(response.result);
            }
          }
        } catch (e) {
          // Partial data, wait for more
        }
      };

      connection.process.stdout?.on('data', responseHandler);
      connection.process.stdin?.write(JSON.stringify(request) + '\\n');
    });
  }

  /**
   * Get server command configuration
   */
  private getServerCommand(serverName: string): {cmd: string, args: string[]} {
    // In production, this would read from configuration
    // For now, returning known server commands
    const commands: Record<string, {cmd: string, args: string[]}> = {
      'chrome-devtools': {
        cmd: 'npx',
        args: ['chrome-devtools-mcp@0.10.2']
      },
      'github': {
        cmd: 'github-mcp',
        args: []
      },
      'filesystem': {
        cmd: 'filesystem-mcp',
        args: ['--allowed-directories', '.']
      },
      'memory': {
        cmd: 'memory-mcp',
        args: []
      }
    };

    if (!commands[serverName]) {
      throw new Error(`Unknown MCP server: ${serverName}`);
    }

    return commands[serverName];
  }

  /**
   * Disconnect from all MCP servers
   */
  public async disconnect(): Promise<void> {
    for (const [name, connection] of this.connections) {
      connection.process.kill();
    }
    this.connections.clear();
  }
}