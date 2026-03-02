/**
 * 命中规则定义
 * 
 * 每条规则是一段 JS 函数字符串 (btn, text) => boolean
 * 在页面上下文中执行，返回 true 表示该元素应被点击
 */

/**
 * 生成命中规则数组的 JS 字符串
 * 在页面上下文中作为 IIFE 的一部分执行
 */
export function getIncludeRulesJS(): string {
    return `[
        // 1. 精确文本匹配 + primary 按钮优先
        (btn, text) => {
            const t = text.trim();
            const isPrimary = typeof btn.className === 'string' && btn.className.includes('primary');
            if (isPrimary && (t === 'run' || t === 'accept' || t === 'yes' || t === 'continue' || t === 'resume' || t === 'retry' || t === 'proceed')) {
                return true;
            }
            if (t === 'accept' || t === 'accept all' || t === 'accept changes' || t === 'run' || t === 'always allow' || t === 'approve' || t === 'continue' || t === 'yes' || t === 'allow this conversation' || t === 'resume' || t === 'retry' || t === 'proceed') return true;
            // 兼容带快捷键后缀的按钮文本，如 "accept changes ctrl+↵" 或 "accept all alt+enter"
            if ((t.startsWith('accept') || t.startsWith('approve') || t.startsWith('allow') || t.startsWith('resume') || t.startsWith('proceed')) && t.length < 80) return true;
            if (t.includes('run') && (t.includes('alt+') || t.includes('\u21b5') || t.includes('enter') || t.includes('cmd+') || t.includes('ctrl+'))) {
                return true;
            }
            return false;
        },

        // 2. 通过 className 匹配 Diff/Monaco 类型按钮
        (btn, text) => {
            if (typeof btn.className !== 'string') return false;
            return btn.className.includes('keep-changes') ||
                   btn.className.includes('diff-hunk-button accept') ||
                   (btn.className.includes('monaco-button') && (text.includes('accept') || text.includes('accept all'))) ||
                   (btn.className.includes('center-button') && (text.includes('edited file') || text.includes('accept all')));
        },

        // 3. "View X edited file(s)" 按钮（兼容单复数）
        (btn, text) => /view \d+ edited file/.test(text),

        // 4. Codicon 勾选图标 或带 accept title 的按钮
        (btn, text) => {
            const isCheckIcon = btn.classList.contains('codicon-check') ||
                               btn.querySelector('.codicon-check') !== null;
            const hasAcceptTitle = (btn.getAttribute('title') || '').toLowerCase().includes('accept');
            return isCheckIcon || hasAcceptTitle;
        },

        // 5. Diff 审阅浮层中的 "Accept Changes" / "Accept" 按钮（通过 title 属性精确匹配）
        (btn, text) => {
            const title = (btn.getAttribute('title') || '').toLowerCase();
            if (title.includes('accept change') || title.includes('accept all change')) return true;
            // 带快捷键后缀的 title，如 "Accept Changes (Ctrl+Enter)"
            if (title.startsWith('accept') && title.length < 80) return true;
            return false;
        },

        // 6. Diff 文件导航："< Edited files X/Y >" 中的 ">" 前进按钮
        //    以及 "Next Change" / "Previous Change" 导航按钮
        (btn, text) => {
            const title = (btn.getAttribute('title') || '').toLowerCase();
            const ariaLabel = (btn.getAttribute('aria-label') || '').toLowerCase();
            // 匹配 Next/Previous Change 导航
            if (title.includes('next change') || title.includes('next edited file') ||
                ariaLabel.includes('next change') || ariaLabel.includes('next edited file')) return true;
            // 匹配 "Edited files X/Y" 导航栏中的前进/后退箭头（通常带 codicon-arrow-right / codicon-chevron-right）
            if ((title.includes('next') || ariaLabel.includes('next')) &&
                (btn.classList.contains('codicon-arrow-right') || btn.classList.contains('codicon-chevron-right') ||
                 btn.querySelector('.codicon-arrow-right') || btn.querySelector('.codicon-chevron-right'))) {
                return true;
            }
            // 匹配 "Edited files" 文本旁边的导航按钮
            if (/edited files? \d+/.test(text)) return true;
            return false;
        }
    ]`;
}

/**
 * 宽泛搜索中用于精确匹配的叶子文本关键词列表
 */
export const BROAD_SEARCH_KEYWORDS = [
    'run', 'accept', 'continue', 'resume', 'retry', 'proceed', 'yes', 'approve'
];
