import React, { useState } from "react";
import { CashAccount, BankCard } from "../types";
import { ArrowRightLeft } from "lucide-react";
import { useNotifications } from "../context/NotificationContext";
import { DatePicker } from "./DatePicker";

interface TransferFundsProps {
  cashAccounts: CashAccount[];
  cards: BankCard[];
  currency: string;
  onTransferFunds: (
    fromId: string,
    fromType: "cash" | "card",
    toId: string,
    toType: "cash" | "card",
    amount: number,
    note: string,
    date: string,
    charge: number
  ) => void;
}

export default function TransferFunds({ cashAccounts, cards, currency, onTransferFunds }: TransferFundsProps) {
  const { showToast } = useNotifications();
  const [fromAccount, setFromAccount] = useState("");
  const [toAccount, setToAccount] = useState("");
  const [amount, setAmount] = useState("");
  const [charge, setCharge] = useState("");
  const [note, setNote] = useState("");
  const [transferDate, setTransferDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const fromSelectRef = React.useRef<HTMLSelectElement>(null);
  const toSelectRef = React.useRef<HTMLSelectElement>(null);
  const amountInputRef = React.useRef<HTMLInputElement>(null);

  const accounts = [
    ...cashAccounts.map((c) => ({ id: c.id, name: c.name, type: "cash" as const, isFrozen: false, balance: c.balance })),
    ...cards.filter((c) => !c.isCanceled).map((c) => ({ id: c.id, name: c.cardName, type: "card" as const, isFrozen: !!c.isFrozen, balance: c.currentBalance })),
  ];

  const validateTransfer = (from: string, to: string, amtStr: string, chargeStr: string, sub: boolean) => {
    const errs: Record<string, string> = {};
    if (sub || from) {
      if (!from) errs.from = "Source required";
      else {
        const src = accounts.find((a) => `${a.type}-${a.id}` === from);
        if (src?.isFrozen) errs.from = "Source is frozen";
      }
    }
    if (sub || to) {
      if (!to) errs.to = "Destination required";
      else if (from === to && from) errs.to = "Cannot be same as source";
      else {
        const dst = accounts.find((a) => `${a.type}-${a.id}` === to);
        if (dst?.isFrozen) errs.to = "Destination is frozen";
      }
    }
    let parsedAmount = 0;
    if (sub || amtStr) {
      if (!amtStr) errs.amount = "Amount required";
      else {
        const n = parseFloat(amtStr);
        if (isNaN(n)) errs.amount = "Must be a number";
        else if (n <= 0) errs.amount = "Must be positive";
        else parsedAmount = n;
      }
    }
    let parsedCharge = 0;
    if (chargeStr) {
      const n = parseFloat(chargeStr);
      if (isNaN(n)) errs.charge = "Must be a number";
      else if (n < 0) errs.charge = "Cannot be negative";
      else parsedCharge = n;
    }
    if (from && !errs.amount && !errs.charge) {
      const total = parsedAmount + parsedCharge;
      const src = accounts.find((a) => `${a.type}-${a.id}` === from);
      if (src) {
        let bal = 0;
        if (src.type === "cash") bal = cashAccounts.find((c) => c.id === src.id)?.balance ?? 0;
        else bal = cards.find((c) => c.id === src.id)?.currentBalance ?? 0;
        if (total > bal) errs.amount = `Total ${currency} ${total.toLocaleString()} exceeds ${currency} ${bal.toLocaleString()}`;
      }
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleTransfer = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    const ok = validateTransfer(fromAccount, toAccount, amount, charge, true);
    if (!ok) {
      if (!fromAccount) fromSelectRef.current?.focus();
      else if (!toAccount || fromAccount === toAccount) toSelectRef.current?.focus();
      else amountInputRef.current?.focus();
      showToast("Please resolve errors", "error");
      return;
    }
    const source = accounts.find((a) => `${a.type}-${a.id}` === fromAccount);
    const destination = accounts.find((a) => `${a.type}-${a.id}` === toAccount);
    if (!source || !destination) return;
    onTransferFunds(source.id, source.type, destination.id, destination.type, parseFloat(amount), note, transferDate, charge ? parseFloat(charge) : 0);
    setAmount(""); setCharge(""); setNote(""); setFromAccount(""); setToAccount(""); setSubmitted(false); setErrors({});
    showToast("Transferred", "success");
  };

  return (
    <form onSubmit={handleTransfer} className="space-y-4">
      {/* Mitchell gradient card — source/dest header */}
      <div className="gradient-card p-6 md:p-7 overflow-hidden" style={{ background: 'var(--gradient-card-dark)' }}>
        <div className="flex items-start justify-between gap-4 relative z-10">
          <div>
            <p className="eyebrow !text-white/60">Transfer · Wise-like</p>
            <h3 className="text-[16px] font-bold tracking-tight mt-1 flex items-center gap-2 text-white">
              <span className="w-7 h-7 rounded-full bg-white text-black grid place-items-center"><ArrowRightLeft size={13} /></span>
              Transfer Capital
            </h3>
            <p className="text-[12.5px] text-white/60 mt-1">Move funds instantly between accounts — zero friction.</p>
          </div>
          <span className="hidden sm:inline-flex pill !bg-white/10 !border-white/15 !text-white mono !text-[10px] tracking-widest">INSTANT</span>
        </div>
        <div className="rainbow-bar mt-5 relative z-10 opacity-80" />
      </div>
      <div className="card p-6 md:p-7 space-y-6">

      <div className="grid grid-cols-1 md:grid-cols-[1fr_48px_1fr] items-end gap-3">
        <div className="space-y-1.5">
          <label className="eyebrow normal-case tracking-normal">From — Debit source</label>
          <select ref={fromSelectRef} value={fromAccount} onChange={(e) => { setFromAccount(e.target.value); validateTransfer(e.target.value, toAccount, amount, charge, submitted); }} className={`input ${errors.from ? "!border-[var(--danger)]" : ""}`}>
            <option value="">Select origin</option>
            {accounts.map((a) => (
              <option key={`${a.type}-${a.id}`} value={`${a.type}-${a.id}`} disabled={a.isFrozen}>
                {a.name} · {a.type === "cash" ? "Wallet" : "Card"} · {currency} {a.balance.toLocaleString()}
              </option>
            ))}
          </select>
          {errors.from && <span className="mono text-[11px] text-[var(--danger)]">{errors.from}</span>}
        </div>

        <div className="hidden md:grid place-items-center pb-1">
          <div className="w-9 h-9 rounded-full border border-[var(--line)] bg-[var(--surface-2)] grid place-items-center">
            <ArrowRightLeft size={14} className={fromAccount && toAccount ? "text-[var(--ink)]" : "text-[var(--ink-3)]"} />
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="eyebrow normal-case tracking-normal">To — Credit destination</label>
          <select ref={toSelectRef} value={toAccount} onChange={(e) => { setToAccount(e.target.value); validateTransfer(fromAccount, e.target.value, amount, charge, submitted); }} className={`input ${errors.to ? "!border-[var(--danger)]" : ""}`}>
            <option value="">Select destination</option>
            {accounts.map((a) => (
              <option key={`${a.type}-${a.id}`} value={`${a.type}-${a.id}`} disabled={a.isFrozen}>
                {a.name} · {a.type === "cash" ? "Wallet" : "Card"} · {currency} {a.balance.toLocaleString()}
              </option>
            ))}
          </select>
          {errors.to && <span className="mono text-[11px] text-[var(--danger)]">{errors.to}</span>}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className="eyebrow normal-case tracking-normal">Amount · {currency}</label>
          <input ref={amountInputRef} type="number" step="any" placeholder="0.00" value={amount} onChange={(e) => { setAmount(e.target.value); validateTransfer(fromAccount, toAccount, e.target.value, charge, submitted); }} className={`input mono ${errors.amount ? "!border-[var(--danger)]" : ""}`} required />
          {errors.amount && <span className="mono text-[11px] text-[var(--danger)]">{errors.amount}</span>}
        </div>
        <div className="space-y-1.5">
          <label className="eyebrow normal-case tracking-normal">Fee · optional · {currency}</label>
          <input type="number" step="any" placeholder="0.00" value={charge} onChange={(e) => { setCharge(e.target.value); validateTransfer(fromAccount, toAccount, amount, e.target.value, submitted); }} className={`input mono ${errors.charge ? "!border-[var(--danger)]" : ""}`} />
          {errors.charge && <span className="mono text-[11px] text-[var(--danger)]">{errors.charge}</span>}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className="eyebrow normal-case tracking-normal">Date</label>
          <DatePicker value={transferDate} onChange={setTransferDate} required />
        </div>
        <div className="space-y-1.5">
          <label className="eyebrow normal-case tracking-normal">Note · memo</label>
          <input type="text" placeholder="e.g. Move reserves to card" value={note} onChange={(e) => setNote(e.target.value)} className="input" />
        </div>
      </div>

      <button type="submit" className="w-full h-[44px] gap-2 rounded-full font-bold text-[13px] text-white flex items-center justify-center" style={{ background: 'var(--gradient-card-orange)' }}>
        <ArrowRightLeft size={14} /> Execute transfer
      </button>
      <p className="mono text-[11px] text-[var(--ink-3)] text-center">Balances update instantly. No hidden spread — like Wise.</p>
      </div>
    </form>
  );
}
