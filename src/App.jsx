import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  Wallet, TrendingUp, TrendingDown, Dice5, Calendar, Repeat,
  Settings, Plus, Trash2, AlertTriangle, ChevronLeft, ChevronRight, Mail,
  Pencil, Check, X, ChevronDown, ChevronUp, Clipboard
} from "lucide-react";

// ---------------------------------------------------------------------------
// Tokens (paleta "livro-razão")
// ---------------------------------------------------------------------------
const C = {
  paper: "#F2F4EF",
  paperRaised: "#FFFFFF",
  ink: "#1F2A24",
  inkSoft: "#5B685D",
  inkFaint: "#8A9489",
  line: "#C7CDBF",
  lineSoft: "#DEE3D8",
  green: "#2F6F4E",
  greenSoft: "#DCE8DE",
  red: "#B23A2E",
  redSoft: "#F3DEDA",
  amber: "#8A5A2B",
  amberSoft: "#EFE0CC",
};

const money = (n) =>
  (n < 0 ? "-R$ " : "R$ ") +
  Math.abs(n).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const monthLabel = (key) => {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(y, m - 1, 1);
  const s = d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  return s.charAt(0).toUpperCase() + s.slice(1);
};

const shiftMonth = (key, delta) => {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

const currentMonthKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

const fmtDate = (iso) => (iso ? new Date(iso + "T00:00:00").toLocaleDateString("pt-BR") : "");

const emptyMonth = () => ({
  income: [], // {id, desc, value, type: 'fixa'|'variavel', date, received}
  fixedCosts: [], // {id, desc, value, date}
  recurring: [], // {id, desc, value, date}
  daily: [], // {id, desc, value, date}
  bets: [], // {id, desc, staked, date, finalized, withdrawals: [{id,value,date}]}
  deposits: [], // {id, desc, value, date} — dinheiro que entrou na casa de apostas
  saques: [], // {id, desc, value, date} — dinheiro que saiu da casa de apostas pro banco
});

// migra formatos antigos salvos no localStorage pra não quebrar dados existentes
function migrateMonth(m) {
  return {
    ...emptyMonth(),
    ...m,
    income: (m.income || []).map((i) => ({
      received: false,
      date: "",
      ...i,
    })),
    bets: (m.bets || []).map((b) => {
      if (b.withdrawals) return { finalized: false, withdrawals: [], ...b };
      // formato antigo tinha "returned" único
      const withdrawals = b.returned ? [{ id: uid(), value: b.returned, date: b.date || "" }] : [];
      const { returned, ...rest } = b;
      return { finalized: false, ...rest, withdrawals };
    }),
  };
}

// ---------------------------------------------------------------------------
// Storage helpers (Supabase — os dados ficam salvos na nuvem, por usuário logado)
// ---------------------------------------------------------------------------
import { supabase } from "./supabaseClient.js";

async function kvGet(key) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Sessão expirada — faça login novamente.");
  const { data, error } = await supabase.from("kv_store").select("value").eq("user_id", user.id).eq("key", key).maybeSingle();
  if (error) throw error;
  return data ? data.value : null;
}
async function kvSet(key, value) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Sessão expirada — faça login novamente.");
  const { error } = await supabase
    .from("kv_store")
    .upsert({ user_id: user.id, key, value, updated_at: new Date().toISOString() }, { onConflict: "user_id,key" });
  if (error) throw error;
}

async function loadMonth(key) {
  const value = await kvGet(`mes:${key}`);
  return value ? migrateMonth(value) : emptyMonth();
}
async function saveMonth(key, data) {
  await kvSet(`mes:${key}`, data);
}
const DEFAULT_SETTINGS = { limite: 0, email: "", metaSaqueDiaria: 500, metaDepositoDiaria: 50 };

async function loadSettings() {
  const value = await kvGet("configuracoes");
  return value ? { ...DEFAULT_SETTINGS, ...value } : { ...DEFAULT_SETTINGS };
}
async function saveSettings(s) {
  await kvSet("configuracoes", s);
}

// ---------------------------------------------------------------------------
// Small building blocks
// ---------------------------------------------------------------------------
function Ruled({ children, style }) {
  return (
    <div style={{ borderBottom: `1px solid ${C.lineSoft}`, padding: "10px 0", ...style }}>
      {children}
    </div>
  );
}

function fieldStyle(f) {
  return {
    fontFamily: f.type === "number" ? "var(--font-mono)" : "var(--font-sans)",
    fontSize: 14,
    color: C.ink,
    background: C.paperRaised,
    border: `1px solid ${C.line}`,
    borderRadius: 4,
    padding: "7px 9px",
    outline: "none",
  };
}

function FieldInput({ f, value, onChange, onEnter }) {
  if (f.type === "checkbox") {
    return (
      <label className="flex items-center gap-2" style={{ height: 34 }}>
        <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} style={{ width: 16, height: 16 }} />
        <span style={{ fontFamily: "var(--font-sans)", fontSize: 12.5, color: C.inkSoft }}>{f.checkboxLabel}</span>
      </label>
    );
  }
  return (
    <input
      type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"}
      step={f.type === "number" ? "0.01" : undefined}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); onEnter?.(); } }}
      placeholder={f.placeholder}
      style={fieldStyle(f)}
    />
  );
}

function AddRow({ fields, onAdd, submitLabel = "Lançar" }) {
  const initial = {};
  fields.forEach((f) => (initial[f.key] = f.type === "checkbox" ? false : ""));
  const [vals, setVals] = useState(initial);

  const canSubmit = fields
    .filter((f) => f.required !== false && f.type !== "checkbox")
    .every((f) => String(vals[f.key] ?? "").trim() !== "");

  const submit = () => {
    if (!canSubmit) return;
    const out = {};
    fields.forEach((f) => {
      out[f.key] = f.type === "number" ? parseFloat(vals[f.key] || 0) : vals[f.key];
    });
    onAdd(out);
    setVals(initial);
  };

  return (
    <div className="flex flex-wrap items-end gap-2 py-3">
      {fields.map((f) => (
        <div key={f.key} className="flex flex-col" style={{ minWidth: f.width || 140, flex: f.grow ? 1 : "none" }}>
          {f.type !== "checkbox" && (
            <label style={{ fontSize: 11, color: C.inkFaint, fontFamily: "var(--font-sans)", letterSpacing: 0.3, marginBottom: 4 }}>
              {f.label}
            </label>
          )}
          <FieldInput f={f} value={vals[f.key]} onChange={(v) => setVals((s) => ({ ...s, [f.key]: v }))} onEnter={submit} />
        </div>
      ))}
      <button
        onClick={submit}
        disabled={!canSubmit}
        style={{
          display: "flex", alignItems: "center", gap: 6,
          background: canSubmit ? C.ink : C.lineSoft,
          color: canSubmit ? C.paper : C.inkFaint,
          border: "none", borderRadius: 4, padding: "8px 14px", fontSize: 13,
          fontFamily: "var(--font-sans)", fontWeight: 600,
          cursor: canSubmit ? "pointer" : "not-allowed",
        }}
      >
        <Plus size={14} /> {submitLabel}
      </button>
    </div>
  );
}

