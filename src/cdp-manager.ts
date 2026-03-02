/**
 * CDPManager — 顶层协调器
 * 
 * 职责单一：协调连接管理、按钮扫描和轮询控制。
 * 具体的规则、扫描、点击逻辑已拆分至子模块。
 * 
 * 模块结构:
 *   src/
 *   ├── cdp-manager.ts        ← 本文件（顶层协调器）
 *   ├── connection/
 *   │   └── cdp-client.ts     ← CDP 连接管理
 *   ├── scanner/
 *   │   ├── button-finder.ts  ← 按钮查找表达式构建
 *   │   └── click-executor.ts ← 点击执行器
 *   └── rules/
 *       ├── exclude-rules.ts  ← 排除规则
 *       └── include-rules.ts  ← 命中规则
 */

import * as vscode from 'vscode';
import { CDPConnection } from './connection';
import { buildFindButtonExpression, executeClick } from './scanner';

export class CDPManager {
    private connection: CDPConnection;
    private pollTimer: ReturnType<typeof setInterval> | null = null;
    public isPolling: boolean = false;

    constructor(debugPort: number) {
        this.connection = new CDPConnection(debugPort);
    }

    // ==================== 轮询控制 ====================

    /**
     * 切换 Auto-Accept 轮询状态
     * @returns 切换后是否处于轮询中
     */
    public async toggleAutoAccept(): Promise<boolean> {
        if (!this.connection.hasClients) {
            const connected = await this.connection.connect();
            if (!connected) {
                vscode.window.showErrorMessage(
                    `Autogravity: 无法建立 CDP 连接。请确认参数 --remote-debugging-port`
                );
                return false;
            }
        }

        this.isPolling = !this.isPolling;

        if (this.isPolling) {
            this.startPolling();
            vscode.window.showInformationMessage(
                `Autogravity: Auto-Accept 开启！已连接 ${this.connection.clientCount} 个区域，使用 CDP Input 模拟点击。`
            );
            return true;
        } else {
            await this.stopPolling();
            vscode.window.showInformationMessage('Autogravity: Auto-Accept 已停止！');
            return false;
        }
    }

    /**
     * 启动轮询定时器
     */
    private startPolling(): void {
        this.pollTimer = setInterval(async () => {
            try {
                await this.scanAndClick();
            } catch (e) {
                // 静默处理，避免中断轮询
            }
        }, 1000);
    }

    /**
     * 停止轮询定时器，并清理页面中可能遗留的旧版注入定时器
     */
    private async stopPolling(): Promise<void> {
        if (this.pollTimer) {
            clearInterval(this.pollTimer);
            this.pollTimer = null;
        }

        // 清理页面中可能遗留的旧版注入定时器
        const cleanupCode = `
            if (window.__autogravityTimer) {
                clearInterval(window.__autogravityTimer);
                window.__autogravityTimer = null;
            }
            if (window.__autogravityKeeper) {
                clearInterval(window.__autogravityKeeper);
                window.__autogravityKeeper = null;
            }
            const oldBtn = document.getElementById('autogravity-btn');
            if (oldBtn) oldBtn.remove();
        `;
        await this.connection.evaluateAll(cleanupCode);
    }

    // ==================== 扫描和点击 ====================

    /**
     * 核心扫描逻辑：在所有连接的 target 中查找并点击目标按钮
     */
    private async scanAndClick(): Promise<void> {
        // 每次扫描前，动态检查是否有新的 Manager target 需要连接
        await this.connection.ensureManagerConnected();

        const expression = buildFindButtonExpression();

        for (const client of this.connection.clients) {
            try {
                const result = await client.Runtime.evaluate({ expression, returnByValue: true });

                if (result.result.value) {
                    await executeClick(client, result.result.value);
                    return; // 每次扫描只点击一个按钮
                }
            } catch (err: any) {
                // 连接可能已断开，忽略
                if (err.message && (
                    err.message.includes('not attached') ||
                    err.message.includes('closed') ||
                    err.message.includes('ECONNREFUSED')
                )) {
                    console.log('[Autogravity CDP] Client disconnected, will reconnect');
                }
            }
        }
    }

    // ==================== 生命周期 ====================

    /**
     * 断开所有连接并清理所有资源
     */
    public disconnect(): void {
        if (this.pollTimer) {
            clearInterval(this.pollTimer);
            this.pollTimer = null;
        }
        this.connection.disconnect();
        this.isPolling = false;
    }
}
