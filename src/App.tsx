import { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { 
  FileText, 
  Upload, 
  Loader2, 
  AlertCircle, 
  Trash2, 
  Copy,
  Layers,
  Fingerprint,
  Zap,
  ArrowRight,
  Sparkles,
  ClipboardCheck,
  RefreshCcw,
  Webhook,
  Globe
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import axios from "axios";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface SummaryResult {
  fileName: string;
  summary: string;
  timestamp: string;
  webhookStatus?: 'idle' | 'sending' | 'success' | 'failed';
}

export default function App() {
  const [file, setFile] = useState<File | null>(null);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [summaryResult, setSummaryResult] = useState<SummaryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      setFile(acceptedFiles[0]);
      setError(null);
      setSummaryResult(null);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'text/plain': ['.txt'],
      'application/msword': ['.doc'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
    },
    maxFiles: 1,
    multiple: false,
  } as any);

  const clearFile = () => {
    setFile(null);
    setSummaryResult(null);
    setError(null);
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const base64String = (reader.result as string).split(',')[1];
        resolve(base64String);
      };
      reader.onerror = error => reject(error);
    });
  };

  const triggerWebhook = async (payload: any) => {
    if (!webhookUrl) return;

    setSummaryResult(prev => prev ? { ...prev, webhookStatus: 'sending' } : null);

    try {
      await axios.post("/api/trigger-webhook", {
        url: webhookUrl,
        data: payload,
        secret: webhookSecret,
      });
      setSummaryResult(prev => prev ? { ...prev, webhookStatus: 'success' } : null);
    } catch (err) {
      console.error("Webhook failed:", err);
      setSummaryResult(prev => prev ? { ...prev, webhookStatus: 'failed' } : null);
    }
  };

  const handleSummarize = async () => {
    if (!file) return;

    setIsSummarizing(true);
    setError(null);

    try {
      const base64Data = await fileToBase64(file);
      
      const response = await axios.post("/api/summarize", {
        base64Data,
        mimeType: file.type || "application/pdf",
        fileName: file.name
      });

      const { summary, timestamp } = response.data;
      
      const result: SummaryResult = {
        fileName: file.name,
        summary,
        timestamp,
        webhookStatus: 'idle'
      };

      setSummaryResult(result);

      // Trigger Webhook with File + Summary as requested
      if (webhookUrl) {
        await triggerWebhook({
          event: "document_processed",
          file: {
            name: file.name,
            type: file.type,
            size: file.size,
            data: base64Data // The ACTUAL file is sent to webhook
          },
          summary: summary,
          timestamp: timestamp
        });
      }
    } catch (err: any) {
      console.error("Analysis Error:", err);
      setError(err.response?.data?.error || "Failed to process document. Please ensure it is a valid text-based file.");
    } finally {
      setIsSummarizing(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-bg text-text-main flex flex-col p-4 md:p-12">
      
      {/* Navigation */}
      <nav className="max-w-5xl w-full mx-auto flex justify-between items-center mb-16">
        <div className="flex items-center gap-4 group">
          <div className="w-12 h-12 bg-brand rounded-2xl flex items-center justify-center shadow-lg shadow-brand/20 group-hover:scale-110 transition-transform">
            <Layers className="text-white" size={24} />
          </div>
          <div>
            <h1 className="text-xl font-black tracking-tight leading-none text-slate-900">EVERYTHING DOCUMENT</h1>
            <p className="text-[10px] uppercase tracking-[0.2em] font-bold text-slate-400 mt-1">Intelligence Pipeline</p>
          </div>
        </div>
        <div className="hidden md:flex items-center gap-6">
          <Fingerprint size={20} className="text-slate-300" />
        </div>
      </nav>

      <main className="max-w-5xl w-full mx-auto flex-1 grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        <div className="lg:col-span-7 space-y-8">
          
          {/* Main Workzone */}
          <section className="panel-white overflow-hidden relative w-full">
            <div className="absolute top-0 right-0 p-8 opacity-5">
              <Sparkles size={120} />
            </div>

            <header className="mb-8 relative z-10 flex justify-between items-center">
              <div>
                <span className="label-caps">Process</span>
                <h2 className="text-2xl font-bold tracking-tight">Document Summary</h2>
              </div>
              {summaryResult && (
                <button 
                  onClick={clearFile}
                  className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-slate-400 hover:text-red-500 transition-colors"
                >
                  <RefreshCcw size={14} />
                  Reset
                </button>
              )}
            </header>

            <div className="space-y-8 relative z-10">
              <AnimatePresence mode="wait">
                {!file && !summaryResult ? (
                  <motion.div 
                    key="uploader"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                  >
                    <div 
                      {...getRootProps()} 
                      className={cn(
                        "border-2 border-dashed rounded-[2.5rem] h-64 flex flex-col items-center justify-center text-center cursor-pointer transition-all",
                        isDragActive ? "border-brand bg-brand-soft" : "border-slate-200 hover:border-brand/40 group bg-slate-50/50"
                      )}
                    >
                      <input {...getInputProps()} />
                      <div className="w-16 h-16 bg-white rounded-2xl shadow-sm border border-slate-100 flex items-center justify-center mb-4 group-hover:-translate-y-2 transition-transform">
                        <Upload size={28} className="text-brand" />
                      </div>
                      <p className="font-bold text-slate-600 uppercase tracking-widest text-sm">Upload File</p>
                      <p className="text-[10px] text-slate-400 mt-1 font-bold">PDF, DOCX, TXT</p>
                    </div>
                  </motion.div>
                ) : !summaryResult ? (
                  <motion.div 
                    key="file-ready"
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="space-y-8"
                  >
                    <div className="p-6 rounded-[2rem] bg-slate-50 border border-slate-200 flex items-center justify-between">
                      <div className="flex items-center gap-6">
                        <div className="w-14 h-14 bg-white rounded-2xl shadow-sm flex items-center justify-center text-brand">
                          <FileText size={28} />
                        </div>
                        <div>
                          <p className="text-base font-bold text-slate-800 break-all">{file?.name}</p>
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                            {file ? (file.size / 1024 / 1024).toFixed(2) : 0} MB • READY
                          </p>
                        </div>
                      </div>
                      <button 
                        onClick={clearFile}
                        className="w-10 h-10 rounded-xl hover:bg-red-50 hover:text-red-500 transition-colors flex items-center justify-center text-slate-300"
                      >
                        <Trash2 size={20} />
                      </button>
                    </div>

                    <button
                      disabled={isSummarizing}
                      onClick={handleSummarize}
                      className="modern-btn w-full flex items-center justify-center gap-3 h-16 shadow-xl shadow-brand/10"
                    >
                      {isSummarizing ? (
                        <>
                          <Loader2 className="animate-spin" size={20} />
                          <span>PROCESSING...</span>
                        </>
                      ) : (
                        <>
                          <Zap size={20} />
                          <span>SEND TO PIPELINE</span>
                          <ArrowRight size={18} className="opacity-40" />
                        </>
                      )}
                    </button>
                  </motion.div>
                ) : (
                  <motion.div 
                    key="result"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-8"
                  >
                    <div className="flex items-center justify-between px-2">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-brand" />
                        <span className="text-xs font-bold text-brand uppercase tracking-[0.2em]">ANALYSIS COMPLETE</span>
                      </div>
                      <button 
                        onClick={() => copyToClipboard(summaryResult.summary)}
                        className={cn(
                          "flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold uppercase transition-all",
                          copied ? "bg-emerald-500 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                        )}
                      >
                        {copied ? <ClipboardCheck size={14} /> : <Copy size={14} />}
                        {copied ? "Copied" : "Copy"}
                      </button>
                    </div>

                    <div className="p-8 bg-slate-50 rounded-[2rem] border border-slate-200 relative overflow-hidden">
                      <p className="text-lg font-medium leading-relaxed text-slate-700 relative z-10 whitespace-pre-wrap">
                        {summaryResult.summary}
                      </p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {error && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="p-6 bg-rose-50 border border-rose-100 rounded-[2rem] flex items-start gap-4"
                >
                  <AlertCircle className="text-rose-500 mt-1 shrink-0" size={20} />
                  <div>
                    <h4 className="text-sm font-bold text-rose-800 uppercase tracking-wide">Analysis Failure</h4>
                    <p className="text-xs text-rose-600 mt-1 leading-relaxed font-medium">{error}</p>
                  </div>
                </motion.div>
              )}
            </div>
          </section>
        </div>

        {/* Right Col: Webhook Config */}
        <div className="lg:col-span-5 space-y-8">
           <section className="panel-white flex flex-col h-full bg-white/50 backdrop-blur-md">
            <header className="mb-8 flex justify-between items-center">
              <div>
                <span className="label-caps">Distribution</span>
                <h2 className="text-xl font-bold tracking-tight">Post-Process Hook</h2>
              </div>
              <AnimatePresence>
                {summaryResult?.webhookStatus && (
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0 }}
                    className={cn(
                      "px-2 py-1 rounded-md text-[9px] font-black uppercase ring-1 ring-inset",
                      summaryResult.webhookStatus === 'sending' && "bg-brand/10 text-brand ring-brand/20",
                      summaryResult.webhookStatus === 'success' && "bg-emerald-100 text-emerald-700 ring-emerald-200",
                      summaryResult.webhookStatus === 'failed' && "bg-rose-100 text-rose-700 ring-rose-200",
                      summaryResult.webhookStatus === 'idle' && "bg-slate-100 text-slate-500 ring-slate-200"
                    )}
                  >
                    {summaryResult.webhookStatus}
                  </motion.div>
                )}
              </AnimatePresence>
            </header>

            <div className="space-y-6 flex-1">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                  <Globe size={14} className="text-brand" />
                  Target URL
                </label>
                <input 
                  type="url"
                  placeholder="https://your-system.com/webhook"
                  className="modern-input w-full text-xs"
                  value={webhookUrl}
                  onChange={(e) => setWebhookUrl(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                  <Fingerprint size={14} className="text-brand" />
                  Secret Signature
                </label>
                <input 
                  type="password"
                  placeholder="X-EverythingDocument-Signature"
                  className="modern-input w-full text-xs"
                  value={webhookSecret}
                  onChange={(e) => setWebhookSecret(e.target.value)}
                />
              </div>

              <div className="mt-4 p-5 bg-slate-50 rounded-2xl border border-slate-100/50">
                <div className="flex items-center gap-3 mb-2">
                  <Webhook size={16} className={webhookUrl ? "text-brand" : "text-slate-300"} />
                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Automation Logic</span>
                </div>
                <p className="text-[10px] text-slate-400 leading-relaxed font-medium">
                  When a document is summarized, the full base64 file data and intelligence summary are securely dispatched to the target URL.
                </p>
              </div>
            </div>
           </section>
        </div>
      </main>

      {/* Footer */}
      <footer className="max-w-5xl w-full mx-auto mt-12 py-8 border-t border-slate-100 flex justify-between items-center text-[10px] font-bold text-slate-300 uppercase tracking-[0.2em] select-none">
        <div className="flex items-center gap-6">
          <span>&copy; 2026 Everything Document</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-1.5 h-1.5 bg-brand rounded-full shadow-[0_0_8px_rgba(59,130,246,0.5)] animate-pulse" />
          <span>v2.3.0 DISPATCH</span>
        </div>
      </footer>
    </div>
  );
}
