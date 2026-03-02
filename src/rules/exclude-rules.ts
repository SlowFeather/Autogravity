/**
 * 排除规则定义
 * 
 * 每条规则是一段 JS 函数字符串 (btn, text) => boolean
 * 在页面上下文中执行，返回 true 表示该元素应被排除（不点击）
 */

/** 辅助函数：判断元素是否在 Diff 工具栏 / 编辑器标题栏 / Diff 审阅浮层中 */
export const IS_IN_DIFF_TOOLBAR_FN = `
    function isInDiffToolbar(el) {
        let node = el;
        for (let i = 0; i < 20 && node; i++) {
            const cls = typeof node.className === 'string' ? node.className : '';
            const tag = (node.tagName || '').toLowerCase();
            // Diff 编辑器工具栏
            if (cls.includes('diff-editor') && cls.includes('toolbar')) return true;
            // Diff 审阅 widget（底部浮层：Accept Changes / Edited files 导航）
            if (cls.includes('diff-review')) return true;
            if (cls.includes('dirty-diff')) return true;
            if (cls.includes('review-widget')) return true;
            // Peek 视图（内联审阅弹窗）
            if (cls.includes('peek-view')) return true;
            if (cls.includes('zone-widget')) return true;
            // 编辑器顶部/底部操作栏
            if (cls.includes('editor-actions')) return true;
            if (cls.includes('title-actions')) return true;
            if (cls.includes('action-bar')) return true;
            // Monaco 浮层 widget（overlay-widget 用于悬浮工具栏）
            if (cls.includes('overlay-widget')) return true;
            if (cls.includes('overlayWidgets')) return true;
            // 内联修改装饰器区域
            if (cls.includes('inline-modified')) return true;
            if (cls.includes('inline-deleted')) return true;
            // Diff 导航控制栏（< Edited files 1/10 >）
            if (cls.includes('diff-nav') || cls.includes('navigation')) return true;
            // 通用匹配：class 中同时含 diff 和 button/action 关键字
            if (cls.includes('diff') && (cls.includes('button') || cls.includes('action') || cls.includes('widget'))) return true;
            node = node.parentElement;
        }
        return false;
    }
`;

/**
 * 生成排除规则数组的 JS 字符串
 * 在页面上下文中作为 IIFE 的一部分执行
 */
export function getExcludeRulesJS(): string {
    return `[
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

        // 5. 排除 "Always run" 下拉选单（listbox 类型的按钮）
        (btn, text) => {
            if (text.trim() === 'always run') {
                if (btn.getAttribute('aria-haspopup') === 'listbox') return true;
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
    ]`;
}

/**
 * 在宽泛搜索中使用的排除类名列表
 * 用于判断元素是否在编辑器/侧边栏/标签栏等不应点击的区域中
 */
export const BROAD_SEARCH_EXCLUDED_CLASSES = [
    'monaco-editor', 'lines-content', 'view-lines', 'editor-instance',
    'sidebar', 'auxiliarybar',
    'tabs-container', 'editor-group-header',
    'explorer-folders-view', 'activitybar'
];
