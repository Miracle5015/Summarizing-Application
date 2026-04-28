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
  FileDown
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

type DispatchStatus = 'idle' | 'processing' | 'converting' | 'success' | 'chat_success' | 'error';

export default function App() {
  const [file, setFile] = useState<{
    native: File;
    name: string;
    type: string;
    size: number;
    lastModified: number;
    isConverted?: boolean;
  } | null>(null);
  const [instructions, setInstructions] = useState<string>("");
  const [status, setStatus] = useState<DispatchStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      const nativeFile = acceptedFiles[0];
      setFile({
        native: nativeFile,
        name: nativeFile.name,
        type: nativeFile.type,
        size: nativeFile.size,
        lastModified: nativeFile.lastModified
      });
      setError(null);
      setStatus('idle');
      // Set focus to textarea after a short delay for transition
      setTimeout(() => {
        document.getElementById('chat-input')?.focus();
      }, 100);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
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
  } as any);

  const clearFile = () => {
    setFile(null);
    setInstructions("");
    setStatus('idle');
    setError(null);
  };

  const convertWordToPdf = async (nativeFile: File): Promise<{ data: string; name: string; size: number }> => {
    try {
      const arrayBuffer = await nativeFile.arrayBuffer();
      
      // 1. Extract text from DOCX
      const result = await mammoth.extractRawText({ arrayBuffer });
      const text = result.value;

      // 2. Create PDF
      const pdfDoc = await PDFDocument.create();
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
      
      // Basic pagination logic
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

        // Handle text wrapping briefly
        const textWidth = font.widthOfTextAtSize(line, fontSize);
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

  const handleChat = async () => {
    if (!file && !instructions) return;

    setStatus('processing');
    setError(null);

    try {
      let base64Data = null;
      let finalName = file?.name || "none";
      let finalType = file?.type || "none";
      let finalSize = file?.size || 0;

      if (file) {
        const isWord = file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || 
                       file.type === 'application/msword' ||
                       file.name.endsWith('.docx') || 
                       file.name.endsWith('.doc');

        if (isWord) {
          setStatus('converting');
          const converted = await convertWordToPdf(file.native);
          base64Data = converted.data;
          finalName = converted.name;
          finalType = 'application/pdf';
          finalSize = converted.size;
        } else {
          const reader = new FileReader();
          base64Data = await new Promise((resolve, reject) => {
            reader.readAsDataURL(file.native);
            reader.onload = () => resolve((reader.result as string).split(',')[1]);
            reader.onerror = reject;
          });
        }
      }
      
      setStatus('processing');
      await axios.post("/api/chat", {
        base64Data,
        mimeType: finalType,
        fileName: finalName,
        fileSize: finalSize,
        lastModified: file ? new Date(file.lastModified).toISOString() : new Date().toISOString(),
        instructions: instructions
      });

      setStatus('chat_success');
      setInstructions("");
    } catch (err: any) {
      console.error("Chat Error:", err);
      setError(err.response?.data?.error || err.message || "Failed to forward instructions. Please check server logs.");
      setStatus('error');
    }
  };

  return (
    <div className="min-h-screen bg-bg text-text-main flex flex-col p-4 md:p-12 font-sans">
      
      {/* Navigation */}
      <nav className="max-w-4xl w-full mx-auto flex justify-between items-center mb-16">
        <div className="flex items-center gap-4 group">
          <div className="w-12 h-12 bg-brand rounded-2xl flex items-center justify-center shadow-lg shadow-brand/20 group-hover:scale-110 transition-transform">
            <Layers className="text-white" size={24} />
          </div>
          <div>
            <h1 className="text-xl font-black tracking-tight leading-none text-slate-900 uppercase">Everything Document</h1>
            <p className="text-[10px] uppercase tracking-[0.2em] font-bold text-slate-400 mt-1">Integration Gateway</p>
          </div>
        </div>
        <div className="hidden md:flex items-center gap-6">
          <Fingerprint size={20} className="text-slate-300" />
        </div>
      </nav>

      <main className="max-w-4xl w-full mx-auto flex-1 flex flex-col items-center">
        
        {/* Simplified Site Heading */}
        <div className="text-center mb-12 max-w-2xl px-4">
          <h2 className="text-3xl md:text-4xl font-black text-slate-900 tracking-tight mb-4">
            Automated Document Integration.
          </h2>
          <p className="text-slate-500 font-medium leading-relaxed">
            Securely upload and dispatch your documents. Word files are automatically converted to PDF for seamless processing.
          </p>
        </div>

        <div className="w-full space-y-8">
          
          {/* Main Workzone */}
          <section className="panel-white overflow-hidden relative w-full shadow-2xl shadow-slate-200/50">
            <div className="absolute top-0 right-0 p-8 opacity-5">
              <Box size={120} />
            </div>

            <header className="mb-8 relative z-10 flex justify-between items-center">
              <div>
                <span className="label-caps">Process</span>
                <h2 className="text-2xl font-bold tracking-tight text-brand">V2: Upload Document & Chat</h2>
              </div>
              {(status === 'success' || status === 'chat_success') && (
                <button 
                  onClick={clearFile}
                  className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-slate-400 hover:text-brand transition-colors"
                >
                  <RefreshCcw size={14} />
                  New Upload
                </button>
              )}
            </header>

            <div className="space-y-8 relative z-10">
              <AnimatePresence mode="wait">
                {status !== 'success' && status !== 'chat_success' ? (
                  <motion.div 
                    key="active-zone"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="space-y-8"
                  >
                    {/* Main Interaction Area */}
                    {!file ? (
                      <div 
                        {...getRootProps()} 
                        className={cn(
                          "border-2 border-dashed rounded-[2.5rem] h-56 flex flex-col items-center justify-center text-center cursor-pointer transition-all",
                          isDragActive ? "border-brand bg-brand-soft" : "border-slate-200 hover:border-brand/40 group bg-slate-100/30"
                        )}
                      >
                        <input {...getInputProps()} />
                        <div className="w-16 h-16 bg-white rounded-3xl shadow-sm border border-slate-100 flex items-center justify-center mb-4 group-hover:-translate-y-2 transition-transform duration-300">
                          <Upload size={28} className="text-brand" />
                        </div>
                        <p className="font-bold text-slate-700 uppercase tracking-widest text-xs">Start by Attaching a Document</p>
                        <p className="text-[10px] text-slate-400 mt-1 font-bold italic uppercase tracking-wider">PDF, DOCX, XLSX, CSV, TXT</p>
                      </div>
                    ) : (
                      <div className="p-8 rounded-[2.5rem] bg-slate-50 border border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-6 shadow-sm">
                        <div className="flex items-center gap-6">
                          <div className="w-16 h-16 bg-white rounded-2xl shadow-sm flex items-center justify-center text-brand border border-slate-100 shadow-xl shadow-brand/10">
                            <FileText size={32} />
                          </div>
                          <div>
                            <p className="text-lg font-bold text-slate-800 break-all">{file?.name}</p>
                            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1">
                              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest bg-white py-0.5 px-2 rounded-md border border-slate-100 shadow-sm">
                                {file ? (file.size / 1024 / 1024).toFixed(2) : 0} MB
                              </p>
                              {(file?.name.endsWith('.docx') || file?.name.endsWith('.doc')) && (
                                <p className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest bg-emerald-50 py-0.5 px-2 rounded-md border border-emerald-100 shadow-sm flex items-center gap-1">
                                  <Sparkles size={10} />
                                  Ready to Convert
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                        <button 
                          onClick={clearFile}
                          className="w-12 h-12 rounded-2xl hover:bg-red-50 hover:text-red-500 transition-all flex items-center justify-center text-slate-300 border border-slate-200 hover:border-red-100"
                          title="Remove File"
                        >
                          <Trash2 size={24} />
                        </button>
                      </div>
                    )}

                    {/* Chat & Instruction Space */}
                    <div className="space-y-4">
                      <div className="flex items-center justify-between px-4">
                        <div className="flex items-center gap-2">
                          <Mail size={16} className="text-brand" />
                          <span className="text-[10px] font-black uppercase tracking-widest text-slate-600">Chat with Document</span>
                        </div>
                        {file && (
                          <span className="text-[10px] bg-emerald-100 text-emerald-600 px-2 py-1 rounded-full font-black uppercase tracking-[0.2em] animate-pulse">Context Active</span>
                        )}
                      </div>
                      <div className="relative group">
                        <textarea
                          id="chat-input"
                          value={instructions}
                          onChange={(e) => setInstructions(e.target.value)}
                          placeholder={file ? "Ask something about this document... (e.g. 'Summarize this', 'Check for errors')" : "Upload a document to start chatting, or type instructions here..."}
                          className="w-full min-h-[200px] p-8 rounded-[2.5rem] bg-slate-100/50 border-2 border-transparent focus:border-brand/40 focus:bg-white focus:ring-4 focus:ring-brand/5 transition-all outline-none text-slate-700 font-medium placeholder:text-slate-300 resize-none shadow-inner"
                        />
                        <div className="absolute bottom-8 right-8">
                           <Sparkles size={28} className={cn("transition-colors duration-500", instructions ? "text-brand" : "text-slate-200")} />
                        </div>
                      </div>
                    </div>

                    <div className="w-full">
                      <button
                        disabled={status === 'processing' || status === 'converting' || (!file && !instructions)}
                        onClick={handleChat}
                        className="modern-btn w-full flex items-center justify-center gap-3 h-24 text-xl shadow-2xl shadow-brand/30 group bg-slate-900 border-none disabled:opacity-20 disabled:grayscale disabled:cursor-not-allowed"
                      >
                        {status === 'processing' ? (
                          <>
                            <Loader2 className="animate-spin" size={28} />
                            <span>PROCESSING REQUEST...</span>
                          </>
                        ) : status === 'converting' ? (
                          <>
                            <RefreshCcw className="animate-spin" size={28} />
                            <span>CONVERTING DOCUMENT...</span>
                          </>
                        ) : (
                          <>
                            <Sparkles size={24} className={cn(instructions ? "animate-pulse text-brand" : "text-white/40")} />
                            <span className="tracking-tight">UPLOAD</span>
                            <ArrowRight size={22} className="opacity-40 group-hover:translate-x-2 transition-transform" />
                          </>
                        )}
                      </button>
                    </div>
                  </motion.div>
                ) : (
                  <motion.div 
                    key="success"
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="p-12 text-center space-y-6"
                  >
                    <div className="inline-flex w-24 h-24 bg-emerald-50 text-emerald-500 rounded-full items-center justify-center mb-4 shadow-inner">
                      <CheckCircle2 size={48} />
                    </div>
                    <div>
                      <h3 className="text-3xl font-black text-slate-900 tracking-tight">
                        Instructions Sent
                      </h3>
                      <p className="text-slate-400 font-bold uppercase tracking-[0.2em] text-[10px] mt-2 italic">
                        Message & Context received by gateway
                      </p>
                    </div>
                    <div className="pt-4 flex flex-col items-center gap-2">
                       <p className="text-sm font-medium text-slate-500 max-w-xs transition-colors text-center">
                        Your request has been securely forwarded to the automation gateway for processing.
                       </p>
                       <button 
                         onClick={clearFile}
                         className="mt-6 px-10 py-5 bg-slate-900 text-white rounded-2xl font-bold uppercase tracking-widest text-xs hover:bg-brand transition-all flex items-center gap-3 shadow-xl hover:-translate-y-1"
                       >
                         <RefreshCcw size={16} />
                         New Message
                       </button>
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
                    <h4 className="text-sm font-bold text-rose-800 uppercase tracking-wide">Gateway Error</h4>
                    <p className="text-xs text-rose-600 mt-1 leading-relaxed font-medium">{error}</p>
                  </div>
                </motion.div>
              )}
            </div>
          </section>

          {/* Tips Section */}
          {status !== 'success' && status !== 'processing' && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[
                { title: "Conversion", icon: FileDown, text: "Word (.docx) files are automatically converted to PDF." },
                { title: "Metadata", icon: Box, text: "Includes file size, type, and modification dates." },
                { title: "Security", icon: Fingerprint, text: "Encrypted headers with signature validation." }
              ].map((tip, i) => (
                <div key={i} className="p-6 rounded-3xl bg-white/50 border border-slate-100 flex flex-col items-center text-center group hover:bg-white transition-colors duration-300">
                  <div className="w-10 h-10 bg-white rounded-xl shadow-sm border border-slate-100 flex items-center justify-center mb-3 text-brand text-opacity-80 group-hover:scale-110 transition-transform">
                    <tip.icon size={18} />
                  </div>
                  <h4 className="text-xs font-black uppercase tracking-widest text-slate-800 mb-1">{tip.title}</h4>
                  <p className="text-[10px] text-slate-400 font-medium leading-relaxed">{tip.text}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="max-w-4xl w-full mx-auto mt-12 py-8 border-t border-slate-100 flex flex-col md:flex-row justify-between items-center text-[10px] font-bold text-slate-300 uppercase tracking-[0.2em] gap-4">
        <div className="flex items-center gap-6">
          <span>&copy; 2026 Everything Document</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-1.5 h-1.5 bg-brand rounded-full shadow-[0_0_8px_rgba(59,130,246,0.5)]" />
          <span>v3.2.0 PDF-CONVERTER ACTIVE</span>
        </div>
      </footer>
    </div>
  );
}
