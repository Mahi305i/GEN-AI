
import { useEffect, useRef, useState } from "react";
import axios from "axios";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import {
  BrainCircuit,
  BookOpen,
  MessageCircle,
  FileText,
  Upload,
  Send,
  LogOut,
  Menu,
  X,
  Plus,
  Loader2,
  GraduationCap,
  Sparkles,
  Paperclip,
  Bot,
  User,
  CheckCircle2,
  AlertCircle,
  Trash2,
  RefreshCw,
} from "lucide-react";

const API_URL = "http://127.0.0.1:8000";

const api = axios.create({
  baseURL: API_URL,
});

function App() {
  const [token, setToken] = useState(
    () => sessionStorage.getItem("study_buddy_token") || ""
  );

  const [user, setUser] = useState(null);
  const [authMode, setAuthMode] = useState("login");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");

  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState("");

  const [backendStatus, setBackendStatus] = useState("Checking");

  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState("");
  const [uploadError, setUploadError] = useState("");

  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState([]);
  const [chatLoading, setChatLoading] = useState(false);

  // Persistent conversation history
  const [conversations, setConversations] = useState([]);
  const [activeConversationId, setActiveConversationId] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [deletingConversationId, setDeletingConversationId] = useState(null);

  // Study materials state
  const [activeView, setActiveView] = useState("tutor");
  const [notes, setNotes] = useState([]);
  const [notesLoading, setNotesLoading] = useState(false);
  const [notesError, setNotesError] = useState("");
  const [deletingNoteId, setDeletingNoteId] = useState(null);

  // Smart summarizer state
  const [selectedSummaryNoteId, setSelectedSummaryNoteId] = useState("");
  const [summary, setSummary] = useState("");
  const [summaryFilename, setSummaryFilename] = useState("");
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState("");
  const [summaryCopied, setSummaryCopied] = useState(false);

  // Quiz Generator state
  const [selectedQuizNoteId, setSelectedQuizNoteId] = useState("");
  const [quizQuestionCount, setQuizQuestionCount] = useState(5);
  const [quizData, setQuizData] = useState(null);
  const [quizAnswers, setQuizAnswers] = useState({});
  const [quizSubmitted, setQuizSubmitted] = useState(false);
  const [quizLoading, setQuizLoading] = useState(false);
  const [quizError, setQuizError] = useState("");

  const [sidebarOpen, setSidebarOpen] = useState(false);

  const fileInputRef = useRef(null);
  const chatEndRef = useRef(null);

  const authHeaders = {
    Authorization: `Bearer ${token}`,
  };

  // ==========================================
  // CHAT HISTORY MANAGEMENT
  // ==========================================

  async function loadConversations() {
    if (!token) return;

    setHistoryLoading(true);
    setHistoryError("");

    try {
      const response = await api.get("/api/chat/history", {
        headers: { Authorization: `Bearer ${token}` },
      });

      setConversations(response.data.conversations || []);
    } catch (error) {
      setHistoryError(
        error.response?.data?.detail ||
        "Unable to load chat history. Please try again."
      );
    } finally {
      setHistoryLoading(false);
    }
  }

  async function openConversation(conversationId) {
    if (!token) return;

    setHistoryError("");

    try {
      const response = await api.get(
        `/api/chat/history/${conversationId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      const conversation = response.data;

      setActiveConversationId(conversation.id);
      setMessages(
        (conversation.messages || []).map((message) => ({
          role: message.role,
          content: message.content,
          sources: [],
          retrievedChunks: 0,
          createdAt: message.created_at,
        }))
      );
      setQuestion("");
      setActiveView("tutor");
      setSidebarOpen(false);
    } catch (error) {
      setHistoryError(
        error.response?.data?.detail ||
        "Unable to open this conversation."
      );
    }
  }

  async function handleDeleteConversation(conversationId, title) {
    const confirmed = window.confirm(
      `Delete "${title}"? This will permanently remove this conversation and its messages.`
    );

    if (!confirmed) return;

    setDeletingConversationId(conversationId);
    setHistoryError("");

    try {
      await api.delete(`/api/chat/history/${conversationId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      setConversations((previous) =>
        previous.filter((conversation) => conversation.id !== conversationId)
      );

      if (activeConversationId === conversationId) {
        setActiveConversationId(null);
        setMessages([]);
      }
    } catch (error) {
      setHistoryError(
        error.response?.data?.detail ||
        "Failed to delete this conversation."
      );
    } finally {
      setDeletingConversationId(null);
    }
  }

  // ==========================================
  // SMART SUMMARIZER
  // ==========================================

  async function handleGenerateSummary(event) {
    event.preventDefault();

    if (!selectedSummaryNoteId || summaryLoading) return;

    setSummaryLoading(true);
    setSummaryError("");
    setSummary("");
    setSummaryFilename("");

    try {
      const response = await api.post(
        "/api/study-tools/summarize",
        { note_id: selectedSummaryNoteId },
        { headers: authHeaders }
      );

      setSummary(response.data.summary || "No summary was returned.");
      setSummaryFilename(response.data.filename || "Study material");
    } catch (error) {
      setSummaryError(
        error.response?.data?.detail ||
        "Unable to generate the summary. Please try again."
      );
    } finally {
      setSummaryLoading(false);
    }
  }

  async function handleCopySummary() {
    if (!summary) return;

    try {
      await navigator.clipboard.writeText(summary);
      setSummaryCopied(true);
      window.setTimeout(() => setSummaryCopied(false), 1800);
    } catch {
      setSummaryError("Could not copy the summary. Please select and copy it manually.");
    }
  }

  // ==========================================
  // ==========================================
  // QUIZ GENERATOR
  // ==========================================

  async function handleGenerateQuiz(event) {
    event.preventDefault();
    if (!selectedQuizNoteId || quizLoading) return;

    setQuizLoading(true);
    setQuizError("");
    setQuizData(null);
    setQuizAnswers({});
    setQuizSubmitted(false);

    try {
      const response = await api.post(
        "/api/quiz/generate",
        {
          note_id: selectedQuizNoteId,
          number_of_questions: Number(quizQuestionCount),
        },
        { headers: authHeaders }
      );
      setQuizData(response.data);
    } catch (error) {
      setQuizError(
        error.response?.data?.detail ||
        "Unable to generate the quiz. Please try again."
      );
    } finally {
      setQuizLoading(false);
    }
  }

  function handleQuizAnswer(questionNumber, option) {
    if (quizSubmitted) return;
    setQuizAnswers((previous) => ({ ...previous, [questionNumber]: option }));
  }

  function submitQuiz() {
    if (!quizData?.questions?.length) return;
    if (Object.keys(quizAnswers).length !== quizData.questions.length) {
      setQuizError("Please answer every question before submitting.");
      return;
    }
    setQuizError("");
    setQuizSubmitted(true);
  }

  function resetQuiz() {
    setQuizData(null);
    setQuizAnswers({});
    setQuizSubmitted(false);
    setQuizError("");
  }

  // STUDY MATERIALS MANAGEMENT
  // ==========================================

  async function loadNotes() {
    if (!token) return;

    setNotesLoading(true);
    setNotesError("");

    try {
      const response = await api.get("/api/notes/", {
        headers: { Authorization: `Bearer ${token}` },
      });

      setNotes(response.data.notes || []);
    } catch (error) {
      setNotesError(
        error.response?.data?.detail ||
        "Unable to load study materials. Please try again."
      );
    } finally {
      setNotesLoading(false);
    }
  }

  async function handleDeleteNote(noteId, filename) {
    const confirmed = window.confirm(
      `Are you sure you want to delete "${filename}"? This will remove its stored study content.`
    );

    if (!confirmed) return;

    setDeletingNoteId(noteId);
    setNotesError("");

    try {
      await api.delete(`/api/notes/${noteId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      setNotes((previous) =>
        previous.filter((note) => note.note_id !== noteId)
      );
    } catch (error) {
      setNotesError(
        error.response?.data?.detail ||
        "Failed to delete the document. Please try again."
      );
    } finally {
      setDeletingNoteId(null);
    }
  }

  useEffect(() => {
    api.get("/api/health")
      .then(() => setBackendStatus("Connected"))
      .catch(() => setBackendStatus("Disconnected"));
  }, []);

  useEffect(() => {
    if (!token) return;

    api.get("/api/auth/me", {
      headers: authHeaders,
    })
      .then((response) => setUser(response.data))
      .catch(() => logout());
  }, [token]);

  useEffect(() => {
    if (token) {
      loadNotes();
      loadConversations();
    } else {
      setNotes([]);
      setConversations([]);
      setActiveConversationId(null);
    }
  }, [token]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({
      behavior: "smooth",
    });
  }, [messages, chatLoading]);

  function logout() {
    sessionStorage.removeItem("study_buddy_token");
    setToken("");
    setUser(null);
    setMessages([]);
    setConversations([]);
    setActiveConversationId(null);
    setFile(null);
    setQuestion("");
  }

  async function handleAuth(event) {
    event.preventDefault();

    setAuthError("");
    setAuthLoading(true);

    try {
      if (authMode === "register") {
        await api.post("/api/auth/register", {
          full_name: fullName,
          email,
          password,
        });
      }

      const response = await api.post("/api/auth/login", {
        email,
        password,
      });

      const newToken = response.data.access_token;

      sessionStorage.setItem("study_buddy_token", newToken);
      setToken(newToken);
      setPassword("");
    } catch (error) {
      setAuthError(
        error.response?.data?.detail ||
        "Authentication failed. Please try again."
      );
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleUpload(event) {
    event.preventDefault();

    if (!file) {
      setUploadError("Please select a PDF file.");
      return;
    }

    if (file.type !== "application/pdf" &&
        !file.name.toLowerCase().endsWith(".pdf")) {
      setUploadError("Only PDF files are supported.");
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setUploadError("PDF must be smaller than 10 MB.");
      return;
    }

    setUploading(true);
    setUploadError("");
    setUploadMessage("");

    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await api.post(
        "/api/notes/upload",
        formData,
        {
          headers: {
            ...authHeaders,
            "Content-Type": "multipart/form-data",
          },
        }
      );

      setUploadMessage(
        `${response.data.filename} uploaded successfully! ` +
        `${response.data.total_chunks} text chunk(s) processed.`
      );

      setFile(null);
      await loadNotes();

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch (error) {
      setUploadError(
        error.response?.data?.detail ||
        "PDF upload failed. Please try again."
      );
    } finally {
      setUploading(false);
    }
  }

  async function handleAsk(event) {
    event.preventDefault();

    const currentQuestion = question.trim();

    if (!currentQuestion || chatLoading) return;

    setQuestion("");
    setChatLoading(true);

    setMessages((previous) => [
      ...previous,
      {
        role: "user",
        content: currentQuestion,
      },
    ]);

    try {
      const response = await api.post(
        "/api/chat/ask",
        {
          question: currentQuestion,
          conversation_id: activeConversationId,
        },
        {
          headers: authHeaders,
        }
      );

      setActiveConversationId(response.data.conversation_id);

      setMessages((previous) => [
        ...previous,
        {
          role: "assistant",
          content: response.data.answer,
          sources: response.data.sources || [],
          retrievedChunks: response.data.retrieved_chunks || 0,
        },
      ]);

      await loadConversations();
    } catch (error) {
      setMessages((previous) => [
        ...previous,
        {
          role: "assistant",
          content:
            error.response?.data?.detail ||
            "Sorry, I couldn't generate an answer. Please try again.",
          sources: [],
          error: true,
        },
      ]);
    } finally {
      setChatLoading(false);
    }
  }

  function startNewChat() {
    setMessages([]);
    setQuestion("");
    setActiveConversationId(null);
    setActiveView("tutor");
    setSidebarOpen(false);
  }

  // ==========================================
  // LOGIN AND REGISTRATION
  // ==========================================

  if (!token) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-5">
        <div className="grid w-full max-w-5xl overflow-hidden rounded-3xl bg-white shadow-2xl md:grid-cols-2">

          <div className="hidden bg-gradient-to-br from-indigo-700 via-blue-700 to-slate-900 p-12 text-white md:flex md:flex-col md:justify-between">
            <div>
              <div className="mb-10 flex items-center gap-3">
                <div className="rounded-xl bg-white/15 p-3">
                  <BrainCircuit size={30} />
                </div>
                <div>
                  <h1 className="text-2xl font-bold">Study Buddy</h1>
                  <p className="text-sm text-blue-200">
                    Your AI Learning Companion
                  </p>
                </div>
              </div>

              <h2 className="text-4xl font-bold leading-tight">
                Learn smarter.
                <br />
                Study better.
                <br />
                Achieve more.
              </h2>

              <p className="mt-6 max-w-sm leading-7 text-blue-100">
                Upload your college notes and let your personal AI tutor
                help you understand difficult concepts and prepare for exams.
              </p>
            </div>

            <div className="flex items-center gap-2 text-sm text-blue-200">
              <GraduationCap size={20} />
              AI-powered college learning platform
            </div>
          </div>

          <div className="p-7 sm:p-12">
            <div className="mb-8 flex items-center gap-3 md:hidden">
              <BrainCircuit className="text-indigo-600" size={30} />
              <h1 className="text-xl font-bold">Study Buddy</h1>
            </div>

            <p className="text-sm font-semibold uppercase tracking-widest text-indigo-600">
              Welcome to Study Buddy
            </p>

            <h2 className="mt-3 text-3xl font-bold text-slate-900">
              {authMode === "login" ? "Welcome back!" : "Create account"}
            </h2>

            <p className="mt-2 text-sm text-slate-500">
              {authMode === "login"
                ? "Sign in to continue learning."
                : "Join Study Buddy and start learning with AI."}
            </p>

            <form onSubmit={handleAuth} className="mt-8 space-y-5">

              {authMode === "register" && (
                <div>
                  <label className="mb-2 block text-sm font-medium">
                    Full name
                  </label>
                  <input
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Enter your full name"
                    className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                  />
                </div>
              )}

              <div>
                <label className="mb-2 block text-sm font-medium">
                  Email address
                </label>
                <input
                  required
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium">
                  Password
                </label>
                <input
                  required
                  type="password"
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                />
              </div>

              {authError && (
                <div className="rounded-xl bg-red-50 p-3 text-sm text-red-700">
                  {authError}
                </div>
              )}

              <button
                type="submit"
                disabled={authLoading}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 py-3.5 font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-60"
              >
                {authLoading && <Loader2 className="animate-spin" size={18} />}
                {authLoading
                  ? "Please wait..."
                  : authMode === "login"
                    ? "Sign in"
                    : "Create account"}
              </button>
            </form>

            <p className="mt-7 text-center text-sm text-slate-500">
              {authMode === "login"
                ? "Don't have an account?"
                : "Already have an account?"}

              <button
                type="button"
                onClick={() => {
                  setAuthMode(
                    authMode === "login" ? "register" : "login"
                  );
                  setAuthError("");
                }}
                className="ml-2 font-semibold text-indigo-600 hover:text-indigo-800"
              >
                {authMode === "login" ? "Register" : "Sign in"}
              </button>
            </p>

            <p className="mt-8 text-center text-xs text-slate-400">
              Study Buddy © 2026
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ==========================================
  // MAIN DASHBOARD
  // ==========================================

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 text-slate-900">

      {sidebarOpen && (
        <button
          type="button"
          aria-label="Close sidebar"
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 z-30 bg-slate-950/40 lg:hidden"
        />
      )}

      {/* SIDEBAR */}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-72 flex-col border-r border-slate-200 bg-white transition-transform lg:static lg:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-20 items-center justify-between border-b px-6">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-indigo-600 p-2 text-white">
              <BrainCircuit size={25} />
            </div>
            <div>
              <h1 className="font-bold">Study Buddy</h1>
              <p className="text-xs text-slate-400">AI Learning Assistant</p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-5">
          <button
            type="button"
            onClick={startNewChat}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white shadow-sm transition hover:bg-indigo-700"
          >
            <Plus size={19} />
            New Chat
          </button>
        </div>

        <div className="px-5">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
            Workspace
          </p>

          <button
            type="button"
            onClick={() => {
              setActiveView("tutor");
              setSidebarOpen(false);
            }}
            className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-medium transition ${
              activeView === "tutor"
                ? "bg-indigo-50 text-indigo-700"
                : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            <MessageCircle size={19} />
            AI Tutor
          </button>
        </div>

        <div className="mt-2 px-5">
          <button
            type="button"
            onClick={() => {
              setActiveView("summarizer");
              setSidebarOpen(false);
              if (notes.length === 0) loadNotes();
            }}
            className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm transition ${
              activeView === "summarizer"
                ? "bg-indigo-50 font-medium text-indigo-700"
                : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            <Sparkles size={19} />
            Smart Summarizer
          </button>
        </div>

        <div className="mt-2 px-5">
          <button
            type="button"
            onClick={() => {
              setActiveView("quiz");
              setSidebarOpen(false);
              if (notes.length === 0) loadNotes();
            }}
            className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm transition ${
              activeView === "quiz"
                ? "bg-indigo-50 font-medium text-indigo-700"
                : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            <GraduationCap size={19} />
            Quiz Generator
          </button>
        </div>

        <div className="mt-7 min-h-0 flex-1 overflow-y-auto px-5">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Recent chats
            </p>
            <button
              type="button"
              onClick={loadConversations}
              disabled={historyLoading}
              title="Refresh chat history"
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-indigo-600 disabled:opacity-50"
            >
              <RefreshCw size={14} className={historyLoading ? "animate-spin" : ""} />
            </button>
          </div>

          {historyError && (
            <p className="mb-2 rounded-lg bg-red-50 p-2 text-xs text-red-600">
              {historyError}
            </p>
          )}

          {historyLoading && conversations.length === 0 ? (
            <div className="flex items-center gap-2 px-2 py-3 text-xs text-slate-400">
              <Loader2 size={14} className="animate-spin" />
              Loading chats...
            </div>
          ) : conversations.length === 0 ? (
            <p className="px-2 py-3 text-xs text-slate-400">
              No previous conversations yet.
            </p>
          ) : (
            <div className="space-y-1">
              {conversations.map((conversation) => (
                <div
                  key={conversation.id}
                  className={`group flex items-center gap-1 rounded-xl ${
                    activeConversationId === conversation.id
                      ? "bg-indigo-50"
                      : "hover:bg-slate-50"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => openConversation(conversation.id)}
                    title={conversation.title}
                    className={`min-w-0 flex-1 rounded-xl px-3 py-2.5 text-left text-xs transition ${
                      activeConversationId === conversation.id
                        ? "font-semibold text-indigo-700"
                        : "text-slate-600"
                    }`}
                  >
                    <span className="block truncate">{conversation.title}</span>
                    <span className="mt-1 block text-[10px] text-slate-400">
                      {conversation.message_count} messages
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      handleDeleteConversation(conversation.id, conversation.title)
                    }
                    disabled={deletingConversationId === conversation.id}
                    title="Delete conversation"
                    aria-label={`Delete ${conversation.title}`}
                    className="mr-1 rounded-lg p-2 text-slate-300 opacity-100 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-40 sm:opacity-0 sm:group-hover:opacity-100"
                  >
                    {deletingConversationId === conversation.id ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Trash2 size={14} />
                    )}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mt-7 px-5">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
            Your learning
          </p>

          <button
            type="button"
            onClick={() => {
              setActiveView("materials");
              setSidebarOpen(false);
              loadNotes();
            }}
            className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm transition ${
              activeView === "materials"
                ? "bg-indigo-50 font-medium text-indigo-700"
                : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            <BookOpen size={19} />
            Study materials
          </button>
        </div>

        <div className="shrink-0 border-t p-5">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-100 font-bold text-indigo-700">
              {(user?.full_name || "S").charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">
                {user?.full_name || "Student"}
              </p>
              <p className="truncate text-xs text-slate-400">
                {user?.email || "Your account"}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={logout}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-500 transition hover:bg-red-50 hover:text-red-600"
          >
            <LogOut size={18} />
            Sign out
          </button>
        </div>
      </aside>

      {/* MAIN AREA */}

      <main className="flex min-w-0 flex-1 flex-col">

        {/* HEADER */}

        <header className="flex h-20 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-5 sm:px-8">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="rounded-lg p-2 hover:bg-slate-100 lg:hidden"
            >
              <Menu size={21} />
            </button>

            <div>
              <h2 className="font-bold">AI Study Assistant</h2>
              <p className="text-xs text-slate-400">
                Learn from your uploaded notes
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            {backendStatus === "Connected"
              ? "Backend connected"
              : backendStatus}
          </div>
        </header>

        <div className="flex flex-1 flex-col overflow-y-auto">

          {/* DASHBOARD CONTENT */}

          <div className="mx-auto w-full max-w-5xl px-5 py-7 sm:px-8">
            {activeView === "summarizer" ? (
              <section>
                <div className="mb-8">
                  <p className="text-sm font-medium text-indigo-600">AI STUDY TOOLS</p>
                  <h2 className="mt-2 text-2xl font-bold sm:text-3xl">Smart Summarizer</h2>
                  <p className="mt-2 text-sm text-slate-500">Generate an organized, student-friendly summary from your uploaded PDF notes.</p>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
                  <div className="mb-5 flex items-center gap-3">
                    <div className="rounded-xl bg-indigo-50 p-3 text-indigo-600"><Sparkles size={24} /></div>
                    <div>
                      <h3 className="font-bold">Choose study material</h3>
                      <p className="text-xs text-slate-400">Select one of your processed PDF documents.</p>
                    </div>
                  </div>

                  {notesLoading ? (
                    <div className="flex items-center gap-2 py-5 text-sm text-slate-500"><Loader2 size={18} className="animate-spin" /> Loading your documents...</div>
                  ) : notes.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
                      <FileText size={34} className="mx-auto mb-3 text-slate-400" />
                      <p className="font-semibold">No uploaded PDFs found</p>
                      <p className="mt-1 text-sm text-slate-500">Upload a PDF from the AI Tutor page before generating a summary.</p>
                      <button type="button" onClick={() => setActiveView("tutor")} className="mt-4 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700">Go to AI Tutor</button>
                    </div>
                  ) : (
                    <form onSubmit={handleGenerateSummary} className="space-y-4">
                      <label className="block">
                        <span className="mb-2 block text-sm font-medium text-slate-700">Select PDF</span>
                        <select
                          value={selectedSummaryNoteId}
                          onChange={(event) => { setSelectedSummaryNoteId(event.target.value); setSummary(""); setSummaryError(""); }}
                          required
                          className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                        >
                          <option value="">Choose an uploaded PDF</option>
                          {notes.map((note) => (
                            <option key={note.note_id} value={note.note_id}>{note.filename} ({note.chunks} chunks)</option>
                          ))}
                        </select>
                      </label>

                      {summaryError && <div className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{summaryError}</div>}

                      <button type="submit" disabled={!selectedSummaryNoteId || summaryLoading} className="flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50">
                        {summaryLoading ? <Loader2 size={17} className="animate-spin" /> : <Sparkles size={17} />}
                        {summaryLoading ? "Generating summary..." : "Generate Summary"}
                      </button>
                    </form>
                  )}
                </div>

                {summaryLoading && (
                  <div className="mt-6 flex items-center gap-3 rounded-2xl border border-indigo-100 bg-indigo-50 p-5 text-sm text-indigo-700">
                    <Loader2 size={20} className="animate-spin" /> Gemini is reading your document and preparing a structured summary.
                  </div>
                )}

                {summary && !summaryLoading && (
                  <article className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
                    <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
                      <div>
                        <h3 className="font-bold text-slate-900">Generated Summary</h3>
                        <p className="mt-1 text-xs text-slate-500">{summaryFilename}</p>
                      </div>
                      <button type="button" onClick={handleCopySummary} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                        {summaryCopied ? <CheckCircle2 size={15} /> : <FileText size={15} />}
                        {summaryCopied ? "Copied" : "Copy Summary"}
                      </button>
                    </div>
                    <div className="prose prose-sm max-w-none prose-headings:text-slate-900 prose-a:text-indigo-600 prose-strong:text-slate-900">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{summary}</ReactMarkdown>
                    </div>
                    <p className="mt-6 border-t border-slate-100 pt-4 text-xs text-slate-400">AI-generated summary based on the selected uploaded document. Verify important information against your original notes.</p>
                  </article>
                )}
              </section>
            ) : activeView === "quiz" ? (
              <section>
                <div className="mb-8">
                  <p className="text-sm font-medium text-indigo-600">AI STUDY TOOLS</p>
                  <h2 className="mt-2 text-2xl font-bold sm:text-3xl">Quiz Generator</h2>
                  <p className="mt-2 text-sm text-slate-500">
                    Test your understanding with MCQs generated from your uploaded PDF notes.
                  </p>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
                  <div className="mb-5 flex items-center gap-3">
                    <div className="rounded-xl bg-indigo-50 p-3 text-indigo-600">
                      <GraduationCap size={24} />
                    </div>
                    <div>
                      <h3 className="font-bold">Create a practice quiz</h3>
                      <p className="text-xs text-slate-400">Choose a PDF and the number of questions.</p>
                    </div>
                  </div>

                  {notesLoading ? (
                    <div className="flex items-center gap-2 py-5 text-sm text-slate-500">
                      <Loader2 size={18} className="animate-spin" /> Loading your documents...
                    </div>
                  ) : notes.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
                      <FileText size={34} className="mx-auto mb-3 text-slate-400" />
                      <p className="font-semibold">No uploaded PDFs found</p>
                      <p className="mt-1 text-sm text-slate-500">Upload a PDF from the AI Tutor page first.</p>
                      <button type="button" onClick={() => setActiveView("tutor")} className="mt-4 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700">
                        Go to AI Tutor
                      </button>
                    </div>
                  ) : (
                    <form onSubmit={handleGenerateQuiz} className="grid gap-4 sm:grid-cols-[1fr_180px_auto] sm:items-end">
                      <label className="block">
                        <span className="mb-2 block text-sm font-medium text-slate-700">Select PDF</span>
                        <select
                          value={selectedQuizNoteId}
                          onChange={(event) => {
                            setSelectedQuizNoteId(event.target.value);
                            resetQuiz();
                          }}
                          required
                          className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                        >
                          <option value="">Choose an uploaded PDF</option>
                          {notes.map((note) => (
                            <option key={note.note_id} value={note.note_id}>
                              {note.filename} ({note.chunks} chunks)
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="block">
                        <span className="mb-2 block text-sm font-medium text-slate-700">Questions</span>
                        <select
                          value={quizQuestionCount}
                          onChange={(event) => setQuizQuestionCount(Number(event.target.value))}
                          className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                        >
                          <option value={5}>5 questions</option>
                          <option value={10}>10 questions</option>
                          <option value={15}>15 questions</option>
                        </select>
                      </label>

                      <button type="submit" disabled={!selectedQuizNoteId || quizLoading} className="flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50">
                        {quizLoading ? <Loader2 size={17} className="animate-spin" /> : <Sparkles size={17} />}
                        {quizLoading ? "Generating..." : "Generate Quiz"}
                      </button>
                    </form>
                  )}

                  {quizError && <div className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{quizError}</div>}
                </div>

                {quizLoading && (
                  <div className="mt-6 flex items-center gap-3 rounded-2xl border border-indigo-100 bg-indigo-50 p-5 text-sm text-indigo-700">
                    <Loader2 size={20} className="animate-spin" /> Gemini is preparing your questions.
                  </div>
                )}

                {quizData?.questions?.length > 0 && (
                  <div className="mt-6 space-y-5">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <h3 className="text-lg font-bold">Practice Quiz</h3>
                        <p className="text-xs text-slate-500">{quizData.filename} · {quizData.questions.length} questions</p>
                      </div>
                      {quizSubmitted && (() => {
                        const score = quizData.questions.filter(
                          (item) => quizAnswers[item.question_number] === item.correct_answer
                        ).length;
                        return (
                          <div className="rounded-xl bg-indigo-50 px-4 py-2 text-sm font-semibold text-indigo-700">
                            Score: {score}/{quizData.questions.length} · {Math.round(score / quizData.questions.length * 100)}%
                          </div>
                        );
                      })()}
                    </div>

                    {quizData.questions.map((item, index) => {
                      const number = item.question_number ?? index + 1;
                      const chosen = quizAnswers[number];
                      const isCorrect = chosen === item.correct_answer;

                      return (
                        <article key={number} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                          <p className="font-semibold leading-7 text-slate-900">
                            <span className="mr-2 text-indigo-600">Q{number}.</span>{item.question}
                          </p>
                          <div className="mt-4 grid gap-3 sm:grid-cols-2">
                            {Object.entries(item.options || {}).map(([key, value]) => {
                              const selected = chosen === key;
                              const correct = quizSubmitted && item.correct_answer === key;
                              const wrong = quizSubmitted && selected && !isCorrect;
                              return (
                                <button
                                  key={key}
                                  type="button"
                                  disabled={quizSubmitted}
                                  onClick={() => handleQuizAnswer(number, key)}
                                  className={`rounded-xl border p-3 text-left text-sm transition ${
                                    correct ? "border-emerald-400 bg-emerald-50 text-emerald-800"
                                      : wrong ? "border-red-300 bg-red-50 text-red-800"
                                      : selected ? "border-indigo-400 bg-indigo-50 text-indigo-800"
                                      : "border-slate-200 bg-white text-slate-700 hover:border-indigo-300"
                                  }`}
                                >
                                  <span className="mr-2 font-bold">{key}.</span>{value}
                                </button>
                              );
                            })}
                          </div>
                          {quizSubmitted && (
                            <div className={`mt-4 rounded-xl p-4 text-sm ${isCorrect ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900"}`}>
                              <p className="font-semibold">{isCorrect ? "Correct answer!" : `Correct answer: ${item.correct_answer}`}</p>
                              {item.explanation && <p className="mt-1 leading-6">{item.explanation}</p>}
                            </div>
                          )}
                        </article>
                      );
                    })}

                    {!quizSubmitted ? (
                      <button type="button" onClick={submitQuiz} className="rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white hover:bg-indigo-700">
                        Submit Quiz
                      </button>
                    ) : (
                      <button type="button" onClick={resetQuiz} className="rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                        Generate Another Quiz
                      </button>
                    )}
                  </div>
                )}
              </section>
            ) : activeView === "materials" ? (
              <section>
                {/* PAGE HEADER */}
                <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-indigo-600">
                      YOUR LEARNING LIBRARY
                    </p>
                    <h2 className="mt-2 text-2xl font-bold sm:text-3xl">
                      Study Materials
                    </h2>
                    <p className="mt-2 text-sm text-slate-500">
                      Manage your uploaded college notes and PDFs.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={loadNotes}
                    disabled={notesLoading}
                    className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <RefreshCw
                      size={17}
                      className={notesLoading ? "animate-spin" : ""}
                    />
                    Refresh
                  </button>
                </div>

                {/* DOCUMENT SUMMARY */}
                <div className="mb-6 rounded-2xl border border-indigo-100 bg-indigo-50 p-5">
                  <div className="flex items-center gap-4">
                    <div className="rounded-xl bg-white p-3 text-indigo-600">
                      <BookOpen size={26} />
                    </div>
                    <div>
                      <p className="text-sm text-slate-500">
                        Total uploaded documents
                      </p>
                      <h3 className="text-3xl font-bold text-indigo-700">
                        {notes.length}
                      </h3>
                    </div>
                  </div>
                </div>

                {notesError && (
                  <div className="mb-5 flex items-center gap-2 rounded-xl bg-red-50 p-4 text-sm text-red-700">
                    <AlertCircle size={17} />
                    {notesError}
                  </div>
                )}

                {notesLoading && notes.length === 0 ? (
                  <div className="flex items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-white p-12 text-slate-500">
                    <Loader2 size={22} className="animate-spin" />
                    Loading your study materials...
                  </div>
                ) : notes.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center">
                    <FileText
                      size={45}
                      className="mx-auto mb-4 text-slate-300"
                    />
                    <h3 className="text-lg font-bold">
                      No study materials found
                    </h3>
                    <p className="mt-2 text-sm text-slate-500">
                      Upload your first PDF to start learning.
                    </p>
                    <button
                      type="button"
                      onClick={() => setActiveView("tutor")}
                      className="mt-5 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-indigo-700"
                    >
                      Go to AI Tutor
                    </button>
                  </div>
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {notes.map((note) => (
                      <article
                        key={note.note_id}
                        className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-1 hover:shadow-md"
                      >
                        <div className="mb-5 flex items-start justify-between">
                          <div className="rounded-xl bg-indigo-50 p-3 text-indigo-600">
                            <FileText size={25} />
                          </div>
                          <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
                            Processed
                          </span>
                        </div>

                        <h3
                          className="truncate font-semibold text-slate-800"
                          title={note.filename}
                        >
                          {note.filename}
                        </h3>
                        <p className="mt-2 text-sm text-slate-500">
                          {note.chunks} text chunk(s)
                        </p>

                        <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-4">
                          <span className="text-xs text-slate-400">
                            PDF document
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              handleDeleteNote(note.note_id, note.filename)
                            }
                            disabled={deletingNoteId === note.note_id}
                            className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {deletingNoteId === note.note_id ? (
                              <Loader2 size={15} className="animate-spin" />
                            ) : (
                              <Trash2 size={15} />
                            )}
                            Delete
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </section>
            ) : (
              <>
            <div className="mb-8">
              <p className="text-sm font-medium text-indigo-600">
                YOUR PERSONAL AI TUTOR
              </p>

              <h2 className="mt-2 text-2xl font-bold sm:text-3xl">
                Hello, {user?.full_name?.split(" ")[0] || "Student"}!
              </h2>

              <p className="mt-2 text-sm text-slate-500">
                Upload your college notes and ask anything about them.
              </p>
            </div>

            {/* PDF UPLOAD */}

            <section className="mb-8 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <div className="mb-5 flex items-center gap-3">
                <div className="rounded-xl bg-indigo-50 p-3 text-indigo-600">
                  <FileText size={23} />
                </div>
                <div>
                  <h3 className="font-bold">Upload your study notes</h3>
                  <p className="text-xs text-slate-400">
                    PDF files up to 10 MB
                  </p>
                </div>
              </div>

              <form onSubmit={handleUpload}>
                <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center transition hover:border-indigo-400 hover:bg-indigo-50/40">
                  <Upload className="mb-3 text-indigo-600" size={30} />

                  <span className="text-sm font-semibold">
                    {file ? file.name : "Choose a PDF file"}
                  </span>

                  <span className="mt-1 text-xs text-slate-400">
                    Click here to browse your files
                  </span>

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,application/pdf"
                    className="hidden"
                    onChange={(event) => {
                      setFile(event.target.files?.[0] || null);
                      setUploadError("");
                      setUploadMessage("");
                    }}
                  />
                </label>

                {uploadError && (
                  <p className="mt-3 flex items-center gap-2 text-sm text-red-600">
                    <AlertCircle size={16} />
                    {uploadError}
                  </p>
                )}

                {uploadMessage && (
                  <p className="mt-3 flex items-center gap-2 text-sm text-emerald-700">
                    <CheckCircle2 size={16} />
                    {uploadMessage}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={uploading || !file}
                  className="mt-4 flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {uploading
                    ? <Loader2 className="animate-spin" size={17} />
                    : <Upload size={17} />}
                  {uploading ? "Processing PDF..." : "Upload Notes"}
                </button>
              </form>
            </section>

            {/* CHAT */}

            <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">

              <div className="flex items-center justify-between border-b px-5 py-4">
                <div className="flex items-center gap-3">
                  <div className="rounded-xl bg-indigo-50 p-2 text-indigo-600">
                    <Sparkles size={21} />
                  </div>
                  <div>
                    <h3 className="font-bold">Chat with Study Buddy</h3>
                    <p className="text-xs text-slate-400">
                      {activeConversationId
                        ? `Conversation #${activeConversationId} · Gemini + RAG`
                        : "New conversation · Gemini + RAG"}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={startNewChat}
                  className="text-xs font-semibold text-indigo-600 hover:text-indigo-800"
                >
                  Clear chat
                </button>
              </div>

              <div className="min-h-[350px] max-h-[550px] space-y-6 overflow-y-auto bg-slate-50/60 p-5 sm:p-7">

                {messages.length === 0 && (
                  <div className="flex min-h-[310px] flex-col items-center justify-center text-center">
                    <div className="mb-5 rounded-2xl bg-indigo-100 p-5 text-indigo-600">
                      <Bot size={38} />
                    </div>

                    <h3 className="text-xl font-bold">
                      What would you like to learn?
                    </h3>

                    <p className="mt-2 max-w-md text-sm leading-6 text-slate-500">
                      Ask questions about your uploaded college notes.
                      I'll find relevant information and explain it simply.
                    </p>

                    <div className="mt-6 flex flex-wrap justify-center gap-2">
                      {[
                        "Summarize my notes",
                        "Explain important concepts",
                        "Generate exam questions",
                      ].map((suggestion) => (
                        <button
                          key={suggestion}
                          type="button"
                          onClick={() => setQuestion(suggestion)}
                          className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs text-slate-600 transition hover:border-indigo-400 hover:text-indigo-600"
                        >
                          {suggestion}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {messages.map((message, index) => (
                  <div
                    key={index}
                    className={`flex gap-3 ${
                      message.role === "user"
                        ? "flex-row-reverse"
                        : "flex-row"
                    }`}
                  >
                    <div
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                        message.role === "user"
                          ? "bg-slate-200 text-slate-700"
                          : "bg-indigo-600 text-white"
                      }`}
                    >
                      {message.role === "user"
                        ? <User size={18} />
                        : <BrainCircuit size={18} />}
                    </div>

                    <div
                      className={`max-w-[88%] rounded-2xl p-4 text-sm leading-7 ${
                        message.role === "user"
                          ? "bg-indigo-600 text-white"
                          : "border border-slate-200 bg-white text-slate-800"
                      }`}
                    >
                      {message.role === "user" ? (
                        <p className="whitespace-pre-wrap">
                          {message.content}
                        </p>
                      ) : (
                        <>
                          <div className="prose prose-sm max-w-none prose-headings:text-slate-900 prose-a:text-indigo-600 prose-strong:text-slate-900">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                              {message.content}
                            </ReactMarkdown>
                          </div>

                          {message.sources?.length > 0 && (
                            <div className="mt-5 border-t border-slate-200 pt-3">
                              <p className="mb-2 text-xs font-semibold text-slate-500">
                                Sources
                              </p>

                              {message.sources.map((source) => (
                                <div
                                  key={source.note_id}
                                  className="mb-2 flex items-center gap-2 rounded-lg bg-slate-50 p-2 text-xs text-slate-600"
                                >
                                  <FileText size={15} className="text-indigo-600" />
                                  {source.filename}
                                </div>
                              ))}

                              <p className="text-xs text-slate-400">
                                Retrieved {message.retrievedChunks} relevant chunk(s)
                              </p>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                ))}

                {chatLoading && (
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-600 text-white">
                      <BrainCircuit size={18} />
                    </div>
                    <div className="flex items-center gap-2 rounded-xl border bg-white px-4 py-3 text-sm text-slate-500">
                      <Loader2 className="animate-spin" size={16} />
                      Study Buddy is thinking...
                    </div>
                  </div>
                )}

                <div ref={chatEndRef} />
              </div>

              {/* CHAT INPUT */}

              <form onSubmit={handleAsk} className="border-t bg-white p-4 sm:p-5">
                <div className="flex items-end gap-3 rounded-xl border border-slate-200 bg-slate-50 p-2 transition focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-100">
                  <div className="pb-2 pl-2 text-slate-400">
                    <Paperclip size={19} />
                  </div>

                  <textarea
                    value={question}
                    onChange={(event) => setQuestion(event.target.value)}
                    onKeyDown={(event) => {
                      if (
                        event.key === "Enter" &&
                        !event.shiftKey
                      ) {
                        event.preventDefault();
                        event.currentTarget.form.requestSubmit();
                      }
                    }}
                    placeholder="Ask anything about your study notes..."
                    rows={1}
                    maxLength={2000}
                    className="max-h-32 min-h-10 flex-1 resize-y bg-transparent px-1 py-2 text-sm outline-none placeholder:text-slate-400"
                  />

                  <button
                    type="submit"
                    disabled={!question.trim() || chatLoading}
                    className="rounded-lg bg-indigo-600 p-3 text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40"
                    aria-label="Send message"
                  >
                    <Send size={18} />
                  </button>
                </div>

                <p className="mt-2 text-center text-xs text-slate-400">
                  Study Buddy can make mistakes. Verify important information.
                </p>
              </form>
            </section>
              </>
            )}
          </div>
        </div>

        <footer className="border-t bg-white px-5 py-3 text-center text-xs text-slate-400">
          Study Buddy © 2026 · AI-Powered College Learning Assistant
        </footer>

      </main>
    </div>
  );
}

export default App;
