import React, { Component, ErrorInfo, ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error("應用程序錯誤:", error, errorInfo);
    
    // 觸發全局錯誤事件，以便main.tsx中的錯誤處理器可以創建數據備份
    const errorEvent = new ErrorEvent('error', {
      error: error,
      message: error.message
    });
    window.dispatchEvent(errorEvent);
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-100">
          <div className="bg-white p-8 rounded-lg shadow-md max-w-md w-full">
            <div className="text-red-600 text-4xl mb-4">出錯了</div>
            <p className="text-gray-700 mb-4">
              應用程序遇到了問題。請嘗試刷新頁面。
            </p>
            <p className="text-gray-500 text-sm mb-6">
              錯誤信息: {this.state.error?.message || "未知錯誤"}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="w-full bg-blue-500 hover:bg-blue-600 text-white py-2 px-4 rounded-md"
            >
              刷新頁面
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
} 