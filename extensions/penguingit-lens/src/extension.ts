import * as vscode from 'vscode';
import { spawn } from 'child_process';
import { EngineClient } from './engineClient';
import { StatusBarManager } from './statusBar';

let engineClient: EngineClient | null = null;
let statusBarManager: StatusBarManager | null = null;

export async function activate(context: vscode.ExtensionContext) {
  const config = vscode.workspace.getConfiguration('penguingit');
  const socketPath = config.get<string>('socketPath', '/tmp/penguingit-mcp.sock');
  const tcpPort = config.get<number>('tcpPort', 34284);
  const useTcp = config.get<boolean>('useTcp', process.platform === 'win32');

  engineClient = new EngineClient({ socketPath, tcpPort, useTcp });
  statusBarManager = new StatusBarManager(engineClient);

  context.subscriptions.push(statusBarManager);

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand('penguingit.showMenu', () => {
      statusBarManager?.showMenu();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('penguingit.checkStatus', async () => {
      if (!engineClient) return;
      const isConnected = await engineClient.ping();
      if (isConnected) {
        vscode.window.showInformationMessage('PenguinGit Engine is connected and active.');
      } else {
        const choice = await vscode.window.showWarningMessage(
          'PenguinGit Engine is offline.',
          'Start Engine',
          'Open Desktop App'
        );
        if (choice === 'Start Engine') {
          vscode.commands.executeCommand('penguingit.startEngine');
        } else if (choice === 'Open Desktop App') {
          vscode.commands.executeCommand('penguingit.openDesktop');
        }
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('penguingit.startEngine', async () => {
      try {
        // Attempt to spawn local penguingit-mcp binary
        const child = spawn('penguingit-mcp', ['--socket', socketPath], {
          detached: true,
          stdio: 'ignore',
        });
        child.unref();

        vscode.window.showInformationMessage('Spawning PenguinGit Engine daemon...');
        
        // Retry connection after 500ms
        setTimeout(async () => {
          if (engineClient) {
            const ok = await engineClient.connect();
            if (ok) {
              vscode.window.showInformationMessage('Connected to PenguinGit Engine!');
            }
          }
        }, 500);
      } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to start Engine daemon: ${err.message}`);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('penguingit.openDesktop', async () => {
      try {
        await vscode.env.openExternal(vscode.Uri.parse('penguingit://open'));
      } catch {
        vscode.window.showErrorMessage('Could not launch PenguinGit Desktop App.');
      }
    })
  );

  // Initial connection attempt
  const connected = await engineClient.connect();
  if (!connected) {
    vscode.window.showWarningMessage(
      'PenguinGit Engine isn\'t running. Start the engine for inline blame and graph views.',
      'Start Engine',
      'Learn More'
    ).then((choice) => {
      if (choice === 'Start Engine') {
        vscode.commands.executeCommand('penguingit.startEngine');
      }
    });
  }
}

export function deactivate() {
  if (engineClient) {
    engineClient.disconnect();
    engineClient = null;
  }
}
