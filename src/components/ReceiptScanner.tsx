import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Sparkles, Loader2, X, UploadCloud, CheckCircle2, 
  AlertCircle, ArrowRight, ClipboardCopy, Image as ImageIcon
} from 'lucide-react';
import { useNotifications } from '../context/NotificationContext';

interface ReceiptScannerProps {
  onScanSuccess: (data: {
    transactionType: 'income' | 'expense';
    title: string;
    amount: number;
    date: string;
    category: string;
    description: string;
    bankCharge?: number;
  }) => void;
  currency: string;
}

export default function ReceiptScanner({ onScanSuccess, currency }: ReceiptScannerProps) {
  const { showToast } = useNotifications();
  const [dragActive, setDragActive] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [mimeType, setMimeType] = useState<string>('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [scannedResult, setScannedResult] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Drag and drop handlers
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const processFile = (file: File) => {
    if (!file.type.startsWith('image/')) {
      showToast('error', 'Please upload an image file (PNG, JPG, WEBP).');
      return;
    }

    setMimeType(file.type);
    const reader = new FileReader();
    reader.onload = (e) => {
      if (e.target?.result && typeof e.target.result === 'string') {
        setImagePreview(e.target.result);
        setError(null);
        setScannedResult(null);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
  };

  const handleClear = () => {
    setImagePreview(null);
    setMimeType('');
    setScannedResult(null);
    setError(null);
    setIsAnalyzing(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const triggerAnalysis = async () => {
    if (!imagePreview) return;
    setIsAnalyzing(true);
    setError(null);

    try {
      const response = await fetch('/api/gemini/analyze-image', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          image: imagePreview,
          mimeType: mimeType
        })
      });

      const result = await response.json();

      if (response.ok && result.success) {
        setScannedResult(result.data);
        showToast('success', 'Document analyzed successfully! Verify details below.');
      } else {
        setError(result.error || 'Failed to parse image data.');
        showToast('error', 'Analysis failed. Please verify your GEMINI_API_KEY in secrets.');
      }
    } catch (err: any) {
      console.error('[Receipt Analysis Client Error]', err);
      setError('Connection failed. Verify server is running.');
      showToast('error', 'Network error while reaching Gemini API.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const applyToForm = () => {
    if (!scannedResult) return;
    onScanSuccess(scannedResult);
    showToast('success', 'Values applied to transaction ledger form!');
    handleClear();
  };

  return (
    <div className="bg-gradient-to-b from-zinc-900/40 to-black/60 border border-[var(--border-primary)] rounded-[24px] p-5 shadow-lg relative overflow-hidden" id="receipt-scanner-root">
      <div className="absolute -top-10 -left-10 w-24 h-24 bg-[var(--accent-primary)]/5 rounded-full blur-2xl pointer-events-none" />
      
      {/* Title Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-[var(--accent-primary)]/10 flex items-center justify-center border border-[var(--accent-primary)]/20">
            <Sparkles size={15} className="text-[var(--accent-primary)] animate-pulse" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-white font-sans uppercase tracking-wider">AI Receipt & Bill Scanner</h4>
            <p className="text-[10px] text-zinc-500 font-medium">Extract inflow/outflow info using gemini-3.6-flash</p>
          </div>
        </div>
        {imagePreview && (
          <button 
            onClick={handleClear}
            className="text-[10px] font-mono text-zinc-400 hover:text-rose-400 flex items-center gap-1 bg-zinc-900/50 border border-zinc-800/80 px-2 py-1 rounded-md transition-all cursor-pointer"
          >
            <X size={10} /> Clear
          </button>
        )}
      </div>

      {/* Upload Zone / Preview Area */}
      {!imagePreview ? (
        <div
          onDragEnter={handleDrag}
          onDragOver={handleDrag}
          onDragLeave={handleDrag}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border border-dashed rounded-2xl p-6 flex flex-col items-center justify-center text-center cursor-pointer transition-all ${
            dragActive 
              ? 'border-[var(--accent-primary)] bg-[var(--accent-primary)]/5 scale-[0.99]' 
              : 'border-zinc-800 hover:border-zinc-700 hover:bg-zinc-900/10'
          }`}
        >
          <input 
            ref={fileInputRef}
            type="file" 
            accept="image/*" 
            className="hidden" 
            onChange={handleFileInputChange}
          />
          <UploadCloud size={28} className="text-zinc-500 mb-2.5 stroke-[1.5]" />
          <span className="text-xs font-semibold text-zinc-300">Drag & drop your receipt/bill photo</span>
          <span className="text-[10px] text-zinc-500 mt-1">or click to browse local files (JPG, PNG, WEBP)</span>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
            {/* Image Preview Container */}
            <div className="md:col-span-5 relative bg-zinc-950 rounded-xl overflow-hidden border border-zinc-800 flex items-center justify-center max-h-[180px]">
              <img 
                src={imagePreview} 
                alt="Receipt Preview" 
                className="max-h-[180px] w-auto object-contain"
              />
              <div className="absolute bottom-2 left-2 px-2 py-0.5 bg-black/75 rounded text-[9px] font-mono text-zinc-400 flex items-center gap-1 border border-zinc-800">
                <ImageIcon size={10} /> {mimeType.split('/').pop()?.toUpperCase()}
              </div>
            </div>

            {/* Analysis Action / Results Container */}
            <div className="md:col-span-7 flex flex-col justify-center">
              {!isAnalyzing && !scannedResult && !error && (
                <div className="text-center md:text-left py-4 space-y-3">
                  <p className="text-[11px] text-zinc-400 leading-relaxed">
                    Image loaded successfully. Click below to analyze and extract the merchant, category, date, and amounts.
                  </p>
                  <button
                    onClick={triggerAnalysis}
                    className="w-full sm:w-auto py-2.5 px-4 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700/80 hover:border-[var(--accent-primary)]/50 text-white font-mono text-xs rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer shadow"
                  >
                    <Sparkles size={12} className="text-[var(--accent-primary)]" />
                    Start Gemini Analysis
                  </button>
                </div>
              )}

              {isAnalyzing && (
                <div className="flex flex-col items-center justify-center text-center py-6 space-y-2">
                  <Loader2 size={24} className="text-[var(--accent-primary)] animate-spin" />
                  <p className="text-xs font-semibold text-zinc-300">Reading image via Gemini...</p>
                  <p className="text-[9.5px] text-zinc-500 italic max-w-xs">Extracting line items and merchant information from receipt pixels</p>
                </div>
              )}

              {error && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl space-y-1">
                  <div className="flex items-center gap-2 text-rose-400 font-semibold text-xs">
                    <AlertCircle size={14} />
                    <span>Analysis Error</span>
                  </div>
                  <p className="text-[10px] text-rose-300/85 leading-normal">{error}</p>
                  <button 
                    onClick={triggerAnalysis}
                    className="text-[10px] font-mono text-zinc-400 hover:text-white underline mt-1 block"
                  >
                    Try Again
                  </button>
                </div>
              )}

              {scannedResult && (
                <div className="space-y-3">
                  <div className="bg-[#060609] border border-emerald-950 rounded-xl p-3 space-y-2">
                    <div className="flex items-center gap-1.5 text-emerald-400 font-semibold text-xs">
                      <CheckCircle2 size={13} className="stroke-[2.5]" />
                      <span>Extraction Complete</span>
                    </div>

                    <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px] font-mono">
                      <div>
                        <span className="text-zinc-500">Merchant/Title:</span>
                        <p className="text-zinc-200 font-bold truncate">{scannedResult.title}</p>
                      </div>
                      <div>
                        <span className="text-zinc-500">Amount:</span>
                        <p className="text-emerald-400 font-bold">{currency}{scannedResult.amount}</p>
                      </div>
                      <div>
                        <span className="text-zinc-500">Date:</span>
                        <p className="text-zinc-200">{scannedResult.date}</p>
                      </div>
                      <div>
                        <span className="text-zinc-500">Category:</span>
                        <p className="text-zinc-200">{scannedResult.category}</p>
                      </div>
                    </div>

                    {scannedResult.description && (
                      <div className="text-[10px] border-t border-zinc-900 pt-1.5 text-zinc-400 line-clamp-2">
                        <span className="text-zinc-500 font-mono">Details:</span> {scannedResult.description}
                      </div>
                    )}
                  </div>

                  <button
                    onClick={applyToForm}
                    className="w-full py-2.5 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-lg shadow-emerald-500/10"
                  >
                    <ClipboardCopy size={13} />
                    Auto-Fill Ledger Form
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
