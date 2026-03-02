/**
 * 按钮查找表达式构建器
 * 
 * 生成在浏览器页面上下文中执行的 JS IIFE 表达式，
 * 扫描 DOM 找到目标按钮并返回其位置信息
 */

import {
    getExcludeRulesJS,
    getIncludeRulesJS,
    IS_IN_DIFF_TOOLBAR_FN,
    BROAD_SEARCH_EXCLUDED_CLASSES,
    BROAD_SEARCH_KEYWORDS
} from '../rules';

/** 按钮查找结果 */
export interface ButtonInfo {
    x: number;
    y: number;
    width: number;
    height: number;
    text: string;
}

/** 按钮选择器列表 */
const BUTTON_SELECTORS = [
    'button',
    'div[role="button"]',
    'a[role="button"]',
    '.monaco-button',
    'vscode-button',
    '.monaco-text-button',
    '.chat-tool-button',
    'a',
    '.cursor-pointer',
    '.btn',
    'span[role="button"]'
];

/**
 * 构建页面端 Quick Pick 检测代码段
 */
function buildQuickPickSection(): string {
    return `
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
    `;
}

/**
 * 构建宽泛搜索代码段（在标准选择器找不到时的后备方案）
 */
function buildBroadSearchSection(): string {
    const excludedClasses = BROAD_SEARCH_EXCLUDED_CLASSES.map(c => `'${c}'`).join(', ');
    const keywords = BROAD_SEARCH_KEYWORDS.map(k => `'${k}'`).join(', ');

    return `
        // 如果标准选择器没找到，最后尝试一个更宽泛的搜索：
        // 在所有可见元素中搜索 textContent 精确等于目标关键词的叶子节点的可点击祖先
        const allEls = Array.from(document.querySelectorAll('*'));
        for (const el of allEls) {
            // 只看叶子文本节点
            const directText = Array.from(el.childNodes)
                .filter(n => n.nodeType === 3)
                .map(n => (n.nodeValue || '').trim().toLowerCase())
                .join('');
            if (![${keywords}].includes(directText)) continue;
            if (directText === 'reject') continue;
            if (el.offsetWidth === 0 && el.offsetHeight === 0) continue;

            // 排除代码编辑器、侧边栏、标签栏中的元素
            const excludedClassList = [${excludedClasses}];
            let insideExcluded = false;
            let checkEl = el;
            for (let j = 0; j < 25 && checkEl; j++) {
                const cls = typeof checkEl.className === 'string' ? checkEl.className : '';
                if (excludedClassList.some(c => cls.includes(c)) ||
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
    `;
}

/**
 * 生成完整的按钮查找 JS 表达式
 * 
 * 在页面上下文中执行：找到目标按钮，返回其 bounding rect 和文字。
 * 如果找不到，返回 null。
 */
export function buildFindButtonExpression(): string {
    const selectorsStr = BUTTON_SELECTORS.map(s => `'${s}'`).join(', ');

    return `
        (() => {
            const selectors = [${selectorsStr}];

            ${buildQuickPickSection()}

            ${IS_IN_DIFF_TOOLBAR_FN}

            const elements = Array.from(document.querySelectorAll(selectors.join(',')));

            // 定义排除规则
            const excludeRules = ${getExcludeRulesJS()};

            // 定义命中规则
            const includeRules = ${getIncludeRulesJS()};

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

            ${buildBroadSearchSection()}

            return null;
        })()
    `;
}
