import React, { useState, useCallback, useRef, useEffect } from "react";
import { useDropzone } from "react-dropzone";
import { 
  FileText, 
  Upload, 
  Loader2, 
  AlertCircle, 
  Trash2, 
  Layers,
  Fingerprint,
  Zap,
  ArrowRight,
  Sparkles,
  RefreshCcw,
  CheckCircle2,
  Box,
  Mail,
  FileDown,
  MessageSquare,
  Lock,
  User as UserIcon,
  LogOut
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import axios from "axios";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { supabase, isSupabaseConfigured } from "./lib/supabase";

// @ts-ignore - mammoth and pdf-lib are loaded via CDN in index.html to ensure browser compatibility
const mammoth = (window as any).mammoth;
const { PDFDocument, StandardFonts, rgb } = (window as any).PDFLib || {};

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

type DispatchStatus = 'idle' | 'processing' | 'converting' | 'success' | 'error';
type AuthMode = 'signin' | 'signup';

interface User {
  id: string;
  email: string;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authMode, setAuthMode] = useState<AuthMode>('signin');
  const [authLoading, setAuthLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [manualJwtSecret, setManualJwtSecret] = useState("");
  const [manualN8nUrl, setManualN8nUrl] = useState("");
  const [manualChatUrl, setManualChatUrl] = useState("");
  const [isUpdatingConfig, setIsUpdatingConfig] = useState(false);
  const [configSuccess, setConfigSuccess] = useState(false);
  const [systemStatus, setSystemStatus] = useState<{
    supabaseUrl: boolean;
    supabaseKey: boolean;
    supabaseSecret: boolean;
    n8nUrl: boolean;
    chatUrl: boolean;
    env: Record<string, boolean>;
  } | null>(null);

  const [uploadFile, setUploadFile] = useState<{
    native: File;
    name: string;
    type: string;
    size: number;
    lastModified: number;
  } | null>(null);

  const [instructions, setInstructions] = useState<string>("");
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [uploadStatus, setUploadStatus] = useState<DispatchStatus>('idle');
  const [chatStatus, setChatStatus] = useState<DispatchStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [errorDetails, setErrorDetails] = useState<string | null>(null);
  const [hasUploaded, setHasUploaded] = useState(false);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  // Setup Axios Interceptor for Supabase Auth
  useEffect(() => {
    const requestInterceptor = axios.interceptors.request.use(async (config) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) {
        config.headers.Authorization = `Bearer ${session.access_token}`;
      }
      return config;
    });

    return () => {
      axios.interceptors.request.eject(requestInterceptor);
    };
  }, []);

  useEffect(() => {
    checkSystemStatus();
    if (!isSupabaseConfigured) {
      setAuthLoading(false);
      return;
    }

    // Check initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUser({
          id: session.user.id,
          email: session.user.email || ""
        });
      }
      setAuthLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setUser({
          id: session.user.id,
          email: session.user.email || ""
        });
      } else {
        setUser(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const checkSystemStatus = async () => {
    try {
      const response = await axios.get("/api/system/status");
      setSystemStatus(response.data);
    } catch (err) {
      console.error("Failed to fetch system status");
    }
  };

  const handleUpdateConfig = async () => {
    setIsUpdatingConfig(true);
    try {
      await axios.post("/api/system/update-config", { 
        supabaseSecret: manualJwtSecret,
        n8nUrl: manualN8nUrl,
        chatUrl: manualChatUrl
      });
      await checkSystemStatus();
      setManualJwtSecret("");
      setManualN8nUrl("");
      setManualChatUrl("");
      setConfigSuccess(true);
      setTimeout(() => setConfigSuccess(false), 3000);
    } catch (err) {
      console.error("Failed to update config");
    } finally {
      setIsUpdatingConfig(false);
    }
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isSupabaseConfigured) {
      setAuthError("Supabase credentials are not configured. Please set them in the environment settings.");
      return;
    }

    setAuthLoading(true);
    setAuthError(null);

    try {
      if (authMode === 'signup') {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        if (data.user) {
          setUser({ id: data.user.id, email: data.user.email || "" });
        }
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        if (data.user) {
          setUser({ id: data.user.id, email: data.user.email || "" });
        }
      }
    } catch (err: any) {
      setAuthError(err.message || "Authentication failed");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      setUser(null);
      setChatHistory([]);
      setUploadFile(null);
    } catch (err) {
      console.error("Logout failed");
    }
  };

  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [chatHistory]);

  const onDropUpload = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      const nativeFile = acceptedFiles[0];
      setUploadFile({
        native: nativeFile,
        name: nativeFile.name,
        type: nativeFile.type,
        size: nativeFile.size,
        lastModified: nativeFile.lastModified
      });
      setError(null);
      if (uploadStatus === 'success') setUploadStatus('idle');
      setHasUploaded(false);
    }
  }, [uploadStatus]);

  const dropzoneConfig = {
    accept: {
      'application/pdf': ['.pdf'],
      'text/plain': ['.txt'],
      'application/msword': ['.doc'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'text/csv': ['.csv'],
      'application/vnd.ms-excel': ['.xls', '.csv'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
    },
    maxFiles: 1,
    multiple: false,
  };

  const uploadDropzone = useDropzone({ ...dropzoneConfig, onDrop: onDropUpload } as any);

  const clearUploadFile = () => {
    setUploadFile(null);
    if (uploadStatus === 'success') setUploadStatus('idle');
    setError(null);
    setHasUploaded(false);
  };

  const convertWordToPdf = async (nativeFile: File): Promise<{ data: string; name: string; size: number }> => {
    try {
      const arrayBuffer = await nativeFile.arrayBuffer();
      
      const result = await mammoth.extractRawText({ arrayBuffer });
      const text = result.value;

      const pdfDoc = await PDFDocument.create();
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
      
      const lines = text.split('\n');
      let page = pdfDoc.addPage();
      const { width, height } = page.getSize();
      const fontSize = 11;
      const margin = 50;
      let y = height - margin;

      for (const line of lines) {
        if (line.trim() === '') {
          y -= fontSize;
          continue;
        }

        if (y < margin) {
          page = pdfDoc.addPage();
          y = height - margin;
        }

        page.drawText(line, {
          x: margin,
          y,
          size: fontSize,
          font,
          color: rgb(0.1, 0.1, 0.1),
        });
        
        y -= fontSize * 1.4;
      }

      const pdfBytes = await pdfDoc.save();
      const base64 = btoa(
        new Uint8Array(pdfBytes)
          .reduce((data, byte) => data + String.fromCharCode(byte), '')
      );

      return {
        data: base64,
        name: nativeFile.name.replace(/\.(docx|doc)$/i, '.pdf'),
        size: pdfBytes.length
      };
    } catch (err) {
      console.error("Conversion failed:", err);
      throw new Error("Failed to convert Word document to PDF. Ensure it is a valid .docx file.");
    }
  };

  const handleDispatch = async () => {
    if (!uploadFile) return;

    setUploadStatus('processing');
    setError(null);

    try {
      let base64Data = "";
      let finalName = uploadFile.name;
      let finalType = uploadFile.type;
      let finalSize = uploadFile.size;

      const isWord = uploadFile.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || 
                     uploadFile.type === 'application/msword' ||
                     uploadFile.name.endsWith('.docx') || 
                     uploadFile.name.endsWith('.doc');

      if (isWord) {
        setUploadStatus('converting');
        const converted = await convertWordToPdf(uploadFile.native);
        base64Data = converted.data;
        finalName = converted.name;
        finalType = 'application/pdf';
        finalSize = converted.size;
      } else {
        const reader = new FileReader();
        base64Data = await new Promise((resolve, reject) => {
          reader.readAsDataURL(uploadFile.native);
          reader.onload = () => resolve((reader.result as string).split(',')[1]);
          reader.onerror = reject;
        });
      }
      
      setUploadStatus('processing');
      await axios.post("/api/dispatch", {
        base64Data,
        mimeType: finalType,
        fileName: finalName,
        fileSize: finalSize,
        lastModified: new Date(uploadFile.lastModified).toISOString()
      });

      setUploadStatus('success');
      setHasUploaded(true);
    } catch (err: any) {
      console.error("Dispatch Error:", err);
      const serverError = err.response?.data;
      setError(serverError?.details || serverError?.error || err.message || "Failed to forward document.");
      setUploadStatus('error');
    }
  };

  const handleChat = async () => {
    if (!instructions) return;

    const userMessage: ChatMessage = {
      role: 'user',
      content: instructions,
      timestamp: new Date().toLocaleTimeString()
    };

    setChatHistory(prev => [...prev, userMessage]);
    setInstructions("");
    setChatStatus('processing');
    setError(null);

    try {
      const response = await axios.post("/api/chat", {
        instructions: instructions
      });

      const responseData = response.data.data;
      const assistantResponse = typeof responseData === 'string' ? responseData : 
                                 (responseData?.output || responseData?.response || responseData?.message || JSON.stringify(responseData));

      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: assistantResponse,
        timestamp: new Date().toLocaleTimeString()
      };

      setChatHistory(prev => [...prev, assistantMessage]);
      setChatStatus('success');
      setTimeout(() => setChatStatus('idle'), 1000);
    } catch (err: any) {
      console.error("Chat Error:", err);
      const serverError = err.response?.data;
      setError(serverError?.details || serverError?.error || err.message || "Failed to forward instructions.");
      setChatStatus('error');
    }
  };

  if (authLoading && !user) {
    return (
      <div className="min-h-screen bg-[#fcfcfd] flex items-center justify-center">
        <Loader2 className="animate-spin text-brand" size={40} />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-[#fcfcfd] text-slate-900 flex flex-col items-center justify-center p-4 font-sans relative overflow-hidden">
        {/* Abstract Background Elements */}
        <div className="absolute top-0 left-0 w-full h-full pointer-events-none overflow-hidden -z-10">
          <div className="absolute -top-[10%] -left-[10%] w-[40%] h-[40%] bg-brand/5 rounded-full blur-[120px]" />
          <div className="absolute top-[20%] -right-[10%] w-[30%] h-[30%] bg-brand-orange/5 rounded-full blur-[100px]" />
        </div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full"
        >
          <div className="flex flex-col items-center mb-10">
            <div className="w-20 h-20 bg-brand-black rounded-[30px] flex items-center justify-center shadow-2xl mb-6 relative group overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-brand/30 to-transparent opacity-50" />
              <Layers className="text-white relative z-10" size={36} />
            </div>
            <h1 className="text-3xl font-black tracking-tighter text-brand-black text-center">
              Everything<span className="text-brand">Document</span>
            </h1>
            <p className="text-xs font-black text-slate-400 uppercase tracking-[0.3em] mt-2">Precision Context Engine</p>
          </div>

          <div className="bg-white rounded-[3rem] p-10 shadow-2xl shadow-slate-200/50 border border-slate-100 flex flex-col gap-8 relative overflow-hidden">
            {(!isSupabaseConfigured || (systemStatus && !systemStatus.supabaseSecret)) && (
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 flex flex-col gap-4">
                <div className="flex gap-4 items-start">
                  <div className="bg-amber-100 p-2 rounded-lg text-amber-600">
                    <Lock size={16} />
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] font-black text-amber-900 uppercase tracking-widest leading-none mt-1">Auth Protocol Incomplete</p>
                    <p className="text-[10px] text-amber-700 font-medium leading-relaxed">
                      Your Supabase integration is missing critical keys. <br/>
                      Find your <strong>JWT Secret</strong> in: 
                      <span className="block mt-1 font-bold text-amber-800">Supabase Settings → API → JWT Settings → JWT Secret</span>
                    </p>
                  </div>
                </div>
                
                <div className="grid grid-cols-1 gap-2">
                  <div className="flex items-center justify-between text-[8px] font-black uppercase tracking-widest px-3 py-2 bg-white/50 rounded-lg">
                    <span>VITE_SUPABASE_URL</span>
                    {systemStatus?.supabaseUrl ? <CheckCircle2 size={10} className="text-emerald-500" /> : <Box size={10} className="text-slate-300" />}
                  </div>
                  <div className="flex items-center justify-between text-[8px] font-black uppercase tracking-widest px-3 py-2 bg-white/50 rounded-lg">
                    <span>VITE_SUPABASE_ANON_KEY</span>
                    {systemStatus?.supabaseKey ? <CheckCircle2 size={10} className="text-emerald-500" /> : <Box size={10} className="text-slate-300" />}
                  </div>
                  <div className="flex items-center justify-between text-[8px] font-black uppercase tracking-widest px-3 py-2 bg-white/50 rounded-lg">
                    <span>SUPABASE_JWT_SECRET</span>
                    {systemStatus?.supabaseSecret ? <CheckCircle2 size={10} className="text-emerald-500" /> : <Box size={10} className="text-slate-300" />}
                  </div>
                </div>

                <div className="pt-2 border-t border-amber-200/50 space-y-3">
                  <div className="relative group">
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-amber-400">
                      <Key size={14} />
                    </div>
                    <input 
                      type="password"
                      placeholder="Paste JWT Secret Here"
                      value={manualJwtSecret}
                      onChange={(e) => setManualJwtSecret(e.target.value)}
                      className="w-full bg-white border-amber-100 border rounded-xl py-3 pl-10 pr-4 text-[10px] font-medium focus:outline-none focus:ring-2 focus:ring-amber-200 transition-all"
                    />
                  </div>
                  <button 
                    onClick={handleUpdateConfig}
                    disabled={isUpdatingConfig}
                    className="w-full bg-amber-600 hover:bg-amber-700 text-white py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-sm flex items-center justify-center gap-2"
                  >
                    {isUpdatingConfig ? <Loader2 className="animate-spin" size={12} /> : 'Sync Secret Protocol'}
                  </button>
                </div>
              </div>
            )}

            <div className="flex items-center gap-4 p-1 bg-slate-100 rounded-2xl">
              <button 
                onClick={() => setAuthMode('signin')}
                className={cn(
                  "flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                  authMode === 'signin' ? "bg-white text-brand shadow-sm" : "text-slate-400"
                )}
              >
                Sign In
              </button>
              <button 
                onClick={() => setAuthMode('signup')}
                className={cn(
                  "flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                  authMode === 'signup' ? "bg-white text-brand shadow-sm" : "text-slate-400"
                )}
              >
                Sign Up
              </button>
            </div>

            <form onSubmit={handleAuth} className="space-y-4">
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-4 flex items-center gap-2">
                  <UserIcon size={12} /> Email Address
                </label>
                <input 
                  type="email" 
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@company.com"
                  className="w-full h-16 bg-slate-50 border-2 border-transparent focus:bg-white focus:border-brand/30 rounded-2xl px-6 font-medium text-slate-700 outline-none transition-all placeholder:text-slate-300"
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-4 flex items-center gap-2">
                  <Lock size={12} /> Secret Key
                </label>
                <input 
                  type="password" 
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full h-16 bg-slate-50 border-2 border-transparent focus:bg-white focus:border-brand/30 rounded-2xl px-6 font-medium text-slate-700 outline-none transition-all placeholder:text-slate-300"
                />
              </div>

              {authError && (
                <p className="text-[10px] font-bold text-rose-500 uppercase tracking-wide text-center pt-2">
                  {authError}
                </p>
              )}

              <button 
                type="submit"
                disabled={authLoading}
                className="w-full h-16 bg-brand-black text-white rounded-2xl font-black uppercase tracking-widest text-xs mt-4 hover:bg-brand transition-all flex items-center justify-center gap-3 shadow-xl shadow-brand-black/10 disabled:opacity-50"
              >
                {authLoading ? <Loader2 className="animate-spin" size={18} /> : (
                  <>
                    <span>{authMode === 'signin' ? 'Verify Identity' : 'Establish Protocol'}</span>
                    <ArrowRight size={16} />
                  </>
                )}
              </button>
            </form>
          </div>

          <p className="mt-8 text-center text-[10px] font-black text-slate-300 uppercase tracking-[0.2em] max-w-[240px] mx-auto leading-relaxed">
            Encrypted interaction layer. unauthorized access is strictly logged and restricted.
          </p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#fcfcfd] text-slate-900 flex flex-col p-4 md:p-12 font-sans overflow-x-hidden">
      
      {/* Navigation */}
      <nav className="max-w-5xl w-full mx-auto flex justify-between items-center mb-12">
        <div className="flex items-center gap-4 group">
          <div className="relative">
            <div className="w-14 h-14 bg-brand-black rounded-[20px] flex items-center justify-center shadow-2xl group-hover:scale-105 transition-transform duration-500 overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-brand/20 to-transparent opacity-50" />
              <Layers className="text-white relative z-10" size={28} />
            </div>
            <div className="absolute -top-1 -right-1 w-5 h-5 bg-brand-orange rounded-full flex items-center justify-center shadow-lg border-2 border-white">
              <Sparkles className="text-white" size={10} />
            </div>
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-tighter leading-none text-brand-black flex items-center gap-1">
              Everything<span className="text-brand">Document</span>
            </h1>
            <p className="text-[10px] uppercase tracking-[0.2em] font-black text-slate-400 mt-1 flex items-center gap-2">
              <span className="w-4 h-[1px] bg-brand-orange" /> Precision Context Engine
            </p>
          </div>
        </div>
        <div className="hidden md:flex items-center gap-8">
          <div className="flex items-center gap-4 bg-white border border-slate-100 rounded-full pl-4 pr-1 py-1 shadow-sm">
             <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-400 pr-2 border-r border-slate-100">
               <Fingerprint size={12} className="text-brand-orange" />
               <span className="max-w-[120px] truncate">{user.email}</span>
             </div>
             <button 
               onClick={handleLogout}
               className="p-3 bg-slate-50 hover:bg-rose-50 text-slate-400 hover:text-rose-500 rounded-full transition-all group"
               title="Logout"
             >
               <LogOut size={14} className="group-hover:-translate-x-0.5 transition-transform" />
             </button>
          </div>
        </div>
      </nav>

      <main className="max-w-5xl w-full mx-auto space-y-8 pb-20">
        
        {/* Webhook Status Alert (Only if logged in and missing config) */}
        {user && systemStatus && (!systemStatus.n8nUrl || !systemStatus.chatUrl) && (
          <div className="bg-rose-50 border border-rose-100 p-6 rounded-[2rem] flex flex-col gap-6 shadow-sm">
            <div className="flex items-center justify-between gap-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-rose-100 rounded-2xl flex items-center justify-center text-rose-600">
                  <Box size={24} />
                </div>
                <div>
                  <h4 className="text-xs font-black uppercase tracking-widest text-rose-900">Webhook Connection Interrupted</h4>
                  <p className="text-[10px] text-rose-500 font-medium mt-1 leading-relaxed">
                    The destination webhooks are either missing or contain placeholder values.
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setShowDiagnostics(!showDiagnostics)}
                className="px-4 py-2 bg-white rounded-xl border border-rose-100 text-[9px] font-black uppercase tracking-widest text-rose-600 hover:bg-rose-600 hover:text-white transition-all shadow-sm"
              >
                {showDiagnostics ? 'Hide Status' : 'System Report'}
              </button>
            </div>

            <AnimatePresence>
              {showDiagnostics && (
                <motion.div 
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden bg-white/50 rounded-2xl border border-rose-100/50 p-6 space-y-4"
                >
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-3">
                      <p className="text-[9px] font-black text-rose-900 uppercase tracking-widest">Data Gateways</p>
                      <div className="space-y-2">
                         <div className="flex items-center justify-between p-3 bg-white rounded-xl text-[9px] font-bold uppercase tracking-wider">
                           <span className="text-slate-400">N8N_WEBHOOK_URL</span>
                           {systemStatus.n8nUrl ? <CheckCircle2 size={12} className="text-emerald-500" /> : <AlertTriangle size={12} className="text-rose-500" />}
                         </div>
                         <div className="flex items-center justify-between p-3 bg-white rounded-xl text-[9px] font-bold uppercase tracking-wider">
                           <span className="text-slate-400">CHAT_WEBHOOK_URL</span>
                           {systemStatus.chatUrl ? <CheckCircle2 size={12} className="text-emerald-500" /> : <AlertTriangle size={12} className="text-rose-500" />}
                         </div>
                      </div>
                    </div>
                    <div className="space-y-3">
                      <p className="text-[9px] font-black text-rose-900 uppercase tracking-widest">Identity Protocol</p>
                      <div className="space-y-2">
                         <div className="flex items-center justify-between p-3 bg-white rounded-xl text-[9px] font-bold uppercase tracking-wider">
                           <span className="text-slate-400">SUPABASE_JWT_SECRET</span>
                           {systemStatus.supabaseSecret ? <CheckCircle2 size={12} className="text-emerald-500" /> : <AlertTriangle size={12} className="text-rose-500" />}
                         </div>
                      </div>
                    </div>
                  </div>
                  <p className="text-[9px] text-slate-400 leading-relaxed max-w-lg italic">
                    Note: If you just updated these values, the server must be restarted to apply changes.
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* Section 1: Upload (TOP) */}
        <section className="space-y-4">
          <div className="flex items-center justify-between px-2">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-brand-black rounded-lg text-white">
                <Upload size={18} />
              </div>
              <h2 className="text-xs font-black uppercase tracking-[0.3em] text-brand-black">Upload Document</h2>
            </div>
            {hasUploaded && (
              <div className="flex items-center gap-2 text-[10px] font-black text-emerald-500 uppercase tracking-widest bg-emerald-50 px-4 py-2 rounded-full border border-emerald-100">
                <CheckCircle2 size={12} />
                <span>Uploaded</span>
              </div>
            )}
          </div>

          <div className={cn(
            "panel-white border-2 border-transparent transition-all duration-500",
            uploadStatus === 'success' ? "border-emerald-500/20 shadow-emerald-500/10" : "bg-white shadow-xl shadow-slate-100"
          )}>
            <AnimatePresence mode="wait">
              {uploadStatus === 'success' ? (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="flex flex-col items-center py-12"
                >
                  <div className="w-20 h-20 bg-emerald-50 text-emerald-500 rounded-full flex items-center justify-center mb-6 shadow-inner border border-emerald-100">
                    <CheckCircle2 size={40} />
                  </div>
                  <h3 className="text-2xl font-black mb-2 text-brand-black">Upload Successful</h3>
                  <p className="text-sm font-medium text-slate-400 mb-8 max-w-xs text-center leading-relaxed">
                    Your document has been processed and synced. Use the chat gateway below to interact with the content.
                  </p>
                  <div className="flex gap-4">
                    <button onClick={() => setUploadStatus('idle')} className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-brand bg-brand/5 px-6 py-3 rounded-xl hover:bg-brand/10 transition-all">
                      <FileText size={14} /> View File
                    </button>
                    <button onClick={clearUploadFile} className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-900 transition-colors px-6 py-3">
                      <RefreshCcw size={14} /> New Upload
                    </button>
                  </div>
                </motion.div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
                  {/* Dropzone Area */}
                  <div className="space-y-6">
                    {!uploadFile ? (
                      <div 
                        {...uploadDropzone.getRootProps()} 
                        className={cn(
                          "border-2 border-dashed rounded-[2.5rem] p-12 flex flex-col items-center justify-center text-center cursor-pointer transition-all h-[320px]",
                          uploadDropzone.isDragActive ? "border-brand bg-brand/5 scale-[0.99]" : "border-slate-100 hover:border-brand/30 bg-slate-50/50 hover:bg-white overflow-hidden relative group"
                        )}
                      >
                        <div className="absolute top-0 right-0 w-32 h-32 bg-brand-orange/5 rounded-full -mr-16 -mt-16 transition-transform group-hover:scale-150" />
                        <input {...uploadDropzone.getInputProps()} />
                        <div className="w-20 h-20 bg-white rounded-3xl shadow-sm border border-slate-100 flex items-center justify-center mb-6 relative z-10">
                          <Upload size={32} className="text-brand" />
                        </div>
                        <h3 className="font-bold text-slate-900 text-lg relative z-10">Select Document</h3>
                        <p className="text-[10px] text-slate-300 mt-2 font-black uppercase tracking-[0.2em] relative z-10">PDF, Word, CSV, Excel, TXT</p>
                      </div>
                    ) : (
                      <div className="p-8 rounded-[2.5rem] bg-slate-50 border border-slate-100 h-[320px] flex flex-col">
                        <div className="flex-1 flex flex-col items-center justify-center text-center">
                          <div className="w-20 h-20 bg-white rounded-3xl shadow-xl shadow-slate-200/50 flex items-center justify-center mb-6 text-slate-400">
                            <FileText size={40} />
                          </div>
                          <h3 className="text-xl font-bold text-slate-900 truncate max-w-full px-4">{uploadFile.name}</h3>
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-2">
                            {(uploadFile.size / 1024 / 1024).toFixed(2)} MB • READY
                          </p>
                        </div>
                        <button 
                          onClick={clearUploadFile}
                          className="mt-4 flex items-center justify-center gap-2 py-4 px-6 rounded-2xl bg-white border border-rose-100 text-rose-400 text-[10px] font-black uppercase tracking-widest hover:bg-rose-50 hover:text-rose-600 transition-all"
                        >
                          <Trash2 size={14} /> Remove File
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Submission Info Area */}
                  <div className="bg-slate-50/50 rounded-[2.5rem] p-8 border border-slate-100 h-full lg:min-h-[320px] flex flex-col justify-center">
                    <div className="flex-1 flex flex-col justify-center">
                      <div className="flex items-center gap-2 mb-6">
                        <Zap size={16} className="text-brand-orange" />
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Document Sync</span>
                      </div>
                      
                      <p className="text-sm text-slate-500 leading-relaxed font-medium">
                        Files uploaded here are processed and synced to the automation engine for immediate context availability.
                      </p>
                    </div>

                    <button
                      disabled={uploadStatus === 'processing' || uploadStatus === 'converting' || !uploadFile}
                      onClick={handleDispatch}
                      className="w-full mt-8 bg-brand-black text-white h-20 rounded-[1.5rem] flex items-center justify-center gap-3 font-black uppercase tracking-widest text-xs hover:bg-brand transition-all shadow-xl shadow-slate-900/10 disabled:opacity-20 group"
                    >
                      {uploadStatus === 'processing' ? (
                        <>
                          <Loader2 className="animate-spin" size={20} />
                          <span>Processing...</span>
                        </>
                      ) : uploadStatus === 'converting' ? (
                        <>
                          <RefreshCcw className="animate-spin" size={20} />
                          <span>Preparing...</span>
                        </>
                      ) : (
                        <>
                          <Upload size={18} className={cn(uploadFile ? "text-brand-orange" : "opacity-40")} />
                          <span>Upload Document</span>
                          <ArrowRight size={16} className="opacity-40 group-hover:translate-x-2 transition-transform" />
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </AnimatePresence>
          </div>
        </section>

        {/* Section 2: Chat & Settings */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Chat Gateway (Left/Main) */}
          <section className="lg:col-span-2 space-y-4 flex flex-col h-full">
            <div className="flex items-center gap-3 px-2">
              <div className="p-2 bg-brand rounded-lg text-white">
                <MessageSquare size={18} />
              </div>
              <h2 className="text-xs font-black uppercase tracking-[0.3em] text-brand-black">Chat with document</h2>
            </div>

            <div className="panel-white border-2 border-transparent transition-all duration-500 bg-white shadow-xl shadow-slate-100 overflow-hidden flex flex-col h-[600px] rounded-[3rem]">
              <div 
                ref={chatContainerRef}
                className="flex-1 p-8 overflow-y-auto space-y-6 bg-slate-50/30 scroll-smooth"
              >
                {chatHistory.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center py-20">
                    <div className="w-16 h-16 bg-white rounded-3xl flex items-center justify-center mb-6 text-slate-200 border border-slate-100 shadow-sm">
                      <MessageSquare size={32} />
                    </div>
                    <p className="text-xs text-slate-400 font-black uppercase tracking-widest max-w-[200px]">No messages yet. Send a query to begin.</p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {chatHistory.map((msg, idx) => (
                      <motion.div 
                        key={idx}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={cn(
                          "flex flex-col max-w-[85%]",
                          msg.role === 'user' ? "ml-auto items-end" : "mr-auto items-start"
                        )}
                      >
                        <div className={cn(
                          "p-6 rounded-[2rem] text-sm leading-relaxed",
                          msg.role === 'user' 
                            ? "bg-brand-black text-white rounded-tr-none shadow-lg shadow-slate-900/10" 
                            : "bg-white text-slate-700 rounded-tl-none border border-slate-100 shadow-sm"
                        )}>
                          {msg.content}
                        </div>
                        <span className="text-[9px] font-black text-slate-300 uppercase tracking-widest mt-2 px-2">
                          {msg.role === 'user' ? 'You' : 'Assistant'} &bull; {msg.timestamp}
                        </span>
                      </motion.div>
                    ))}
                    {chatStatus === 'processing' && (
                      <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="flex flex-col items-start mr-auto"
                      >
                        <div className="p-6 bg-white rounded-[2rem] rounded-tl-none border border-slate-100 flex items-center gap-3">
                          <Loader2 className="animate-spin text-brand" size={18} />
                          <span className="text-xs font-black uppercase tracking-widest text-slate-400">Processing...</span>
                        </div>
                      </motion.div>
                    )}
                  </div>
                )}
              </div>

              <div className="border-t border-slate-100 p-8 bg-white">
                <div className="space-y-6">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between px-4">
                      <div className="flex items-center gap-2 text-slate-400">
                        <Mail size={16} />
                        <span className="text-[10px] font-black uppercase tracking-widest">Query Instructions</span>
                      </div>
                      {chatHistory.length > 0 && (
                        <button 
                          onClick={() => setChatHistory([])}
                          className="text-[10px] font-black uppercase tracking-widest text-slate-300 hover:text-rose-500 transition-colors flex items-center gap-2"
                        >
                          <Trash2 size={12} /> Clear Chat
                        </button>
                      )}
                    </div>
                    <div className="relative group">
                      <textarea
                        value={instructions}
                        onChange={(e) => setInstructions(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            handleChat();
                          }
                        }}
                        placeholder="Type your message..."
                        className={cn(
                          "w-full min-h-[100px] p-6 rounded-[2rem] text-slate-700 font-medium placeholder:text-slate-300 resize-none transition-all outline-none bg-slate-50/50 border-2 border-transparent focus:bg-white focus:border-brand/40 shadow-inner"
                        )}
                      />
                    </div>
                  </div>

                  <button
                    disabled={chatStatus === 'processing' || !instructions}
                    onClick={handleChat}
                    className="w-full bg-brand-black text-white h-16 rounded-2xl flex items-center justify-center gap-4 text-xs font-black uppercase tracking-widest shadow-xl hover:bg-brand transition-all disabled:opacity-10 group"
                  >
                    {chatStatus === 'processing' ? <Loader2 className="animate-spin" size={18} /> : <span>Dispatch Query</span>}
                    <ArrowRight size={16} className="opacity-30 group-hover:translate-x-2 transition-transform" />
                  </button>
                </div>
              </div>
            </div>
          </section>

          {/* System Console (Right Sidebar) */}
          <section className="space-y-4">
             <div className="flex items-center gap-3 px-2">
                <div className="p-2 bg-brand-black rounded-lg text-white">
                  <Fingerprint size={18} />
                </div>
                <h2 className="text-xs font-black uppercase tracking-[0.3em] text-brand-black">System Console</h2>
             </div>
             
             <div className="panel-white bg-slate-50 p-8 border border-slate-100 flex flex-col gap-6 rounded-[3rem] shadow-xl shadow-slate-100 min-h-[600px]">
                <div className="flex-1 space-y-6">
                   <div className="space-y-2">
                      <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 flex items-center justify-between">
                        SUPABASE_JWT_SECRET
                        {systemStatus?.supabaseSecret && <CheckCircle2 size={12} className="text-emerald-500" />}
                      </label>
                      <input 
                        type="password"
                        placeholder="Paste JWT Secret"
                        value={manualJwtSecret}
                        onChange={(e) => setManualJwtSecret(e.target.value)}
                        className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-[10px] font-medium focus:ring-2 focus:ring-brand/10 outline-none transition-all"
                      />
                   </div>

                   <div className="space-y-2">
                      <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 flex items-center justify-between">
                        N8N_WEBHOOK_URL
                        {systemStatus?.n8nUrl && <CheckCircle2 size={12} className="text-emerald-500" />}
                      </label>
                      <input 
                        type="text"
                        placeholder="e.g. https://your-n8n.com/..."
                        value={manualN8nUrl}
                        onChange={(e) => setManualN8nUrl(e.target.value)}
                        className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-[10px] font-medium focus:ring-2 focus:ring-brand/10 outline-none transition-all"
                      />
                   </div>

                   <div className="space-y-2">
                      <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 flex items-center justify-between">
                        CHAT_WEBHOOK_URL
                        {systemStatus?.chatUrl && <CheckCircle2 size={12} className="text-emerald-500" />}
                      </label>
                      <input 
                        type="text"
                        placeholder="e.g. https://your-n8n.com/..."
                        value={manualChatUrl}
                        onChange={(e) => setManualChatUrl(e.target.value)}
                        className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-[10px] font-medium focus:ring-2 focus:ring-brand/10 outline-none transition-all"
                      />
                   </div>

                   <div className="bg-amber-50 rounded-2xl p-4 border border-amber-100">
                      <p className="text-[9px] text-amber-700 leading-relaxed font-medium">
                        <b>Critical Protocol:</b> If you are using Supabase, look for the <b>JWT Secret</b> in your dashboard under Settings &rarr; API. Paste it above to verify your session keys.
                      </p>
                   </div>
                </div>

                <button 
                  onClick={handleUpdateConfig}
                  disabled={isUpdatingConfig}
                  className={cn(
                    "w-full h-14 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2",
                    configSuccess ? "bg-emerald-500 text-white shadow-emerald-200" : "bg-brand-black text-white hover:bg-brand shadow-xl shadow-brand-black/5"
                  )}
                >
                  {isUpdatingConfig ? <Loader2 className="animate-spin" size={14} /> : (
                    configSuccess ? <> <CheckCircle2 size={14} /> Synced </> : <> <RefreshCcw size={14} /> Update Console </>
                  )}
                </button>
                
                <p className="text-[9px] text-slate-300 italic leading-relaxed text-center px-4">
                  Changes apply to the current active session only.
                </p>
             </div>
          </section>
        </div>

        {/* Global Error Banner */}
        {error && (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-6 bg-rose-50 border border-rose-100 rounded-[2rem] flex items-start gap-4 mx-auto max-w-lg"
          >
            <AlertCircle className="text-rose-500 mt-1 shrink-0" size={20} />
            <div>
              <h4 className="text-sm font-bold text-rose-800 uppercase tracking-wide">Gateway Warning</h4>
              <p className="text-xs text-rose-600 mt-1 leading-relaxed font-medium">{error}</p>
            </div>
          </motion.div>
        )}

      </main>

      <footer className="max-w-5xl w-full mx-auto mt-auto py-12 border-t border-slate-100 flex flex-col md:flex-row justify-between items-center text-[10px] font-bold text-slate-300 uppercase tracking-[0.2em] gap-8">
        <div className="flex items-center gap-8">
          <span className="text-slate-900">ENCRYPTED</span>
          <span>&bull;</span>
          <span>PROTOCOL v3.2.0</span>
        </div>
        <div className="flex items-center gap-3 group">
          <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_12px_rgba(16,185,129,0.5)]" />
          <span className="group-hover:text-slate-900 transition-colors">Integration Active</span>
        </div>
      </footer>
    </div>
  );
}
