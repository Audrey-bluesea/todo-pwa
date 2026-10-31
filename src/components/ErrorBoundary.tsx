import { Component, type ErrorInfo, type ReactNode } from 'react';

interface State {
  hasError: boolean;
  message?: string;
}

/**
 * 最小错误边界：包住整个 App 内容。
 * 一旦某个组件渲染抛未捕获异常（典型如历史脏数据导致 `xxx is not a function`），
 * 不再把整棵 React 树冲成白屏（白屏在 PWA 里只能杀后台重开），而是显示「重新加载」
 * 原地恢复界面，并把错误栈打到 console 方便真机用 Safari 远程调试定位根因。
 */
export default class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(err: unknown): State {
    const message = err instanceof Error ? err.message : String(err);
    return { hasError: true, message };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // 真机排障：连 Mac 用 Safari 远程调试即可在此看到根因
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          className="absolute inset-0 z-[80] flex flex-col items-center justify-center gap-4 bg-appbg px-8 text-center"
          role="alert"
        >
          <div className="text-[28px]">🍵</div>
          <div className="text-[15px] font-medium text-neutral-700">页面出了点小问题</div>
          <div className="text-[12.5px] leading-relaxed text-neutral-400">
            你的数据已自动保护，点下面的按钮即可原地恢复，无需卸载重装。
          </div>
          <button
            onClick={() => location.reload()}
            className="rounded-full bg-primary-500 px-6 py-2.5 text-[14px] font-semibold text-white press active:bg-primary-600"
          >
            重新加载
          </button>
          {this.state.message && (
            <div className="mt-1 max-w-[280px] break-words text-[11px] text-neutral-300">
              {this.state.message}
            </div>
          )}
        </div>
      );
    }
    return this.props.children;
  }
}
