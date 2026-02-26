import * as vscode from 'vscode';
import { CDPManager } from './cdp';

let cdpManager: CDPManager | undefined;
let statusBarItem: vscode.StatusBarItem;

export function activate(context: vscode.ExtensionContext) {
    console.log('[Autogravity] Extension activated.');

    // 1. 创建位于右下的 Status Bar 按钮
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBarItem.command = 'autogravity.toggleAutoAccept';
    statusBarItem.text = '$(circle-outline) Auto Accept: OFF';
    statusBarItem.tooltip = 'Click to toggle Autogravity Auto-Accept polling';
    statusBarItem.show();
    context.subscriptions.push(statusBarItem);

    // 2. 注册 Toggle 命令
    const toggleCommand = vscode.commands.registerCommand('autogravity.toggleAutoAccept', async () => {
        if (!cdpManager) {
            const config = vscode.workspace.getConfiguration('autogravity');
            const debugPort = config.get<number>('debuggingPort', 9222);
            cdpManager = new CDPManager(debugPort);
        }

        const isPolling = await cdpManager.toggleAutoAccept();

        if (isPolling) {
            statusBarItem.text = '$(pass-filled) Auto Accept: ON';
            statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
        } else {
            statusBarItem.text = '$(circle-outline) Auto Accept: OFF';
            statusBarItem.backgroundColor = undefined;
        }
    });

    const startCommand = vscode.commands.registerCommand('autogravity.start', async () => {
        if (!cdpManager || !cdpManager.isPolling) {
            vscode.commands.executeCommand('autogravity.toggleAutoAccept');
        } else {
            vscode.window.showInformationMessage('Autogravity Auto-Accept is already running!');
        }
    });

    const stopCommand = vscode.commands.registerCommand('autogravity.stop', () => {
        if (cdpManager && cdpManager.isPolling) {
            vscode.commands.executeCommand('autogravity.toggleAutoAccept');
        }
    });

    context.subscriptions.push(startCommand, stopCommand, toggleCommand);
}

export function deactivate() {
    if (cdpManager) {
        cdpManager.disconnect();
    }
    if (statusBarItem) {
        statusBarItem.dispose();
    }
}
