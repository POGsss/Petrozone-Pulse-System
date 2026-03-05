import { useState, useRef, useEffect } from "react";
import { LuSparkles, LuX, LuSend, LuLoader } from "react-icons/lu";
import ReactMarkdown from "react-markdown";
import { dashboardApi } from "../lib/api";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface DashboardChatProps {
  /** Current dashboard data context to constrain AI answers */
  context: Record<string, unknown>;
}

export function DashboardChat({ context }: DashboardChatProps) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Focus input when chat opens
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const sendMessage = async () => {
    const trimmed = input.trim();
    if (!trimmed || loading) return;

    const userMsg: ChatMessage = { role: "user", content: trimmed };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const { reply } = await dashboardApi.chat(trimmed, context);
      setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: err?.message || "Sorry, I couldn't process your request. Please try again.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <>
      {/* Chat Panel */}
      {open && (
        <div className="fixed bottom-16 right-6 z-50 w-[380px] max-h-[520px] bg-white rounded-xl border border-neutral-200 flex flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 bg-primary text-white rounded-t-xl">
            <div className="flex items-center gap-2">
              <LuSparkles className="w-5 h-5" />
              <span className="text-base font-semibold">Dashboard AI Assistant</span>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="p-1 rounded-lg hover:bg-white/20 transition-colors"
            >
              <LuX className="w-4 h-4" />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-[300px] max-h-[380px] bg-neutral-100">
            {messages.length === 0 && (
              <div className="text-center py-8 space-y-2">
                <LuSparkles className="w-10 h-10 text-neutral-300 mx-auto" />
                <p className="text-sm text-neutral-900">
                  Ask me anything about your dashboard data!
                </p>
                <div className="space-y-1 pt-4">
                  {["What are my total sales?", "Which service generates the most revenue?", "How many low stock items do I have?"].map((q) => (
                    <button
                      key={q}
                      onClick={() => {
                        setInput(q);
                        inputRef.current?.focus();
                      }}
                      className="block w-full text-left text-xs text-primary hover:bg-primary-100 px-5 py-2.5 rounded-lg transition-colors bg-white"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] px-3 py-2 rounded-xl text-sm leading-relaxed whitespace-pre-wrap overflow-hidden ${
                    msg.role === "user"
                      ? "bg-primary text-white rounded-br-sm"
                      : "bg-white text-neutral-950 border border-neutral-200 rounded-bl-sm"
                  }`}
                >
                  {msg.role === "assistant" ? (
                    <ReactMarkdown
                      components={{
                        p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                        strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                        em: ({ children }) => <em className="italic">{children}</em>,
                        ul: ({ children }) => <ul className="list-disc ml-4 mb-2">{children}</ul>,
                        ol: ({ children }) => <ol className="list-decimal ml-4 mb-2">{children}</ol>,
                        li: ({ children }) => <li className="mb-0.5">{children}</li>,
                        h1: ({ children }) => <h1 className="font-bold text-base mb-1">{children}</h1>,
                        h2: ({ children }) => <h2 className="font-bold text-sm mb-1">{children}</h2>,
                        h3: ({ children }) => <h3 className="font-semibold text-sm mb-1">{children}</h3>,
                        code: ({ children }) => <code className="bg-neutral-200 dark:bg-neutral-700 px-1 rounded text-xs">{children}</code>,
                      }}
                    >
                      {msg.content}
                    </ReactMarkdown>
                  ) : (
                    msg.content
                  )}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex justify-start">
                <div className="bg-white border border-neutral-200 px-3 py-2 rounded-xl rounded-bl-sm">
                  <LuLoader className="w-4 h-4 text-neutral-400 animate-spin" />
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="border-t border-neutral-200 p-3 bg-white">
            <div className="flex items-center gap-2">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about your data..."
                disabled={loading}
                className="flex-1 px-3 py-1.5 text-sm border border-neutral-200 rounded-lg bg-white focus:outline-none focus:border-primary disabled:opacity-50 text-neutral-950 placeholder:text-neutral-400"
              />
              <button
                onClick={sendMessage}
                disabled={!input.trim() || loading}
                className="px-2.5 py-2.5 bg-primary text-white rounded-lg hover:bg-primary-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <LuSend className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FAB Button */}
      <button
        onClick={() => setOpen(!open)}
        className="fixed bottom-0 right-6 z-50 w-12 h-12 bg-primary text-white rounded-xl hover:bg-primary-800 transition-colors flex items-center justify-center"
        title="Chat with AI"
      >
        {open ? (
          <LuX className="w-5 h-5" />
        ) : (
          <LuSparkles className="w-5 h-5" />
        )}
      </button>
    </>
  );
}
