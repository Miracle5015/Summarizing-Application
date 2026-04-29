import { useState, useCallback } from "react";
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
  MessageSquare
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import axios from "axios";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

// @ts-ignore - mammoth and pdf-lib are loaded via CDN in index.html to ensure browser compatibility
const mammoth = (window as any).mammoth;
const { PDFDocument, StandardFonts, rgb } = (window as any).PDFLib || {};

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

type DispatchStatus = 'idle' | 'processing' | 'converting' | 'success' | 'error';

export default function App() {
  const [uploadFile, setUploadFile] = useState<{
    native: File;
    name: string;
    type: string;
    size: number;
    lastModified: number;
  } | null>(null);

  const [instructions, setInstructions] = useState<string>("");
  const [uploadStatus, setUploadStatus] = useState<DispatchStatus>('idle');
  const [chatStatus, setChatStatus] = useState<DispatchStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [hasUploaded, setHasUploaded] = useState(false);

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

    setChatStatus('processing');
    setError(null);

    try {
      setChatStatus('processing');
      await axios.post("/api/chat", {
        instructions: instructions
      });

      setChatStatus('success');
      setInstructions("");
    } catch (err: any) {
      console.error("Chat Error:", err);
      const serverError = err.response?.data;
      setError(serverError?.details || serverError?.error || err.message || "Failed to forward instructions.");
      setChatStatus('error');
    }
  };

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
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-400">
            <CheckCircle2 size={12} className="text-brand-orange" />
            <span>AI Verified</span>
          </div>
        </div>
      </nav>

      <main className="max-w-5xl w-full mx-auto space-y-8 pb-20">
        
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

        {/* Section 2: Chat (BOTTOM) */}
        <section className="space-y-4">
          <div className="flex items-center gap-3 px-2">
            <div className="p-2 bg-brand rounded-lg text-white">
              <MessageSquare size={18} />
            </div>
            <h2 className="text-xs font-black uppercase tracking-[0.3em] text-brand-black">Chat with document</h2>
          </div>

          <div className={cn(
            "panel-white border-2 border-transparent transition-all duration-500 bg-white shadow-xl shadow-slate-100",
            chatStatus === 'success' ? "border-emerald-500/20 shadow-emerald-500/10" : ""
          )}>
            <AnimatePresence mode="wait">
              {chatStatus === 'success' ? (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex flex-col items-center py-12"
                >
                  <div className="w-20 h-20 bg-brand text-white rounded-full flex items-center justify-center mb-6 shadow-xl shadow-brand/20">
                    <Sparkles size={40} />
                  </div>
                  <h3 className="text-2xl font-black mb-2 text-brand-black">Query Dispatched</h3>
                  <p className="text-sm font-medium text-slate-400 mb-8 max-w-xs text-center leading-relaxed">
                    Your document and instructions have been sent to the chat gateway.
                  </p>
                  <button onClick={() => setChatStatus('idle')} className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-brand hover:text-slate-900 transition-colors">
                    <RefreshCcw size={14} /> Another Query
                  </button>
                </motion.div>
              ) : (
                <div className="space-y-6">
                  {/* Chat Input area */}
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 px-4 text-slate-400">
                      <Mail size={16} />
                      <span className="text-[10px] font-black uppercase tracking-widest">Query Instructions</span>
                    </div>
                    <div className="relative group">
                      <textarea
                        value={instructions}
                        onChange={(e) => setInstructions(e.target.value)}
                        placeholder="Type your message or instructions for the gateway..."
                        className={cn(
                          "w-full min-h-[160px] p-10 rounded-[3rem] text-slate-700 font-medium placeholder:text-slate-300 resize-none transition-all outline-none bg-slate-50/50 border-2 border-transparent focus:bg-white focus:border-brand/40 shadow-inner"
                        )}
                      />
                      <div className="absolute bottom-10 right-10">
                        <Sparkles 
                          size={32} 
                          className={cn(
                            "transition-all duration-500", 
                            instructions ? "text-brand-orange scale-110" : "text-slate-200"
                          )} 
                        />
                      </div>
                    </div>
                  </div>

                  <button
                    disabled={chatStatus === 'processing' || !instructions}
                    onClick={handleChat}
                    className="w-full bg-brand-black text-white h-20 rounded-[1.5rem] flex items-center justify-center gap-4 text-lg shadow-xl hover:bg-brand transition-all disabled:opacity-10 group"
                  >
                    {chatStatus === 'processing' ? (
                      <>
                        <Loader2 className="animate-spin" size={24} />
                        <span className="text-xs uppercase font-black tracking-widest">Processing...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles size={24} className={cn(instructions ? "animate-pulse text-white" : "opacity-30")} />
                        <span className="font-black tracking-tight text-sm uppercase">Dispatch Chat Query</span>
                        <ArrowRight size={20} className="opacity-30 group-hover:translate-x-3 transition-transform" />
                      </>
                    )}
                  </button>

                  <div className="flex justify-center flex-col items-center gap-1 pt-4 opacity-30">
                    <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400">Context Connector</p>
                    <p className="text-[9px] font-bold text-slate-900 mono">/api/chat</p>
                  </div>
                </div>
              )}
            </AnimatePresence>
          </div>
        </section>

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
