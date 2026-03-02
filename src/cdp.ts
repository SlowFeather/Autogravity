import CDP from 'chrome-remote-interface';
import * as vscode from 'vscode';
import * as http from 'http';

export class CDPManager {
    private clients: any[] = [];
    private pollTimer: ReturnType<typeof setInterval> | null = null;

    constructor(private debugPort: number) { }

    public async connect(): Promise<boolean> {
        try {
            const targets = await this.getTargets();
            // 过滤出所有有 WebSocket 调试地址的页面或 Webview 或 iframe
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
                    const client = await CDP({ target: target.webSocketDebuggerUrl });
                    await client.Runtime.enable();
                    this.clients.push(client);
                    console.log(`[Autogravity CDP] Attached to: ${target.title || target.type}`);
                } catch (e) {
                    console.error(`[Autogravity CDP] Failed to attach to ${target.title}:`, e);
                }
            }

            if (this.clients.length > 0) {
                vscode.window.setStatusBarMessage(`Autogravity: Connected to ${this.clients.length} UI areas`, 3000);
                return true;
            }
            return false;
        } catch (err: any) {
            console.error('[Autogravity CDP] connection error:', err);
            return false;
        }
    }

    private getTargets(): Promise<any[]> {
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

    public isPolling: boolean = false;

    // ========== 按钮查找的 JS 表达式 ==========
    // 在页面上下文中执行：找到目标按钮，返回其 bounding rect 和文字
    // 如果找不到，返回 null
    private getFindButtonExpression(): string {
        return `
            (() => {
                const selectors = ['button', 'div[role="button"]', 'a[role="button"]', '.monaco-button', 'vscode-button', '.monaco-text-button', '.chat-tool-button', 'a', '.cursor-pointer', '.btn', 'span[role="button"]'];

                // 首先专门处理 "Search for files edited by Agent" 这个 Quick Pick 下拉选单
                const quickInput = document.querySelector('.quick-input-widget');
                if (quickInput && quickInput.offsetWidth > 0) {
                    const inputNode = quickInput.querySelector('input');
                    const hasAgentText = (inputNode && (inputNode.getAttribute('placeholder') || '').includes('edited by Agent'))
                                      || (quickInput.textContent && quickInput.textContent.includes('edited by Agent'));
                    if (hasAgentText) {
                        const firstRow = quickInput.querySelector('.monaco-list-row');
                        if (firstRow) {
                            const rect = firstRow.getBoundingClientRect();
                            if (rect.width > 0 && rect.height > 0) {
                                return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, text: 'quick-pick-row' };
                            }
                        }
                    }
                }

                // ========== 辅助函数：判断元素是否在 Diff 工具栏 / 编辑器标题栏中 ==========
                // Diff 工具栏虽然是 monaco-editor 的子元素，但不应被排除
                function isInDiffToolbar(el) {
                    let node = el;
                    for (let i = 0; i < 10 && node; i++) {
                        const cls = typeof node.className === 'string' ? node.className : '';
                        if (cls.includes('diff-editor') && cls.includes('toolbar')) return true;
                        if (cls.includes('diff-review')) return true;
                        if (cls.includes('editor-actions')) return true;
                        if (cls.includes('title-actions')) return true;
                        if (cls.includes('action-bar')) return true;
                        node = node.parentElement;
                    }
                    return false;
                }

                const elements = Array.from(document.querySelectorAll(selectors.join(',')));

                // 定义排除规则
                const excludeRules = [
                    // 1. 排除本插件的 Auto Accept 切换按钮自身
                    (btn, text) => text.includes('auto accept'),
                    // 2. 排除 "Ran Command" / "Running command" 块中的 "always run"
                    (btn, text) => {
                        if (!text.includes('always run')) return false;
                        let curr = btn.parentElement;
                        for (let i = 0; i < 15 && curr; i++) {
                            const parentText = (curr.textContent || '').toLowerCase();
                            if (parentText.includes('ran command') || parentText.includes('running command') || parentText.includes('ran background command')) {
                                return true;
                            }
                            curr = curr.parentElement;
                        }
                        return false;
                    },
                    // 3. 排除聊天消息框或外层容器引发的误触
                    (btn, text) => {
                        // 带快捷键后缀如 "Accept Changes Ctrl+↵" 可能较长，放宽到 80
                        if (text.length > 80) return true;
                        if (typeof btn.className === 'string' &&
                           (btn.className.includes('monaco-list-row') || btn.className.includes('chat-row'))) {
                            return true;
                        }
                        if (btn.querySelectorAll('p, pre, code').length > 0) return true;
                        return false;
                    },
                    // 4. 排除 "Run command?" 标题文字
                    (btn, text) => {
                        if (text === 'run command' || text === 'run command?') return true;
                        if (text.includes('?') && text.length > 5 && text.startsWith('run')) return true;
                        return false;
                    },
                    // 5. 排除 "Always run" 下拉选单（即使不在 Ran command 区块中）
                    //    因为 "Always run" 是一个 listbox 下拉菜单，不是我们要点击的确认按钮
                    (btn, text) => {
                        if (text.trim() === 'always run') {
                            // 如果是 headlessui listbox button，排除它
                            if (btn.getAttribute('aria-haspopup') === 'listbox') return true;
                            // 如果 className 里有 listbox 相关的标识也排除
                            if (typeof btn.id === 'string' && btn.id.includes('listbox')) return true;
                        }
                        return false;
                    },
                    // 6. 排除资源管理器（侧边栏）中的元素，防止误点名字含 run 的文件
                    (btn, text) => {
                        let curr = btn;
                        for (let i = 0; i < 25 && curr; i++) {
                            const cls = typeof curr.className === 'string' ? curr.className : '';
                            if (cls.includes('sidebar') || cls.includes('auxiliarybar') ||
                                cls.includes('explorer-folders-view') || cls.includes('explorer-viewlet') ||
                                cls.includes('panel-left') || cls.includes('activitybar')) {
                                return true;
                            }
                            curr = curr.parentElement;
                        }
                        return false;
                    },
                    // 7. 排除编辑器标签栏中的元素（标签页标题可能包含 run 等关键字）
                    (btn, text) => {
                        let curr = btn;
                        for (let i = 0; i < 15 && curr; i++) {
                            const cls = typeof curr.className === 'string' ? curr.className : '';
                            if (cls.includes('tabs-container') || cls.includes('editor-group-header') ||
                                cls.includes('title-tabs') ||
                                (curr.classList && curr.classList.contains('tab'))) {
                                return true;
                            }
                            curr = curr.parentElement;
                        }
                        return false;
                    },
                    // 8. 排除代码编辑器内部的元素（源码中的 run/accept 等关键字不应被点击）
                    //    但 Diff 工具栏中的按钮不应被排除（它们也是 monaco-editor 的子元素）
                    (btn, text) => {
                        // 先判断是否在 Diff 工具栏 / editor-actions 中，如果是则不排除
                        if (isInDiffToolbar(btn)) return false;
                        let curr = btn;
                        for (let i = 0; i < 20 && curr; i++) {
                            const cls = typeof curr.className === 'string' ? curr.className : '';
                            if (cls.includes('monaco-editor') || cls.includes('lines-content') ||
                                cls.includes('view-lines') || cls.includes('editor-instance')) {
                                return true;
                            }
                            curr = curr.parentElement;
                        }
                        return false;
                    }
                ];

                // 定义命中规则
                const includeRules = [
                    (btn, text) => {
                        const t = text.trim();
                        const isPrimary = typeof btn.className === 'string' && btn.className.includes('primary');
                        if (isPrimary && (t === 'run' || t === 'accept' || t === 'yes' || t === 'continue' || t === 'resume' || t === 'retry' || t === 'proceed')) {
                            return true;
                        }
                        if (t === 'accept' || t === 'accept all' || t === 'accept changes' || t === 'run' || t === 'always allow' || t === 'approve' || t === 'continue' || t === 'yes' || t === 'allow this conversation' || t === 'resume' || t === 'retry' || t === 'proceed') return true;
                        // 兼容带快捷键后缀的按钮文本，如 "accept changes ctrl+↵" 或 "accept all alt+enter"
                        if ((t.startsWith('accept') || t.startsWith('approve') || t.startsWith('allow') || t.startsWith('resume') || t.startsWith('proceed')) && t.length < 80) return true;
                        if (t.includes('run') && (t.includes('alt+') || t.includes('↵') || t.includes('enter') || t.includes('cmd+') || t.includes('ctrl+'))) {
                            return true;
                        }
                        return false;
                    },
                    (btn, text) => {
                        if (typeof btn.className !== 'string') return false;
                        return btn.className.includes('keep-changes') ||
                               btn.className.includes('diff-hunk-button accept') ||
                               (btn.className.includes('monaco-button') && (text.includes('accept') || text.includes('accept all'))) ||
                               (btn.className.includes('center-button') && (text.includes('edited file') || text.includes('accept all')));
                    },
                    // "View X edited file(s)" 按钮（兼容单复数）
                    (btn, text) => /view \d+ edited file/.test(text),
                    (btn, text) => {
                        const isCheckIcon = btn.classList.contains('codicon-check') ||
                                           btn.querySelector('.codicon-check') !== null;
                        const hasAcceptTitle = (btn.getAttribute('title') || '').toLowerCase().includes('accept');
                        return isCheckIcon || hasAcceptTitle;
                    }
                ];

                const acceptBtn = elements.find(b => {
                    if (b.offsetWidth === 0 && b.offsetHeight === 0) return false;
                    if (b.disabled || (typeof b.className === 'string' && b.className.includes('disabled'))) return false;
                    const text = (b.textContent || "").toLowerCase();
                    if (excludeRules.some(rule => rule(b, text))) return false;
                    return includeRules.some(rule => rule(b, text));
                });

                if (acceptBtn) {
                    const rect = acceptBtn.getBoundingClientRect();
                    if (rect.width > 0 && rect.height > 0) {
                        return {
                            x: rect.x,
                            y: rect.y,
                            width: rect.width,
                            height: rect.height,
                            text: (acceptBtn.textContent || acceptBtn.getAttribute('title') || 'Button').trim()
                        };
                    }
                }

                // 如果标准选择器没找到，最后尝试一个更宽泛的搜索：
                // 在所有可见元素中搜索 textContent 精确等于 "Run" 的叶子节点的可点击祖先
                const allEls = Array.from(document.querySelectorAll('*'));
                for (const el of allEls) {
                    // 只看叶子文本节点
                    const directText = Array.from(el.childNodes)
                        .filter(n => n.nodeType === 3)
                        .map(n => (n.nodeValue || '').trim().toLowerCase())
                        .join('');
                    if (!['run', 'accept', 'continue', 'resume', 'retry', 'proceed', 'yes', 'approve'].includes(directText)) continue;
                    if (directText === 'reject') continue; // Skip Reject button
                    if (el.offsetWidth === 0 && el.offsetHeight === 0) continue;

                    // 排除代码编辑器、侧边栏、标签栏中的元素
                    let insideExcluded = false;
                    let checkEl = el;
                    for (let j = 0; j < 25 && checkEl; j++) {
                        const cls = typeof checkEl.className === 'string' ? checkEl.className : '';
                        if (cls.includes('monaco-editor') || cls.includes('lines-content') ||
                            cls.includes('view-lines') || cls.includes('editor-instance') ||
                            cls.includes('sidebar') || cls.includes('auxiliarybar') ||
                            cls.includes('tabs-container') || cls.includes('editor-group-header') ||
                            cls.includes('explorer-folders-view') || cls.includes('activitybar') ||
                            (checkEl.classList && checkEl.classList.contains('tab'))) {
                            insideExcluded = true;
                            break;
                        }
                        checkEl = checkEl.parentElement;
                    }
                    if (insideExcluded) continue;

                    // 往上找可点击的祖先（最多 5 层）
                    let clickTarget = el;
                    let curr = el;
                    for (let i = 0; i < 5 && curr; i++) {
                        if (curr.tagName === 'BUTTON' || curr.tagName === 'A' ||
                            curr.getAttribute('role') === 'button' ||
                            (typeof curr.className === 'string' && (curr.className.includes('cursor-pointer') || curr.className.includes('btn')))) {
                            clickTarget = curr;
                            break;
                        }
                        curr = curr.parentElement;
                    }

                    const rect = clickTarget.getBoundingClientRect();
                    if (rect.width > 0 && rect.height > 0) {
                        return {
                            x: rect.x,
                            y: rect.y,
                            width: rect.width,
                            height: rect.height,
                            text: directText
                        };
                    }
                }

                return null;
            })()
        `;
    }

    // ========== 动态补连：发现新出现的 Manager target 并加入 clients ==========
    private async ensureManagerConnected() {
        let targets: any[];
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

        // 获取已连接的 wsUrl 列表，避免重复连接
        const connectedUrls = new Set(
            (this.clients as any[]).map(c => c._ws?.url || c.__wsUrl || '').filter(Boolean)
        );

        for (const t of managerTargets) {
            // 用简单标记：在 client 上挂 __wsUrl 来追踪
            const alreadyConnected = (this.clients as any[]).some(
                c => c.__wsUrl === t.webSocketDebuggerUrl
            );
            if (alreadyConnected) continue;

            try {
                const client = await CDP({ target: t.webSocketDebuggerUrl }) as any;
                await client.Runtime.enable();
                client.__wsUrl = t.webSocketDebuggerUrl; // 标记，用于去重
                this.clients.push(client);
                console.log(`[Autogravity CDP] Dynamically attached to Manager target: ${t.webSocketDebuggerUrl}`);
            } catch (e: any) {
                console.log(`[Autogravity CDP] Failed to attach to Manager: ${e.message}`);
            }
        }
    }

    // ========== 核心：扫描按钮并通过 CDP Input 模拟真实鼠标点击 ==========
    private async scanAndClick() {
        // 每次扫描前，动态检查是否有新的 Manager target 需要连接
        await this.ensureManagerConnected();

        const expression = this.getFindButtonExpression();

        for (const client of this.clients) {
            try {
                const result = await client.Runtime.evaluate({ expression, returnByValue: true });

                if (result.result.value) {
                    const { x, y, width, height, text } = result.result.value;
                    const clickX = Math.round(x + width / 2);
                    const clickY = Math.round(y + height / 2);

                    // 方法一：CDP Input.dispatchMouseEvent —— 模拟真实硬件鼠标点击
                    try {
                        await client.Input.dispatchMouseEvent({
                            type: 'mousePressed',
                            x: clickX,
                            y: clickY,
                            button: 'left',
                            clickCount: 1
                        });
                        await client.Input.dispatchMouseEvent({
                            type: 'mouseReleased',
                            x: clickX,
                            y: clickY,
                            button: 'left',
                            clickCount: 1
                        });
                        console.log(`[Autogravity] CDP Input clicked '${text}' at (${clickX}, ${clickY})`);
                    } catch (inputErr) {
                        // 方法二：如果 Input 域不可用，回退到 JS 点击
                        console.log(`[Autogravity] Input.dispatchMouseEvent failed, falling back to JS click`);
                        const fallbackCode = `
                            (() => {
                                const el = document.elementFromPoint(${clickX}, ${clickY});
                                if (el) {
                                    if (typeof el.focus === 'function') try { el.focus(); } catch(e) {}
                                    ['mousedown', 'mouseup', 'click'].forEach(evt => {
                                        try { el.dispatchEvent(new MouseEvent(evt, { bubbles: true, cancelable: true, view: window })); } catch(e) {}
                                    });
                                    if (typeof el.click === 'function') try { el.click(); } catch(e) {}
                                    return 'JS clicked: ' + (el.textContent || '').trim().substring(0, 30);
                                }
                                return 'No element at point';
                            })()
                        `;
                        const fallbackResult = await client.Runtime.evaluate({ expression: fallbackCode, returnByValue: true });
                        console.log(`[Autogravity] Fallback result:`, fallbackResult.result.value);
                    }

                    return; // 每次扫描只点击一个按钮
                }
            } catch (err: any) {
                // 连接可能已断开，忽略
                if (err.message && (err.message.includes('not attached') || err.message.includes('closed') || err.message.includes('ECONNREFUSED'))) {
                    console.log('[Autogravity CDP] Client disconnected, will reconnect');
                }
            }
        }
    }

    public async toggleAutoAccept(): Promise<boolean> {
        if (this.clients.length === 0) {
            const connected = await this.connect();
            if (!connected) {
                vscode.window.showErrorMessage(`Autogravity: 无法建立 CDP 连接。请确认参数 --remote-debugging-port=${this.debugPort}`);
                return false;
            }
        }

        this.isPolling = !this.isPolling;

        if (this.isPolling) {
            // 启动 Node 端轮询定时器
            this.pollTimer = setInterval(async () => {
                try {
                    await this.scanAndClick();
                } catch (e) {
                    // 静默处理，避免中断轮询
                }
            }, 1000);

            vscode.window.showInformationMessage(`Autogravity: Auto-Accept 开启！已连接 ${this.clients.length} 个区域，使用 CDP Input 模拟点击。`);
            return true;
        } else {
            // 停止轮询
            if (this.pollTimer) {
                clearInterval(this.pollTimer);
                this.pollTimer = null;
            }
            // 同时清理页面中可能遗留的旧版注入定时器
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
            await this.evaluateAll(cleanupCode);
            vscode.window.showInformationMessage('Autogravity: Auto-Accept 已停止！');
            return false;
        }
    }

    private async evaluateAll(expression: string) {
        for (const client of this.clients) {
            try {
                await client.Runtime.evaluate({ expression });
            } catch (err) {
                console.error('[Autogravity CDP] Injection error on a target:', err);
            }
        }
    }

    public disconnect() {
        if (this.pollTimer) {
            clearInterval(this.pollTimer);
            this.pollTimer = null;
        }
        this.clients.forEach(c => {
            try { c.close(); } catch (e) { }
        });
        this.clients = [];
        this.isPolling = false;
    }
}
