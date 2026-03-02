/**
 * CDP 连接管理
 * 
 * 负责与 Chrome DevTools Protocol 的底层通信：
 * - 获取 debug targets 列表
 * - 建立 / 断开 CDP 客户端连接
 * - 动态发现并连接新出现的 Manager target
 */

import CDP from 'chrome-remote-interface';
import * as http from 'http';

/** CDP target 信息 */
export interface CDPTarget {
    webSocketDebuggerUrl?: string;
    type: string;
    title?: string;
    url?: string;
}

/**
 * CDP 连接客户端管理器
 */
export class CDPConnection {
    private _clients: any[] = [];

    constructor(private debugPort: number) { }

    /** 当前已连接的 CDP 客户端列表 */
    get clients(): any[] {
        return this._clients;
    }

    /** 是否已有连接 */
    get hasClients(): boolean {
        return this._clients.length > 0;
    }

    /** 客户端数量 */
    get clientCount(): number {
        return this._clients.length;
    }

    /**
     * 从 Chrome Debug 端口获取所有可用 targets
     */
    async getTargets(): Promise<CDPTarget[]> {
        return new Promise((resolve, reject) => {
            const req = http.get(`http://127.0.0.1:${this.debugPort}/json`, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        const targets = JSON.parse(data);
                        resolve(targets);
                    } catch (e) {
                        resolve([]);
                    }
                });
            });
            req.on('error', (err) => reject(err));
            req.setTimeout(2000, () => req.destroy());
        });
    }

    /**
     * 连接到所有有效的 debug targets（page / webview / iframe / manager）
     */
    async connect(): Promise<boolean> {
        try {
            const targets = await this.getTargets();
            const validTargets = targets.filter(t =>
                t.webSocketDebuggerUrl && (
                    t.type === 'page' || t.type === 'webview' || t.type === 'iframe' ||
                    (t.title && t.title.toLowerCase().includes('manager')) ||
                    (t.url && t.url.toLowerCase().includes('manager'))
                )
            );
            console.log('[Autogravity CDP] Found targets:', validTargets.map(t => `${t.title}(${t.type})`).join(', '));

            if (validTargets.length === 0) {
                console.log('[Autogravity CDP] No valid targets found. Check --remote-debugging-port');
                return false;
            }

            // 先清理旧连接
            this.disconnect();

            for (const target of validTargets) {
                try {
                    const client = await CDP({ target: target.webSocketDebuggerUrl! });
                    await client.Runtime.enable();
                    this._clients.push(client);
                    console.log(`[Autogravity CDP] Attached to: ${target.title || target.type}`);
                } catch (e) {
                    console.error(`[Autogravity CDP] Failed to attach to ${target.title}:`, e);
                }
            }

            return this._clients.length > 0;
        } catch (err: any) {
            console.error('[Autogravity CDP] connection error:', err);
            return false;
        }
    }

    /**
     * 动态发现并连接新出现的 Manager target（热补连）
     */
    async ensureManagerConnected(): Promise<void> {
        let targets: CDPTarget[];
        try {
            targets = await this.getTargets();
        } catch (e) {
            return; // CDP 端口不可用，跳过
        }

        // 找所有还没有被连接的 Manager target
        const managerTargets = targets.filter(t =>
            t.webSocketDebuggerUrl && (
                (t.title && t.title.toLowerCase().includes('manager')) ||
                (t.url && t.url.toLowerCase().includes('manager'))
            )
        );

        if (managerTargets.length === 0) return;

        for (const t of managerTargets) {
            // 用简单标记：在 client 上挂 __wsUrl 来追踪，避免重复连接
            const alreadyConnected = (this._clients as any[]).some(
                c => c.__wsUrl === t.webSocketDebuggerUrl
            );
            if (alreadyConnected) continue;

            try {
                const client = await CDP({ target: t.webSocketDebuggerUrl! }) as any;
                await client.Runtime.enable();
                client.__wsUrl = t.webSocketDebuggerUrl; // 标记，用于去重
                this._clients.push(client);
                console.log(`[Autogravity CDP] Dynamically attached to Manager target: ${t.webSocketDebuggerUrl}`);
            } catch (e: any) {
                console.log(`[Autogravity CDP] Failed to attach to Manager: ${e.message}`);
            }
        }
    }

    /**
     * 在所有已连接的客户端上执行 JS 表达式
     */
    async evaluateAll(expression: string): Promise<void> {
        for (const client of this._clients) {
            try {
                await client.Runtime.evaluate({ expression });
            } catch (err) {
                console.error('[Autogravity CDP] Injection error on a target:', err);
            }
        }
    }

    /**
     * 断开所有 CDP 连接并清理资源
     */
    disconnect(): void {
        this._clients.forEach(c => {
            try { c.close(); } catch (e) { }
        });
        this._clients = [];
    }
}
