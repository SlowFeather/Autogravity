import CDP from 'chrome-remote-interface';
import * as vscode from 'vscode';
import * as http from 'http';

export class CDPManager {
    private clients: any[] = [];

    constructor(private debugPort: number) { }

    public async connect(): Promise<boolean> {
        try {
            const targets = await this.getTargets();
            // 过滤出所有有 WebSocket 调试地址的页面或 Webview
            const validTargets = targets.filter(t =>
                (t.type === 'page' || t.type === 'webview') && t.webSocketDebuggerUrl
            );

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
            const code = `
                if (!window.__autogravityTimer) {
                    window.__autogravityTimer = setInterval(() => {
                        const selectors = ['button', 'div[role="button"]', 'a[role="button"]', '.monaco-button'];
                        const clickAccept = (doc) => {
                            if (!doc) return false;
                            
                            // 首先专门处理 "Search for files edited by Agent" 这个 Quick Pick 下拉选单
                            // 因为后面的 excludeRules 会把常规的 monaco-list-row 给排除掉，所以单独前置处理
                            const quickInput = doc.querySelector('.quick-input-widget');
                            if (quickInput && quickInput.offsetWidth > 0) {
                                const inputNode = quickInput.querySelector('input');
                                const hasAgentText = (inputNode && (inputNode.getAttribute('placeholder') || '').includes('edited by Agent')) 
                                                  || (quickInput.textContent && quickInput.textContent.includes('edited by Agent'));
                                                  
                                if (hasAgentText) {
                                    // 找到里面真正的文件行节点（往往是带类名 monaco-list-row 的）
                                    const firstRow = quickInput.querySelector('.monaco-list-row');
                                    if (firstRow && typeof firstRow.click === 'function') {
                                        firstRow.click();
                                        console.log('[Autogravity] Auto-clicked next edited file in quick pick list.');
                                        return true; // 点完了就中断当次扫描
                                    }
                                }
                            }

                            const elements = Array.from(doc.querySelectorAll(selectors.join(',')));
                            
                            // 定义排除规则：如果任一规则返回 true，则不要点击该按钮
                            const excludeRules = [
                                // 1. 排除本插件的 Auto Accept 切换按钮自身
                                (btn, text) => text.includes('auto accept'),
                                // 2. 排除 "Ran Command" / "Running command" 块中的 "always run"
                                (btn, text) => {
                                    if (!text.includes('always run')) return false;
                                    let curr = btn.parentElement;
                                    // 增加搜索深度到 10 层，应对 VSCode 复杂的 DOM 嵌套
                                    for (let i = 0; i < 10 && curr; i++) {
                                        const parentText = (curr.textContent || '').toLowerCase();
                                        if (parentText.includes('ran command') || parentText.includes('running command') || parentText.includes('ran background command')) {
                                            return true;
                                        }
                                        curr = curr.parentElement;
                                    }
                                    return false;
                                },
                                // 3. 排除聊天消息框或外层容器引发的误触（比如用户发送的纯文本 "Accept"）
                                (btn, text) => {
                                    // 真实的按钮文字一定非常短，如果长篇大论绝对不是我们要点击的 action 按钮
                                    if (text.length > 40) return true;
                                    // 排除 VSCode 或通用应用里的列表项（由于列表项可能带有 role="button" 而被扫描到）
                                    if (typeof btn.className === 'string' && 
                                       (btn.className.includes('monaco-list-row') || btn.className.includes('chat-row'))) {
                                        return true;
                                    }
                                    // 真实按钮结构简单，内部如果包含段落、代码块等通常是用户聊天的气泡
                                    if (btn.querySelectorAll('p, pre, code').length > 0) return true;
                                    
                                    return false;
                                }
                                // 在此处继续添加新的排除规则...
                            ];

                            // 定义命中规则：如果任一规则返回 true，则点击该按钮
                            const includeRules = [
                                (btn, text) => {
                                    const t = text.trim();
                                    if (t === 'accept' || t === 'accept all' || t === 'accept changes' || t === 'run' || t === 'always allow') return true;
                                    // 只要是以 accept 或 run 开头，且长度不算太长（排除普通长文本聊天），基本都是我们需要的动作按钮
                                    // 这样可以完美包含 "Accept Alt+O", "Accept all" 以及没有空格的 "AcceptAlt+O"
                                    if ((t.startsWith('accept') || t.startsWith('run')) && t.length < 45) return true;
                                    
                                    // 专门处理 Run command 的确认按钮：Run Alt+Enter 或含有特定关键字
                                    if (btn.classList && btn.classList.contains('monaco-button')) {
                                        if (t.includes('run') && (t.includes('alt+') || t.includes('↵') || t.includes('enter'))) {
                                            return true;
                                        }
                                    }
                                    return false;
                                },
                                // 2. 精确匹配元素的特定 class (应对多语言或快捷键文本被拼接到 button 文本中的情况)
                                (btn, text) => {
                                    if (typeof btn.className !== 'string') return false;
                                    return btn.className.includes('keep-changes') || 
                                           btn.className.includes('diff-hunk-button accept') ||
                                           (btn.className.includes('monaco-button') && (text.includes('accept') || text.includes('accept all'))) ||
                                           (btn.className.includes('center-button') && (text.includes('edited file') || text.includes('accept all')));
                                },
                                // 3. 增加对 "View X edited files" 按钮的支持 (兼容单复数 file/files)
                                (btn, text) => /view \d+ edited file/.test(text),
                                // 4. 增加对 Diff 视图中单个改动旁边的小钩子(Accept)按钮的支持
                                (btn, text) => {
                                    // 检查是否是带 codicon-check 类的按钮，或者按钮内部包含该类
                                    const isCheckIcon = btn.classList.contains('codicon-check') || 
                                                       btn.querySelector('.codicon-check') !== null;
                                    // 或者通过 title 匹配（VSCode 按钮通常有 tooltip）
                                    const hasAcceptTitle = (btn.getAttribute('title') || '').toLowerCase().includes('accept');
                                    return isCheckIcon || hasAcceptTitle;
                                }
                            ];

                            const acceptBtn = elements.find(b => {
                                // 排除隐藏或禁用的元素（解决窗口切换时匹配到不可见 DOM 按钮的问题）
                                if (b.offsetWidth === 0 && b.offsetHeight === 0) return false;
                                if (b.disabled || (typeof b.className === 'string' && b.className.includes('disabled'))) return false;

                                const text = (b.textContent || "").toLowerCase();
                                // 首先判断是否在排除名单中
                                if (excludeRules.some(rule => rule(b, text))) return false;
                                // 然后判断是否符合命中名单
                                return includeRules.some(rule => rule(b, text));
                            });
                            if (acceptBtn && typeof acceptBtn.click === 'function') {
                                acceptBtn.click();
                                console.log('[Autogravity] Auto-clicked button:', acceptBtn.textContent || acceptBtn.getAttribute('title') || 'Icon Button');
                                return true;
                            }
                            return false;
                        };
                        
                        if (!clickAccept(document)) {
                            document.querySelectorAll('iframe').forEach(iframe => {
                                try { clickAccept(iframe.contentDocument); } catch(e) {}
                            });
                        }
                    }, 1000);
                }
            `;
            await this.evaluateAll(code);
            vscode.window.showInformationMessage(`Autogravity: Auto-Accept 开启！已注入 ${this.clients.length} 个区域。`);
            return true;
        } else {
            const code = `
                if (window.__autogravityTimer) {
                    clearInterval(window.__autogravityTimer);
                    window.__autogravityTimer = null;
                }
                // 清理可能遗留的旧版看门狗
                if (window.__autogravityKeeper) {
                    clearInterval(window.__autogravityKeeper);
                    window.__autogravityKeeper = null;
                }
                const oldBtn = document.getElementById('autogravity-btn');
                if (oldBtn) oldBtn.remove();
            `;
            await this.evaluateAll(code);
            vscode.window.showInformationMessage('Autogravity: Auto-Accept 已停止！');
            return false;
        }
    }

    private async evaluateAll(expression: string) {
        let successCount = 0;
        for (const client of this.clients) {
            try {
                await client.Runtime.evaluate({ expression });
                successCount++;
            } catch (err) {
                console.error('[Autogravity CDP] Injection error on a target:', err);
            }
        }
    }

    public disconnect() {
        this.clients.forEach(c => {
            try { c.close(); } catch (e) { }
        });
        this.clients = [];
        this.isPolling = false;
    }
}