function IconBtn({ onClick, children, title, color }) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{ background: "none", border: "none", cursor: "pointer", color: color || C.inkFaint, padding: 4, display: "flex" }}
    >
      {children}
    </button>
  );
}

function SectionHeader({ icon: Icon, title, subtitle, accent }) {
  return (
    <div className="flex items-start gap-3 mb-1">
      <div style={{ width: 34, height: 34, borderRadius: 6, background: accent + "22", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <Icon size={17} color={accent} />
      </div>
      <div>
        <h2 style={{ fontFamily: "var(--font-serif)", fontSize: 20, color: C.ink, margin: 0 }}>{title}</h2>
        <p style={{ fontFamily: "var(--font-sans)", fontSize: 12.5, color: C.inkFaint, margin: "2px 0 0" }}>{subtitle}</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Entradas — com edição inline e controle de recebimento
// ---------------------------------------------------------------------------
function IncomeRow({ item, onSave, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item);

  useEffect(() => setDraft(item), [item]);

  if (editing) {
    return (
      <Ruled>
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex flex-col" style={{ flex: 1, minWidth: 160 }}>
            <label style={{ fontSize: 11, color: C.inkFaint, fontFamily: "var(--font-sans)", marginBottom: 4 }}>Descrição</label>
            <input value={draft.desc} onChange={(e) => setDraft((d) => ({ ...d, desc: e.target.value }))} style={fieldStyle({})} />
          </div>
          <div className="flex flex-col" style={{ width: 120 }}>
            <label style={{ fontSize: 11, color: C.inkFaint, fontFamily: "var(--font-sans)", marginBottom: 4 }}>Valor (R$)</label>
            <input type="number" step="0.01" value={draft.value} onChange={(e) => setDraft((d) => ({ ...d, value: parseFloat(e.target.value || 0) }))} style={fieldStyle({ type: "number" })} />
          </div>
          <div className="flex flex-col" style={{ width: 130 }}>
            <label style={{ fontSize: 11, color: C.inkFaint, fontFamily: "var(--font-sans)", marginBottom: 4 }}>Tipo</label>
            <select
              value={draft.type}
              onChange={(e) => setDraft((d) => ({ ...d, type: e.target.value }))}
              style={{ ...fieldStyle({}), fontFamily: "var(--font-sans)" }}
            >
              <option value="fixa">fixa</option>
              <option value="variavel">variável</option>
            </select>
          </div>
          <div className="flex flex-col" style={{ width: 150 }}>
            <label style={{ fontSize: 11, color: C.inkFaint, fontFamily: "var(--font-sans)", marginBottom: 4 }}>Data de recebimento</label>
            <input type="date" value={draft.date || ""} onChange={(e) => setDraft((d) => ({ ...d, date: e.target.value }))} style={fieldStyle({})} />
          </div>
          <label className="flex items-center gap-2" style={{ height: 34 }}>
            <input type="checkbox" checked={!!draft.received} onChange={(e) => setDraft((d) => ({ ...d, received: e.target.checked }))} style={{ width: 16, height: 16 }} />
            <span style={{ fontFamily: "var(--font-sans)", fontSize: 12.5, color: C.inkSoft }}>caiu na conta</span>
          </label>
          <IconBtn onClick={() => { onSave(draft); setEditing(false); }} title="Salvar" color={C.green}><Check size={17} /></IconBtn>
          <IconBtn onClick={() => { setDraft(item); setEditing(false); }} title="Cancelar" color={C.red}><X size={17} /></IconBtn>
        </div>
      </Ruled>
    );
  }

  return (
    <Ruled>
      <div className="flex items-center justify-between gap-3">
        <div className="flex-1">
          <div style={{ fontFamily: "var(--font-sans)", fontSize: 14, color: C.ink }}>{item.desc}</div>
          {item.date && (
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: C.inkFaint, marginTop: 2 }}>
              recebimento em {fmtDate(item.date)}
            </div>
          )}
        </div>
        <span
          style={{
            fontSize: 10.5, fontFamily: "var(--font-sans)", padding: "2px 7px", borderRadius: 999,
            background: item.type === "fixa" ? C.greenSoft : C.amberSoft,
            color: item.type === "fixa" ? C.green : C.amber,
          }}
        >
          {item.type === "fixa" ? "fixa" : "variável"}
        </span>
        <button
          onClick={() => onSave({ ...item, received: !item.received })}
          title={item.received ? "Marcado como recebido" : "Marcar como recebido"}
          style={{
            display: "flex", alignItems: "center", gap: 5, border: `1px solid ${item.received ? C.green : C.line}`,
            background: item.received ? C.greenSoft : "transparent", borderRadius: 999, padding: "3px 9px",
            cursor: "pointer", fontFamily: "var(--font-sans)", fontSize: 11, color: item.received ? C.green : C.inkFaint,
          }}
        >
          <Check size={12} /> {item.received ? "recebido" : "a receber"}
        </button>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 14, color: C.green, minWidth: 90, textAlign: "right" }}>{money(item.value)}</span>
        <IconBtn onClick={() => setEditing(true)} title="Editar"><Pencil size={14} /></IconBtn>
        <IconBtn onClick={() => onDelete(item.id)} title="Excluir"><Trash2 size={15} /></IconBtn>
      </div>
    </Ruled>
  );
}

