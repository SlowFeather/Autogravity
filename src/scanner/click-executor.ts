/**
 * 点击执行器
 * 
 * 通过 CDP 协议模拟鼠标点击，支持两种模式：
 * 1. CDP Input.dispatchMouseEvent（模拟真实硬件鼠标事件）
 * 2. JS 回退方案（通过 Runtime.evaluate 注入 JS 模拟点击）
 */

import type { ButtonInfo } from './button-finder';

/** 获取 JS 回退点击代码 */
function buildFallbackClickCode(x: number, y: number): string {
    return `
        (() => {
            const el = document.elementFromPoint(${x}, ${y});
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
}

/**
 * 在指定 CDP client 上执行点击操作
 * 
 * @param client  CDP 连接客户端
 * @param btnInfo 按钮的位置和文本信息
 */
export async function executeClick(client: any, btnInfo: ButtonInfo): Promise<void> {
    const clickX = Math.round(btnInfo.x + btnInfo.width / 2);
    const clickY = Math.round(btnInfo.y + btnInfo.height / 2);

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
        console.log(`[Autogravity] CDP Input clicked '${btnInfo.text}' at (${clickX}, ${clickY})`);
    } catch (inputErr) {
        // 方法二：如果 Input 域不可用，回退到 JS 点击
        console.log(`[Autogravity] Input.dispatchMouseEvent failed, falling back to JS click`);
        const fallbackCode = buildFallbackClickCode(clickX, clickY);
        const fallbackResult = await client.Runtime.evaluate({ expression: fallbackCode, returnByValue: true });
        console.log(`[Autogravity] Fallback result:`, fallbackResult.result.value);
    }
}
