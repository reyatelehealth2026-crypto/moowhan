import { Component } from 'react';

/** Isolates a feature's tab/slot: a render error shows a Thai fallback instead of blanking the app. */
export default class FeatureErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error) {
    this.props.onError?.(error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" className="p-4 mb-4 rounded-xl border border-red-200 bg-red-50 text-red-700 text-sm flex flex-wrap items-center gap-3">
        <span className="min-w-0 break-words">ฟีเจอร์ "{this.props.name}" เกิดข้อผิดพลาด — ปิดฟีเจอร์นี้ชั่วคราว</span>
        <button type="button" onClick={() => this.setState({ error: null })} className="px-3 py-1.5 rounded-lg bg-white border border-red-200 hover:bg-red-100">
          ลองใหม่
        </button>
      </div>
    );
  }
}