// ---------------------------------------------------------------------------
// Apostas — carnê com retiradas parciais e importação a partir de foto
// ---------------------------------------------------------------------------
function BetCard({ bet, onUpdate, onDelete }) {
  const [open, setOpen] = useState(false);
  const [wVal, setWVal] = useState("");
  const [wDate, setWDate] = useState("");

  const totalWithdrawn = bet.withdrawals.reduce((s, w) => s + w.value, 0);
  const lucro = totalWithdrawn - bet.staked;
  const emRisco = Math.max(bet.staked - totalWithdrawn, 0);

  const addWithdrawal = () => {
    const v = parseFloat(wVal || 0);
    if (!v) return;
    onUpdate({ ...bet, withdrawals: [...bet.withdrawals, { id: uid(), value: v, date: wDate }] });
    setWVal("");
    setWDate("");
  };
  const removeWithdrawal = (id) => onUpdate({ ...bet, withdrawals: bet.withdrawals.filter((w) => w.id !== id) });

  return (
    <Ruled>
      <div className="flex items-center justify-between gap-3">
        <button onClick={() => setOpen((o) => !o)} style={{ background: "none", border: "none", cursor: "pointer", color: C.inkFaint, padding: 4 }}>
          {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
        <div className="flex-1">
          <div style={{ fontFamily: "var(--font-sans)", fontSize: 14, color: C.ink }}>{bet.desc}</div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: C.inkFaint, marginTop: 2 }}>
            {bet.date && `${fmtDate(bet.date)} · `}apostado {money(bet.staked)} · retirado {money(totalWithdrawn)}
          </div>
        </div>
        <button
          onClick={() => onUpdate({ ...bet, finalized: !bet.finalized })}
          style={{
            display: "flex", alignItems: "center", gap: 5, border: `1px solid ${bet.finalized ? C.green : C.amber}`,
            background: bet.finalized ? C.greenSoft : C.amberSoft, borderRadius: 999, padding: "3px 9px",
            cursor: "pointer", fontFamily: "var(--font-sans)", fontSize: 11, color: bet.finalized ? C.green : C.amber,
          }}
        >
          <Check size={12} /> {bet.finalized ? "finalizada" : "em aberto"}
        </button>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 600, color: lucro >= 0 ? C.green : C.red, minWidth: 90, textAlign: "right" }}>
          {money(lucro)}
        </span>
        <IconBtn onClick={() => onDelete(bet.id)} title="Excluir aposta"><Trash2 size={15} /></IconBtn>
      </div>

      {open && (
        <div style={{ marginTop: 12, marginLeft: 26, background: C.paper, border: `1px solid ${C.lineSoft}`, borderRadius: 6, padding: "12px 14px" }}>
          {!bet.finalized && emRisco > 0 && (
            <div style={{ fontFamily: "var(--font-sans)", fontSize: 12, color: C.inkFaint, marginBottom: 8 }}>
              Ainda em risco: <span style={{ fontFamily: "var(--font-mono)", color: C.amber }}>{money(emRisco)}</span>
            </div>
          )}
          {bet.withdrawals.map((w) => (
            <div key={w.id} className="flex items-center justify-between" style={{ padding: "4px 0" }}>
              <span style={{ fontFamily: "var(--font-sans)", fontSize: 12.5, color: C.inkSoft }}>
                Retirada{w.date ? ` em ${fmtDate(w.date)}` : ""}
              </span>
              <div className="flex items-center gap-2">
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: C.green }}>{money(w.value)}</span>
                <IconBtn onClick={() => removeWithdrawal(w.id)} title="Remover retirada"><Trash2 size={13} /></IconBtn>
              </div>
            </div>
          ))}
          <div className="flex flex-wrap items-end gap-2" style={{ marginTop: 8 }}>
            <div className="flex flex-col" style={{ width: 130 }}>
              <label style={{ fontSize: 10.5, color: C.inkFaint, fontFamily: "var(--font-sans)", marginBottom: 3 }}>Retirada (R$)</label>
              <input type="number" step="0.01" value={wVal} onChange={(e) => setWVal(e.target.value)} style={fieldStyle({ type: "number" })} />
            </div>
            <div className="flex flex-col" style={{ width: 140 }}>
              <label style={{ fontSize: 10.5, color: C.inkFaint, fontFamily: "var(--font-sans)", marginBottom: 3 }}>Data</label>
              <input type="date" value={wDate} onChange={(e) => setWDate(e.target.value)} style={fieldStyle({})} />
            </div>
            <button
              onClick={addWithdrawal}
              style={{ display: "flex", alignItems: "center", gap: 5, background: C.ink, color: C.paper, border: "none", borderRadius: 4, padding: "7px 12px", fontSize: 12.5, fontFamily: "var(--font-sans)", fontWeight: 600, cursor: "pointer" }}
            >
              <Plus size={13} /> Registrar retirada
            </button>
          </div>
        </div>
      )}
    </Ruled>
  );
}

function ImportarAposta({ onImport }) {
  const [open, setOpen] = useState(false);
  const [raw, setRaw] = useState("");
  const [erro, setErro] = useState("");

  const importar = () => {
    try {
      const parsed = JSON.parse(raw);
      const list = Array.isArray(parsed) ? parsed : [parsed];
      list.forEach((b) => {
        onImport({
          desc: b.desc || "Aposta importada",
          staked: parseFloat(b.staked || b.valor_apostado || 0),
          date: b.date || b.data || "",
        });
      });
      setRaw("");
      setErro("");
      setOpen(false);
    } catch {
      setErro("JSON inválido — cole exatamente o bloco que eu te enviei no chat.");
    }
  };

  return (
    <div style={{ marginBottom: 14 }}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2"
        style={{ background: C.amberSoft, border: `1px solid ${C.amber}55`, borderRadius: 6, padding: "8px 12px", cursor: "pointer", fontFamily: "var(--font-sans)", fontSize: 12.5, color: C.amber, fontWeight: 600 }}
      >
        <Clipboard size={14} /> Importar aposta a partir de uma foto
      </button>
      {open && (
        <div style={{ marginTop: 8, background: C.paper, border: `1px solid ${C.lineSoft}`, borderRadius: 6, padding: 12 }}>
          <p style={{ fontFamily: "var(--font-sans)", fontSize: 12, color: C.inkSoft, margin: "0 0 8px", lineHeight: 1.5 }}>
            Manda o print do carnê pra mim no chat. Eu leio os valores e te devolvo um bloco assim:
            <code style={{ display: "block", background: C.paperRaised, border: `1px solid ${C.line}`, borderRadius: 4, padding: "6px 8px", marginTop: 6, fontFamily: "var(--font-mono)", fontSize: 11 }}>
              {`{"desc": "Bet365 - múltipla", "staked": 50, "date": "2026-08-23"}`}
            </code>
            Cola esse bloco aqui embaixo e clica em importar — a aposta entra automaticamente, sem digitar os números de novo.
          </p>
          <textarea
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            placeholder="Cole aqui o bloco que eu te enviei..."
            rows={3}
            style={{ width: "100%", fontFamily: "var(--font-mono)", fontSize: 12.5, padding: 8, border: `1px solid ${C.line}`, borderRadius: 4, resize: "vertical" }}
          />
          {erro && <div style={{ color: C.red, fontFamily: "var(--font-sans)", fontSize: 12, marginTop: 4 }}>{erro}</div>}
          <button
            onClick={importar}
            style={{ marginTop: 8, background: C.ink, color: C.paper, border: "none", borderRadius: 4, padding: "7px 14px", fontSize: 12.5, fontFamily: "var(--font-sans)", fontWeight: 600, cursor: "pointer" }}
          >
            Importar
          </button>
        </div>
      )}
    </div>
  );
}

