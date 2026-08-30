import { Component, type ErrorInfo, type ReactNode } from "react";

interface State {
  error: Error | null;
}

const isChunkLoadError = (error: unknown) => {
  const message =
    error instanceof Error
      ? `${error.name} ${error.message} ${error.stack ?? ""}`
      : String(error ?? "");

  return (
    message.includes("Failed to fetch dynamically imported module") ||
    message.includes("Importing a module script failed") ||
    message.includes("ChunkLoadError") ||
    message.includes("Loading chunk") ||
    message.includes("MIME type of \"text/html\"")
  );
};

export class AppErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[AppErrorBoundary]", error, info.componentStack);
    if (isChunkLoadError(error)) {
      const key = "DilMart:chunk-reload-attempted";
      if (!sessionStorage.getItem(key)) {
        sessionStorage.setItem(key, "1");
        window.location.reload();
        return;
      }
    }
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const isDev = import.meta.env.DEV;
    const isChunkErr = isChunkLoadError(error);

    if (isChunkErr) {
      return (
        <div style={{ padding: 32, fontFamily: "sans-serif", direction: "rtl", textAlign: "right", maxWidth: 600, margin: "40px auto", border: "1px solid #fee2e2", borderRadius: 12, backgroundColor: "#fff", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" }}>
          <h2 style={{ color: "#dc2626", marginBottom: 12, fontSize: "1.5rem", fontWeight: "bold" }}>تم تحديث التطبيق</h2>
          <p style={{ color: "#4b5563", marginBottom: 20, fontSize: "1rem", lineHeight: "1.6" }}>
            يبدو أن نسخة قديمة من التطبيق كانت مفتوحة أثناء تحديث النظام. يرجى الضغط على الزر أدناه لإعادة تحميل التطبيق والحصول على آخر نسخة.
          </p>
          <button
            onClick={() => {
              sessionStorage.removeItem("DilMart:chunk-reload-attempted");
              window.location.reload();
            }}
            style={{ padding: "10px 24px", background: "#111827", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontSize: "1rem", fontWeight: "600" }}
          >
            إعادة تحميل التطبيق
          </button>
        </div>
      );
    }

    return (
      <div style={{ padding: 32, fontFamily: "monospace", direction: "ltr" }}>
        <h2 style={{ color: "#c00", marginBottom: 12 }}>App crashed — please share this with support:</h2>
        <pre style={{ background: "#fef2f2", padding: 16, borderRadius: 8, fontSize: 13, overflowX: "auto", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
          {error.message}
          {isDev && (
            <>
              {"\n\n"}
              {error.stack}
            </>
          )}
        </pre>
        <button
          onClick={() => {
            this.setState({ error: null });
            window.location.href = "/";
          }}
          style={{ marginTop: 16, padding: "8px 20px", background: "#111", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer" }}
        >
          العودة للرئيسية
        </button>
      </div>
    );
  }
}
