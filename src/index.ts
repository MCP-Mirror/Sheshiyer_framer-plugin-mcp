#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import fs from 'fs-extra';
import path from 'path';

interface CreatePluginArgs {
  name: string;
  description: string;
  outputPath: string;
  web3Features?: string[];
}

interface BuildPluginArgs {
  pluginPath: string;
}

interface PackageJson {
  name: string;
  version: string;
  description: string;
  main: string;
  scripts: Record<string, string>;
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
}

class FramerPluginServer {
  private server: Server;

  constructor() {
    this.server = new Server(
      {
        name: 'framer-plugin',
        version: '0.1.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupToolHandlers();
    
    // Error handling
    this.server.onerror = (error: Error) => console.error('[MCP Error]', error);
    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'create_plugin',
          description: 'Create a new Framer plugin project with web3 capabilities',
          inputSchema: {
            type: 'object',
            properties: {
              name: {
                type: 'string',
                description: 'Plugin name'
              },
              description: {
                type: 'string',
                description: 'Plugin description'
              },
              outputPath: {
                type: 'string',
                description: 'Output directory path'
              },
              web3Features: {
                type: 'array',
                items: {
                  type: 'string',
                  enum: ['wallet-connect', 'contract-interaction', 'nft-display']
                },
                description: 'Web3 features to include'
              }
            },
            required: ['name', 'description', 'outputPath']
          }
        },
        {
          name: 'build_plugin',
          description: 'Build a Framer plugin project',
          inputSchema: {
            type: 'object',
            properties: {
              pluginPath: {
                type: 'string',
                description: 'Path to plugin directory'
              }
            },
            required: ['pluginPath']
          }
        }
      ]
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      switch (request.params.name) {
        case 'create_plugin':
          return this.handleCreatePlugin(request.params.arguments as unknown as CreatePluginArgs);
        case 'build_plugin':
          return this.handleBuildPlugin(request.params.arguments as unknown as BuildPluginArgs);
        default:
          throw new McpError(
            ErrorCode.MethodNotFound,
            `Unknown tool: ${request.params.name}`
          );
      }
    });
  }

  private async handleCreatePlugin(args: CreatePluginArgs) {
    try {
      const pluginDir = path.resolve(args.outputPath);
      await fs.ensureDir(pluginDir);

      // Create package.json
      const packageJson: PackageJson = {
        name: args.name,
        version: '1.0.0',
        description: args.description,
        main: 'dist/index.js',
        scripts: {
          build: 'vite build',
          dev: 'vite'
        },
        dependencies: {
          '@framer/framer.motion': '^10.0.0',
          'react': '^18.2.0',
          'react-dom': '^18.2.0'
        },
        devDependencies: {
          '@types/react': '^18.2.0',
          'typescript': '^5.0.0',
          'vite': '^4.0.0',
          '@vitejs/plugin-react': '^4.0.0'
        }
      };

      // Add web3 dependencies if features are requested
      if (args.web3Features?.includes('wallet-connect')) {
        packageJson.dependencies = {
          ...packageJson.dependencies,
          '@web3-react/core': '^8.2.0',
          '@web3-react/injected-connector': '^6.0.7',
          'ethers': '^6.7.0'
        };
      }

      await fs.writeJSON(path.join(pluginDir, 'package.json'), packageJson, { spaces: 2 });

      // Create tsconfig.json
      const tsConfig = {
        compilerOptions: {
          target: 'ES2020',
          lib: ['DOM', 'DOM.Iterable', 'ESNext'],
          module: 'ESNext',
          skipLibCheck: true,
          moduleResolution: 'bundler',
          allowImportingTsExtensions: true,
          resolveJsonModule: true,
          isolatedModules: true,
          noEmit: true,
          jsx: 'react-jsx',
          strict: true,
          noUnusedLocals: true,
          noUnusedParameters: true,
          noFallthroughCasesInSwitch: true
        },
        include: ['src'],
        references: [{ path: './tsconfig.node.json' }]
      };

      await fs.writeJSON(path.join(pluginDir, 'tsconfig.json'), tsConfig, { spaces: 2 });

      // Create tsconfig.node.json
      const tsNodeConfig = {
        compilerOptions: {
          composite: true,
          skipLibCheck: true,
          module: 'ESNext',
          moduleResolution: 'bundler',
          allowSyntheticDefaultImports: true
        },
        include: ['vite.config.ts']
      };

      await fs.writeJSON(path.join(pluginDir, 'tsconfig.node.json'), tsNodeConfig, { spaces: 2 });

      // Create vite.config.ts
      const viteConfig = `
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    lib: {
      entry: 'src/index.tsx',
      name: '${args.name}',
      formats: ['es'],
      fileName: 'index'
    },
    rollupOptions: {
      external: ['react', 'react-dom'],
      output: {
        globals: {
          react: 'React',
          'react-dom': 'ReactDOM'
        }
      }
    }
  }
});
`;

      await fs.writeFile(path.join(pluginDir, 'vite.config.ts'), viteConfig);

      // Create src directory and base files
      const srcDir = path.join(pluginDir, 'src');
      await fs.ensureDir(srcDir);

      // Create index.tsx
      let indexContent = `
import { addPropertyControls, ControlType } from 'framer';
import { motion } from 'framer-motion';
import React from 'react';

export default function ${args.name.replace(/-/g, '_')}() {
  return (
    <motion.div
      style={{
        width: 200,
        height: 200,
        backgroundColor: '#09F',
        borderRadius: 20,
      }}
      whileHover={{ scale: 1.1 }}
      whileTap={{ scale: 0.9 }}
    />
  );
}

addPropertyControls(${args.name.replace(/-/g, '_')}, {
  text: {
    type: ControlType.String,
    title: 'Text',
    defaultValue: 'Hello World',
  },
});
`;

      if (args.web3Features?.includes('wallet-connect')) {
        indexContent = `
import { addPropertyControls, ControlType } from 'framer';
import { motion } from 'framer-motion';
import React from 'react';
import { Web3ReactProvider, useWeb3React } from '@web3-react/core';
import { InjectedConnector } from '@web3-react/injected-connector';
import { ethers } from 'ethers';

const injected = new InjectedConnector({
  supportedChainIds: [1, 3, 4, 5, 42],
});

function Web3Button() {
  const { activate, active, account, library } = useWeb3React();

  const connect = async () => {
    try {
      await activate(injected);
    } catch (error) {
      console.error('Error connecting:', error);
    }
  };

  return (
    <motion.button
      onClick={connect}
      whileHover={{ scale: 1.1 }}
      whileTap={{ scale: 0.9 }}
      style={{
        padding: '10px 20px',
        borderRadius: 8,
        backgroundColor: active ? '#4CAF50' : '#09F',
        color: 'white',
        border: 'none',
        cursor: 'pointer',
      }}
    >
      {active ? \`Connected: \${account?.slice(0, 6)}...\${account?.slice(-4)}\` : 'Connect Wallet'}
    </motion.button>
  );
}

export default function ${args.name.replace(/-/g, '_')}() {
  return (
    <Web3ReactProvider getLibrary={(provider) => new ethers.BrowserProvider(provider)}>
      <Web3Button />
    </Web3ReactProvider>
  );
}

addPropertyControls(${args.name.replace(/-/g, '_')}, {
  text: {
    type: ControlType.String,
    title: 'Text',
    defaultValue: 'Connect Wallet',
  },
});
`;
      }

      await fs.writeFile(path.join(srcDir, 'index.tsx'), indexContent);

      return {
        content: [
          {
            type: 'text',
            text: `Successfully created Framer plugin project at ${pluginDir}`
          }
        ]
      };
    } catch (error) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to create plugin: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  private async handleBuildPlugin(args: BuildPluginArgs) {
    try {
      const pluginDir = path.resolve(args.pluginPath);
      
      // Verify plugin directory exists
      if (!await fs.pathExists(pluginDir)) {
        throw new Error(`Plugin directory not found: ${pluginDir}`);
      }

      // Run build command
      const { execSync } = require('child_process');
      execSync('npm run build', { cwd: pluginDir, stdio: 'inherit' });

      return {
        content: [
          {
            type: 'text',
            text: `Successfully built plugin at ${pluginDir}`
          }
        ]
      };
    } catch (error) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to build plugin: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Framer Plugin MCP server running on stdio');
  }
}

const server = new FramerPluginServer();
server.run().catch(console.error);