function GoalBar({ label, current, goal, color, bg }) {
  const pct = goal > 0 ? Math.min(100, (current / goal) * 100) : 0;
  const hit = current >= goal && goal > 0;
  return (
    <div style={{ flex: 1, minWidth: 180 }}>
      <div className="flex items-center justify-between" style={{ marginBottom: 5 }}>
        <span style={{ fontFamily: "var(--font-sans)", fontSize: 11.5, color: C.inkFaint }}>{label}</span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: hit ? color : C.ink }}>{money(current)} / {money(goal)}</span>
      </div>
      <div style={{ height: 7, background: bg, borderRadius: 999, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 999, transition: "width .2s" }} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ledger tape (elemento de assinatura visual)
// ---------------------------------------------------------------------------
function LedgerTape({ saldo, entradas, saidas, limite }) {
  const span = Math.max(Math.abs(saldo), Math.abs(limite), entradas * 0.6, 200);
  const pct = (v) => 50 + (v / (span * 1.15)) * 50;
  const clamp = (n) => Math.min(97, Math.max(3, n));

  const saldoPct = clamp(pct(saldo));
  const limitePct = clamp(pct(limite));
  const zeroPct = clamp(pct(0));
  const abaixo = saldo < limite;

  return (
    <div style={{ background: C.paperRaised, border: `1px solid ${C.line}`, borderRadius: 8, padding: "18px 20px" }}>
      <div className="flex items-baseline justify-between flex-wrap gap-2">
        <div>
          <div style={{ fontFamily: "var(--font-sans)", fontSize: 11.5, color: C.inkFaint, letterSpacing: 0.4, textTransform: "uppercase" }}>Saldo do mês</div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 34, fontWeight: 600, color: saldo >= 0 ? C.green : C.red, lineHeight: 1.1 }}>{money(saldo)}</div>
        </div>
        <div className="flex gap-5">
          <div>
            <div style={{ fontFamily: "var(--font-sans)", fontSize: 11, color: C.inkFaint }}>Entradas</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 15, color: C.green }}>{money(entradas)}</div>
          </div>
          <div>
            <div style={{ fontFamily: "var(--font-sans)", fontSize: 11, color: C.inkFaint }}>Saídas</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 15, color: C.red }}>{money(saidas)}</div>
          </div>
        </div>
      </div>

      <div style={{ marginTop: 18, position: "relative", height: 34 }}>
        <div style={{ position: "absolute", left: 0, right: 0, top: 15, height: 4, background: `linear-gradient(90deg, ${C.redSoft}, ${C.lineSoft} ${zeroPct}%, ${C.greenSoft})`, borderRadius: 999 }} />
        <div style={{ position: "absolute", left: `${zeroPct}%`, top: 8, width: 1, height: 18, background: C.inkFaint, opacity: 0.5 }} />
        {limite !== 0 && (
          <div style={{ position: "absolute", left: `${limitePct}%`, top: 4, transform: "translateX(-50%)", textAlign: "center" }}>
            <div style={{ width: 2, height: 26, background: C.amber, margin: "0 auto" }} />
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, color: C.amber, marginTop: 2, whiteSpace: "nowrap" }}>limite {money(limite)}</div>
          </div>
        )}
        <div style={{ position: "absolute", left: `${saldoPct}%`, top: -3, transform: "translateX(-50%)", width: 0, height: 0, borderLeft: "6px solid transparent", borderRight: "6px solid transparent", borderTop: `9px solid ${saldo >= 0 ? C.green : C.red}` }} />
      </div>

      {abaixo && (
        <div className="flex items-center gap-2" style={{ marginTop: 14, background: C.amberSoft, border: `1px solid ${C.amber}55`, borderRadius: 6, padding: "9px 12px" }}>
          <AlertTriangle size={16} color={C.amber} />
          <span style={{ fontFamily: "var(--font-sans)", fontSize: 12.5, color: C.ink }}>
            Saldo abaixo do limite definido ({money(limite)}). Veja a aba <strong>Configurações</strong> para o alerta por e-mail.
          </span>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------
export default function App({ onLogout, userEmail }) {
  const [monthKey, setMonthKey] = useState(currentMonthKey());
  const [data, setData] = useState(emptyMonth());
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [tab, setTab] = useState("resumo");
  const [loading, setLoading] = useState(true);
  const [syncError, setSyncError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([loadMonth(monthKey), loadSettings()])
      .then(([m, s]) => {
        if (!cancelled) { setData(m); setSettings(s); setLoading(false); setSyncError(""); }
      })
      .catch((e) => {
        if (!cancelled) { setLoading(false); setSyncError(e.message || "Não foi possível carregar seus dados."); }
      });
    return () => { cancelled = true; };
  }, [monthKey]);

  const persist = useCallback((next) => {
    setData(next);
    saveMonth(monthKey, next)
      .then(() => setSyncError(""))
      .catch((e) => setSyncError(e.message || "Não foi possível salvar. Verifique sua internet e tente de novo."));
  }, [monthKey]);

  const addTo = (listKey) => (item) => persist({ ...data, [listKey]: [...data[listKey], { id: uid(), ...item }] });
  const removeFrom = (listKey) => (id) => persist({ ...data, [listKey]: data[listKey].filter((i) => i.id !== id) });
  const saveIncome = (item) => persist({ ...data, income: data.income.map((i) => (i.id === item.id ? item : i)) });
  const updateBet = (bet) => persist({ ...data, bets: data.bets.map((b) => (b.id === bet.id ? bet : b)) });
  const addBet = (b) => persist({ ...data, bets: [...data.bets, { id: uid(), finalized: false, withdrawals: [], ...b }] });

  const todayIso = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }, []);

  const totals = useMemo(() => {
    const entradas = data.income.reduce((s, i) => s + i.value, 0);
    const fixos = data.fixedCosts.reduce((s, i) => s + i.value, 0);
    const recorrentes = data.recurring.reduce((s, i) => s + i.value, 0);
    const diaADia = data.daily.reduce((s, i) => s + i.value, 0);
    const saidas = fixos + recorrentes + diaADia;
    // Saldo do mês NÃO inclui apostas — elas têm relatório e cálculo à parte.
    const saldo = entradas - saidas;

    const apostado = data.bets.reduce((s, i) => s + i.staked, 0);
    const retornado = data.bets.reduce((s, i) => s + i.withdrawals.reduce((a, w) => a + w.value, 0), 0);
    const saldoApostas = retornado - apostado;
    const apostasFinalizadas = data.bets.filter((b) => b.finalized);
    const apostasGanhas = apostasFinalizadas.filter((b) => b.withdrawals.reduce((a, w) => a + w.value, 0) - b.staked > 0).length;
    const apostasPerdidas = apostasFinalizadas.filter((b) => b.withdrawals.reduce((a, w) => a + w.value, 0) - b.staked <= 0).length;
    const apostasEmAberto = data.bets.length - apostasFinalizadas.length;

    const totalDepositado = data.deposits.reduce((s, i) => s + i.value, 0);
    const totalSacado = data.saques.reduce((s, i) => s + i.value, 0);
    const saldoBanca = totalSacado - totalDepositado;
    const depositadoHoje = data.deposits.filter((i) => i.date === todayIso).reduce((s, i) => s + i.value, 0);
    const sacadoHoje = data.saques.filter((i) => i.date === todayIso).reduce((s, i) => s + i.value, 0);
    // Saldo real da carteira na casa de apostas: depósitos + ganhos - apostado - saques
    const saldoBet365 = totalDepositado + retornado - apostado - totalSacado;

    return {
      entradas, fixos, recorrentes, diaADia, saidas, saldo,
      apostado, retornado, saldoApostas, apostasGanhas, apostasPerdidas, apostasEmAberto,
      totalDepositado, totalSacado, saldoBanca, depositadoHoje, sacadoHoje, saldoBet365,
    };
  }, [data, todayIso]);

  const updateSettings = (patch) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    saveSettings(next).then(() => setSyncError("")).catch((e) => setSyncError(e.message || "Não foi possível salvar as configurações."));
  };

  const tabs = [
    { key: "resumo", label: "Resumo", icon: Wallet },
    { key: "entradas", label: "Entradas", icon: TrendingUp },
    { key: "fixos", label: "Custos Fixos", icon: Calendar },
    { key: "recorrentes", label: "Recorrentes", icon: Repeat },
    { key: "diaadia", label: "Dia a Dia", icon: TrendingDown },
    { key: "apostas", label: "Apostas", icon: Dice5 },
    { key: "config", label: "Configurações", icon: Settings },
  ];

  return (
    <div
      style={{
        "--font-serif": "'Source Serif 4', 'Georgia', serif",
        "--font-sans": "'IBM Plex Sans', 'Segoe UI', sans-serif",
        "--font-mono": "'IBM Plex Mono', 'SF Mono', monospace",
        background: C.paper, minHeight: "100vh", padding: "28px 20px 40px", color: C.ink,
        display: "flex", flexDirection: "column",
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Source+Serif+4:wght@500;600;700&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500;600&display=swap');
        input:focus, select:focus, textarea:focus { border-color: ${C.green} !important; box-shadow: 0 0 0 2px ${C.greenSoft}; }
        ::selection { background: ${C.greenSoft}; }
      `}</style>

      <div style={{ maxWidth: 780, margin: "0 auto", width: "100%", flex: 1 }}>
        <div className="flex items-center justify-between flex-wrap gap-3 mb-5">
          <div>
            <div style={{ fontFamily: "var(--font-sans)", fontSize: 11.5, letterSpacing: 1, color: C.inkFaint, textTransform: "uppercase" }}>Livro-razão pessoal</div>
            <h1 style={{ fontFamily: "var(--font-serif)", fontSize: 28, margin: "2px 0 0", color: C.ink }}>Controle Financeiro Marcus Mendes</h1>
          </div>
          <div className="flex items-center gap-3">
            {userEmail && (
              <span style={{ fontFamily: "var(--font-sans)", fontSize: 11.5, color: C.inkFaint }}>{userEmail}</span>
            )}
            <div className="flex items-center gap-1" style={{ background: C.paperRaised, border: `1px solid ${C.line}`, borderRadius: 6, padding: "4px 8px" }}>
              <button onClick={() => setMonthKey((k) => shiftMonth(k, -1))} style={{ background: "none", border: "none", cursor: "pointer", padding: 4, color: C.ink }}><ChevronLeft size={16} /></button>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 13.5, minWidth: 148, textAlign: "center" }}>{monthLabel(monthKey)}</span>
              <button onClick={() => setMonthKey((k) => shiftMonth(k, 1))} style={{ background: "none", border: "none", cursor: "pointer", padding: 4, color: C.ink }}><ChevronRight size={16} /></button>
            </div>
            {onLogout && (
              <button
                onClick={onLogout}
                style={{ fontFamily: "var(--font-sans)", fontSize: 12, color: C.inkFaint, background: "none", border: `1px solid ${C.line}`, borderRadius: 6, padding: "6px 10px", cursor: "pointer" }}
              >
                Sair
              </button>
            )}
          </div>
        </div>

        {loading ? (
          <div style={{ fontFamily: "var(--font-sans)", color: C.inkFaint, padding: 40, textAlign: "center" }}>Carregando lançamentos…</div>
        ) : (
          <>
            {syncError && (
              <div
                className="flex items-center gap-2"
                style={{ marginBottom: 14, background: C.redSoft, border: `1px solid ${C.red}66`, borderRadius: 6, padding: "10px 14px" }}
              >
                <AlertTriangle size={16} color={C.red} />
                <span style={{ fontFamily: "var(--font-sans)", fontSize: 12.5, color: C.ink }}>
                  <strong>Não salvou:</strong> {syncError}
                </span>
              </div>
            )}
            <LedgerTape saldo={totals.saldo} entradas={totals.entradas} saidas={totals.saidas} limite={settings.limite} />

            <div className="flex gap-1 flex-wrap" style={{ marginTop: 20, marginBottom: 16, borderBottom: `1px solid ${C.line}` }}>
              {tabs.map((t) => {
                const active = tab === t.key;
                const Icon = t.icon;
                return (
                  <button
                    key={t.key}
                    onClick={() => setTab(t.key)}
                    className="flex items-center gap-1.5"
                    style={{
                      fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: active ? 600 : 500,
                      color: active ? C.ink : C.inkFaint, background: "none", border: "none",
                      borderBottom: active ? `2px solid ${C.green}` : "2px solid transparent",
                      padding: "8px 10px", cursor: "pointer", marginBottom: -1,
                    }}
                  >
                    <Icon size={14} /> {t.label}
                  </button>
                );
              })}
            </div>

            <div style={{ background: C.paperRaised, border: `1px solid ${C.line}`, borderRadius: 8, padding: "20px 22px" }}>
              {tab === "resumo" && (
                <div>
                  <SectionHeader icon={Wallet} title="Resumo do mês" subtitle="Como a conta fecha, categoria por categoria (apostas ficam de fora — veja o relatório na aba Apostas)" accent={C.ink} />
                  {[
                    { label: "Entradas (fixas + variadas)", value: totals.entradas, color: C.green },
                    { label: "Custos fixos", value: -totals.fixos, color: C.red },
                    { label: "Recorrentes", value: -totals.recorrentes, color: C.red },
                    { label: "Gastos do dia a dia", value: -totals.diaADia, color: C.red },
                  ].map((row) => (
                    <Ruled key={row.label}>
                      <div className="flex items-center justify-between">
                        <span style={{ fontFamily: "var(--font-sans)", fontSize: 14 }}>{row.label}</span>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 14, color: row.color }}>{money(row.value)}</span>
                      </div>
                    </Ruled>
                  ))}
                  <div className="flex items-center justify-between" style={{ paddingTop: 14 }}>
                    <span style={{ fontFamily: "var(--font-serif)", fontSize: 17 }}>Saldo final</span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 18, fontWeight: 600, color: totals.saldo >= 0 ? C.green : C.red }}>{money(totals.saldo)}</span>
                  </div>

                  <div
                    className="flex items-center justify-between"
                    style={{ marginTop: 16, background: C.paper, border: `1px dashed ${C.line}`, borderRadius: 6, padding: "10px 14px" }}
                  >
                    <span style={{ fontFamily: "var(--font-sans)", fontSize: 12.5, color: C.inkFaint }}>Resultado de apostas no mês (à parte, não soma no saldo acima)</span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 600, color: totals.saldoApostas >= 0 ? C.green : C.red }}>{money(totals.saldoApostas)}</span>
                  </div>
                </div>
              )}

              {tab === "entradas" && (
                <div>
                  <SectionHeader icon={TrendingUp} title="Entradas" subtitle="Renda fixa do trabalho e entradas variadas — edite ou marque quando o dinheiro cair na conta" accent={C.green} />
                  <AddRow
                    fields={[
                      { key: "desc", label: "Descrição", placeholder: "Salário, freela...", grow: true },
                      { key: "value", label: "Valor (R$)", type: "number", width: 120 },
                      { key: "type", label: "Tipo", placeholder: "fixa ou variavel", width: 120 },
                      { key: "date", label: "Data de recebimento", type: "date", width: 150, required: false },
                    ]}
                    onAdd={(v) => addTo("income")({ ...v, type: v.type?.toLowerCase().startsWith("v") ? "variavel" : "fixa", received: false })}
                  />
                  {data.income.length === 0 ? (
                    <div style={{ padding: "20px 0", color: C.inkFaint, fontSize: 13, fontFamily: "var(--font-sans)" }}>Nenhuma entrada lançada neste mês.</div>
                  ) : (
                    data.income.map((item) => <IncomeRow key={item.id} item={item} onSave={saveIncome} onDelete={removeFrom("income")} />)
                  )}
                </div>
              )}

              {tab === "fixos" && (
                <div>
                  <SectionHeader icon={Calendar} title="Custos fixos" subtitle="Contas com o mesmo valor todo mês: aluguel, assinaturas..." accent={C.red} />
                  <AddRow fields={[{ key: "desc", label: "Descrição", placeholder: "Aluguel, internet...", grow: true }, { key: "value", label: "Valor (R$)", type: "number", width: 130 }, { key: "date", label: "Data de vencimento", type: "date", width: 150, required: false }]} onAdd={addTo("fixedCosts")} />
                  {data.fixedCosts.length === 0 ? (
                    <div style={{ padding: "20px 0", color: C.inkFaint, fontSize: 13, fontFamily: "var(--font-sans)" }}>Nenhum custo fixo cadastrado.</div>
                  ) : data.fixedCosts.map((it) => (
                    <Ruled key={it.id}>
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex-1">
                          <div style={{ fontFamily: "var(--font-sans)", fontSize: 14 }}>{it.desc}</div>
                          {it.date && <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: C.inkFaint, marginTop: 2 }}>vence em {fmtDate(it.date)}</div>}
                        </div>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 14, color: C.red }}>{money(it.value)}</span>
                        <IconBtn onClick={() => removeFrom("fixedCosts")(it.id)} title="Excluir"><Trash2 size={15} /></IconBtn>
                      </div>
                    </Ruled>
                  ))}
                </div>
              )}

              {tab === "recorrentes" && (
                <div>
                  <SectionHeader icon={Repeat} title="Gastos recorrentes" subtitle="Se repetem todo mês, mas o valor pode variar: mercado, farmácia..." accent={C.amber} />
                  <AddRow fields={[{ key: "desc", label: "Descrição", placeholder: "Mercado, farmácia...", grow: true }, { key: "value", label: "Valor (R$)", type: "number", width: 130 }, { key: "date", label: "Data", type: "date", width: 150, required: false }]} onAdd={addTo("recurring")} />
                  {data.recurring.length === 0 ? (
                    <div style={{ padding: "20px 0", color: C.inkFaint, fontSize: 13, fontFamily: "var(--font-sans)" }}>Nenhum gasto recorrente lançado neste mês.</div>
                  ) : [...data.recurring].sort((a, b) => (b.date || "").localeCompare(a.date || "")).map((it) => (
                    <Ruled key={it.id}>
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex-1">
                          <div style={{ fontFamily: "var(--font-sans)", fontSize: 14 }}>{it.desc}</div>
                          {it.date && <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: C.inkFaint, marginTop: 2 }}>{fmtDate(it.date)}</div>}
                        </div>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 14, color: C.red }}>{money(it.value)}</span>
                        <IconBtn onClick={() => removeFrom("recurring")(it.id)} title="Excluir"><Trash2 size={15} /></IconBtn>
                      </div>
                    </Ruled>
                  ))}
                </div>
              )}

              {tab === "diaadia" && (
                <div>
                  <SectionHeader icon={TrendingDown} title="Gastos do dia a dia" subtitle="Despesas avulsas: lanche, transporte, imprevistos..." accent={C.red} />
                  <AddRow fields={[{ key: "desc", label: "Descrição", placeholder: "iFood, uber...", grow: true }, { key: "value", label: "Valor (R$)", type: "number", width: 120 }, { key: "date", label: "Data", type: "date", width: 150, required: false }]} onAdd={addTo("daily")} />
                  {data.daily.length === 0 ? (
                    <div style={{ padding: "20px 0", color: C.inkFaint, fontSize: 13, fontFamily: "var(--font-sans)" }}>Nenhum gasto avulso lançado neste mês.</div>
                  ) : [...data.daily].sort((a, b) => (b.date || "").localeCompare(a.date || "")).map((it) => (
                    <Ruled key={it.id}>
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex-1">
                          <div style={{ fontFamily: "var(--font-sans)", fontSize: 14 }}>{it.desc}</div>
                          {it.date && <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: C.inkFaint, marginTop: 2 }}>{fmtDate(it.date)}</div>}
                        </div>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 14, color: C.red }}>{money(it.value)}</span>
                        <IconBtn onClick={() => removeFrom("daily")(it.id)} title="Excluir"><Trash2 size={15} /></IconBtn>
                      </div>
                    </Ruled>
                  ))}
                </div>
              )}

              {tab === "apostas" && (
                <div>
                  <SectionHeader icon={Dice5} title="Apostas" subtitle="Valor apostado, retiradas parciais e resultado final — separado do resto" accent={C.amber} />
                  <ImportarAposta onImport={addBet} />
                  <AddRow
                    fields={[
                      { key: "desc", label: "Descrição", placeholder: "Plataforma / evento", grow: true },
                      { key: "staked", label: "Valor apostado (R$)", type: "number", width: 150 },
                      { key: "date", label: "Data", type: "date", width: 150, required: false },
                    ]}
                    onAdd={addBet}
                    submitLabel="Registrar aposta"
                  />
                  {data.bets.length === 0 ? (
                    <div style={{ padding: "20px 0", color: C.inkFaint, fontSize: 13, fontFamily: "var(--font-sans)" }}>Nenhuma aposta registrada neste mês.</div>
                  ) : (
                    [...data.bets].sort((a, b) => (b.date || "").localeCompare(a.date || "")).map((bet) => (
                      <BetCard key={bet.id} bet={bet} onUpdate={updateBet} onDelete={removeFrom("bets")} />
                    ))
                  )}
                  {data.bets.length > 0 && (
                    <div style={{ marginTop: 18, paddingTop: 16, borderTop: `2px solid ${C.line}` }}>
                      <SectionHeader icon={Wallet} title="Relatório do mês — apostas" subtitle="Ganhos e perdas, calculado à parte do saldo financeiro geral" accent={C.amber} />
                      <div className="flex flex-wrap gap-x-8 gap-y-3" style={{ margin: "10px 0 4px" }}>
                        <div>
                          <div style={{ fontFamily: "var(--font-sans)", fontSize: 11, color: C.inkFaint }}>Total apostado</div>
                          <div style={{ fontFamily: "var(--font-mono)", fontSize: 16, color: C.ink }}>{money(totals.apostado)}</div>
                        </div>
                        <div>
                          <div style={{ fontFamily: "var(--font-sans)", fontSize: 11, color: C.inkFaint }}>Total retirado (ganhos)</div>
                          <div style={{ fontFamily: "var(--font-mono)", fontSize: 16, color: C.green }}>{money(totals.retornado)}</div>
                        </div>
                        <div>
                          <div style={{ fontFamily: "var(--font-sans)", fontSize: 11, color: C.inkFaint }}>Resultado líquido</div>
                          <div style={{ fontFamily: "var(--font-mono)", fontSize: 16, fontWeight: 600, color: totals.saldoApostas >= 0 ? C.green : C.red }}>{money(totals.saldoApostas)}</div>
                        </div>
                        <div>
                          <div style={{ fontFamily: "var(--font-sans)", fontSize: 11, color: C.inkFaint }}>Ganhas / Perdidas / Em aberto</div>
                          <div style={{ fontFamily: "var(--font-mono)", fontSize: 16, color: C.ink }}>
                            <span style={{ color: C.green }}>{totals.apostasGanhas}</span> / <span style={{ color: C.red }}>{totals.apostasPerdidas}</span> / <span style={{ color: C.amber }}>{totals.apostasEmAberto}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  <div style={{ marginTop: 22, paddingTop: 18, borderTop: `2px solid ${C.line}` }}>
                    <SectionHeader icon={Wallet} title="Depósitos e saques" subtitle="Fluxo de dinheiro entre você e a casa de apostas — separado do resultado das apostas em si" accent={C.inkSoft} />

                    <div className="flex flex-wrap gap-4" style={{ margin: "12px 0 16px" }}>
                      <GoalBar label={`Meta de saque hoje`} current={totals.sacadoHoje} goal={settings.metaSaqueDiaria} color={C.green} bg={C.greenSoft} />
                      <GoalBar label={`Meta de depósito hoje (limite)`} current={totals.depositadoHoje} goal={settings.metaDepositoDiaria} color={C.amber} bg={C.amberSoft} />
                    </div>

                    <div className="grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
                      <div>
                        <div style={{ fontFamily: "var(--font-sans)", fontSize: 12.5, fontWeight: 600, color: C.red, marginBottom: 4 }}>Depósitos</div>
                        <AddRow
                          fields={[
                            { key: "desc", label: "Descrição", placeholder: "Pix pro Bet365...", grow: true },
                            { key: "value", label: "Valor (R$)", type: "number", width: 110 },
                            { key: "date", label: "Data", type: "date", width: 140, required: false },
                          ]}
                          onAdd={addTo("deposits")}
                        />
                        {data.deposits.length === 0 ? (
                          <div style={{ padding: "12px 0", color: C.inkFaint, fontSize: 12.5, fontFamily: "var(--font-sans)" }}>Nenhum depósito lançado.</div>
                        ) : [...data.deposits].sort((a, b) => (b.date || "").localeCompare(a.date || "")).map((it) => (
                          <Ruled key={it.id}>
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex-1">
                                <div style={{ fontFamily: "var(--font-sans)", fontSize: 13 }}>{it.desc}</div>
                                {it.date && <div style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: C.inkFaint }}>{fmtDate(it.date)}</div>}
                              </div>
                              <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: C.red }}>{money(it.value)}</span>
                              <IconBtn onClick={() => removeFrom("deposits")(it.id)} title="Excluir"><Trash2 size={13} /></IconBtn>
                            </div>
                          </Ruled>
                        ))}
                        <div className="flex justify-between" style={{ paddingTop: 8 }}>
                          <span style={{ fontFamily: "var(--font-sans)", fontSize: 12, color: C.inkFaint }}>Total depositado</span>
                          <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: C.red, fontWeight: 600 }}>{money(totals.totalDepositado)}</span>
                        </div>
                      </div>

                      <div>
                        <div style={{ fontFamily: "var(--font-sans)", fontSize: 12.5, fontWeight: 600, color: C.green, marginBottom: 4 }}>Saques</div>
                        <AddRow
                          fields={[
                            { key: "desc", label: "Descrição", placeholder: "Saque pro banco...", grow: true },
                            { key: "value", label: "Valor (R$)", type: "number", width: 110 },
                            { key: "date", label: "Data", type: "date", width: 140, required: false },
                          ]}
                          onAdd={addTo("saques")}
                        />
                        {data.saques.length === 0 ? (
                          <div style={{ padding: "12px 0", color: C.inkFaint, fontSize: 12.5, fontFamily: "var(--font-sans)" }}>Nenhum saque lançado.</div>
                        ) : [...data.saques].sort((a, b) => (b.date || "").localeCompare(a.date || "")).map((it) => (
                          <Ruled key={it.id}>
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex-1">
                                <div style={{ fontFamily: "var(--font-sans)", fontSize: 13 }}>{it.desc}</div>
                                {it.date && <div style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: C.inkFaint }}>{fmtDate(it.date)}</div>}
                              </div>
                              <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: C.green }}>{money(it.value)}</span>
                              <IconBtn onClick={() => removeFrom("saques")(it.id)} title="Excluir"><Trash2 size={13} /></IconBtn>
                            </div>
                          </Ruled>
                        ))}
                        <div className="flex justify-between" style={{ paddingTop: 8 }}>
                          <span style={{ fontFamily: "var(--font-sans)", fontSize: 12, color: C.inkFaint }}>Total sacado</span>
                          <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: C.green, fontWeight: 600 }}>{money(totals.totalSacado)}</span>
                        </div>
                      </div>
                    </div>

                    <div
                      style={{
                        marginTop: 18, background: C.paper, border: `1.5px solid ${C.ink}`, borderRadius: 8, padding: "16px 18px",
                      }}
                    >
                      <div style={{ fontFamily: "var(--font-sans)", fontSize: 11.5, color: C.inkFaint, letterSpacing: 0.4, textTransform: "uppercase" }}>
                        Saldo atual na conta Bet365
                      </div>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 30, fontWeight: 600, color: totals.saldoBet365 >= 0 ? C.green : C.red, margin: "4px 0 10px" }}>
                        {money(totals.saldoBet365)}
                      </div>
                      <div className="flex flex-wrap gap-x-6 gap-y-1" style={{ fontFamily: "var(--font-mono)", fontSize: 12.5, color: C.inkSoft }}>
                        <span>+ depositado {money(totals.totalDepositado)}</span>
                        <span>+ ganhos {money(totals.retornado)}</span>
                        <span>− apostado {money(totals.apostado)}</span>
                        <span>− sacado {money(totals.totalSacado)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {tab === "config" && (
                <div>
                  <SectionHeader icon={Settings} title="Configurações" subtitle="Limite mínimo de saldo e alerta por e-mail" accent={C.ink} />
                  <div style={{ maxWidth: 380 }}>
                    <label style={{ display: "block", fontFamily: "var(--font-sans)", fontSize: 12.5, color: C.inkFaint, margin: "14px 0 5px" }}>Saldo mínimo desejado no mês (R$)</label>
                    <input type="number" step="0.01" value={settings.limite} onChange={(e) => updateSettings({ limite: parseFloat(e.target.value || 0) })} style={{ width: "100%", ...fieldStyle({ type: "number" }) }} />
                    <label style={{ display: "block", fontFamily: "var(--font-sans)", fontSize: 12.5, color: C.inkFaint, margin: "16px 0 5px" }}>E-mail para receber o alerta</label>
                    <input type="email" value={settings.email} placeholder="voce@email.com" onChange={(e) => updateSettings({ email: e.target.value })} style={{ width: "100%", ...fieldStyle({}) }} />

                    <label style={{ display: "block", fontFamily: "var(--font-sans)", fontSize: 12.5, color: C.inkFaint, margin: "16px 0 5px" }}>Meta diária de saque nas apostas (R$)</label>
                    <input type="number" step="0.01" value={settings.metaSaqueDiaria} onChange={(e) => updateSettings({ metaSaqueDiaria: parseFloat(e.target.value || 0) })} style={{ width: "100%", ...fieldStyle({ type: "number" }) }} />

                    <label style={{ display: "block", fontFamily: "var(--font-sans)", fontSize: 12.5, color: C.inkFaint, margin: "16px 0 5px" }}>Meta diária de depósito nas apostas (R$)</label>
                    <input type="number" step="0.01" value={settings.metaDepositoDiaria} onChange={(e) => updateSettings({ metaDepositoDiaria: parseFloat(e.target.value || 0) })} style={{ width: "100%", ...fieldStyle({ type: "number" }) }} />
                    <div className="flex gap-2" style={{ marginTop: 18, background: C.amberSoft, border: `1px solid ${C.amber}44`, borderRadius: 6, padding: "12px 14px" }}>
                      <Mail size={16} color={C.amber} style={{ flexShrink: 0, marginTop: 1 }} />
                      <p style={{ fontFamily: "var(--font-sans)", fontSize: 12.5, color: C.ink, margin: 0, lineHeight: 1.5 }}>
                        O painel mostra o alerta visual aqui dentro (barra do topo fica em laranja quando o saldo cai abaixo do limite).
                        O envio automático por e-mail exige um serviço rodando por fora — por exemplo, uma função agendada que lê esses
                        dados e dispara pelo SendGrid ou pela API do Gmail. Posso montar essa parte como próximo passo, se você quiser.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      <div style={{ maxWidth: 780, margin: "24px auto 0", width: "100%", textAlign: "center" }}>
        <span style={{ fontFamily: "var(--font-sans)", fontSize: 11.5, color: C.inkFaint }}>
          Sistema criado por Amanda Maricato / amandamrct
        </span>
      </div>
    </div>
  );
}
