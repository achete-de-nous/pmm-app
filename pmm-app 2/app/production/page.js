"use client";
import { useEffect, useMemo, useState } from "react";
import { apiList, apiCreate, apiCalc, apiPost } from "@/lib/api-client";
import { useUser } from "@/components/UserContext";
import { useToast } from "@/components/ToastContext";
import Modal from "@/components/Modal";
import EmptyState from "@/components/EmptyState";
import ArticleInput from "@/components/ArticleInput";

const idr = (n) => "Rp" + Math.round(n || 0).toLocaleString("id-ID");

export default function ProductionPage() {
  const { currentUser } = useUser();
  const { showToast } = useToast();
  const [articles, setArticles] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [plans, setPlans] = useState([]);
  const [stockSummary, setStockSummary] = useState([]);
  const [filter, setFilter] = useState("All");
  const [addOpen, setAddOpen] = useState(false);
  const [fulfillOpen, setFulfillOpen] = useState(null);
  const [fulfillQty, setFulfillQty] = useState("");

  const [form, setForm] = useState({ batch: "", date: "", articleName: "", plannedQty: "", vendorId: "", cogs: "", note: "" });

  const refresh = async () => {
    const [a, v, p, s] = await Promise.all([
      apiList("articles"),
      apiList("vendors"),
      apiList("productionPlans"),
      apiCalc("stock-summary"),
    ]);
    setArticles(a);
    setVendors(v);
    setPlans(p);
    setStockSummary(s);
  };

  useEffect(() => {
    refresh();
  }, []);

  const needForArticle = (name) => stockSummary.find((r) => r.articleName === name)?.needToProduce ?? 0;

  const submitPlan = async (e) => {
    e.preventDefault();
    if (!form.articleName || !form.plannedQty) return;
    try {
      const article = articles.find((a) => a.name.toLowerCase() === form.articleName.toLowerCase());
      const cogs = form.cogs !== "" ? Number(form.cogs) : article?.currentCOGS || 0;
      await apiCreate(
        "productionPlans",
        {
          batch: form.batch,
          date: form.date,
          articleName: form.articleName,
          articleId: article?.id || null,
          plannedQty: Number(form.plannedQty),
          calculatedNeedToProduce: needForArticle(form.articleName),
          vendorId: form.vendorId,
          cogs,
          fulfilledQty: 0,
          unfulfilledQty: Number(form.plannedQty),
          confirmed: false,
          status: "Pending",
          note: form.note,
        },
        currentUser
      );
      showToast("Production plan disimpan");
      setAddOpen(false);
      setForm({ batch: "", date: "", articleName: "", plannedQty: "", vendorId: "", cogs: "", note: "" });
      refresh();
    } catch (err) {
      showToast(err.message, "error");
    }
  };

  const confirmPlan = async (plan) => {
    try {
      await apiPost(`/api/production-plans/${plan.id}/confirm`, { user: currentUser });
      showToast("Production plan confirmed, COGS locked");
      refresh();
    } catch (err) {
      showToast(err.message, "error");
    }
  };

  const openFulfill = (plan) => {
    setFulfillOpen(plan);
    setFulfillQty(String(plan.fulfilledQty || 0));
  };

  const submitFulfill = async (e) => {
    e.preventDefault();
    try {
      await apiPost(`/api/production-plans/${fulfillOpen.id}/fulfill`, {
        fulfilledQty: Number(fulfillQty),
        user: currentUser,
      });
      showToast("Fulfilled qty diupdate");
      setFulfillOpen(null);
      refresh();
    } catch (err) {
      showToast(err.message, "error");
    }
  };

  const filteredPlans = useMemo(() => {
    if (filter === "All") return plans;
    return plans.filter((p) => p.status === filter);
  }, [plans, filter]);

  const vendorName = (id) => vendors.find((v) => v.id === id)?.name || "-";

  const totals = useMemo(() => {
    const planned = plans.reduce((s, p) => s + (Number(p.plannedQty) || 0), 0);
    const fulfilled = plans.reduce((s, p) => s + (Number(p.fulfilledQty) || 0), 0);
    return { planned, fulfilled, unfulfilled: planned - fulfilled, progress: planned ? Math.round((fulfilled / planned) * 100) : 0 };
  }, [plans]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div className="text-lg font-semibold">Production</div>
        <button className="btn-primary" onClick={() => setAddOpen(true)}>
          + Production Plan
        </button>
      </div>

      <div className="card">
        <div className="label">Overall Progress</div>
        <div className="flex items-center justify-between text-sm mb-2">
          <span>
            {totals.fulfilled} / {totals.planned} pcs fulfilled
          </span>
          <span className="font-semibold">{totals.progress}%</span>
        </div>
        <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
          <div className="h-full bg-ink" style={{ width: `${totals.progress}%` }} />
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto no-scrollbar">
        {["All", "Pending", "Confirmed", "Partially Fulfilled", "Fulfilled"].map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`whitespace-nowrap text-sm px-3 py-1.5 rounded-full border ${
              filter === s ? "bg-ink text-white border-ink" : "border-gray-200 text-gray-600"
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {filteredPlans.length === 0 ? (
        <EmptyState title="No production plans yet." />
      ) : (
        <div className="flex flex-col gap-3">
          {filteredPlans.map((p) => {
            const progress = p.plannedQty ? Math.round(((p.fulfilledQty || 0) / p.plannedQty) * 100) : 0;
            return (
              <div key={p.id} className="card">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="font-medium">{p.articleName}</div>
                    <div className="text-xs text-gray-500">
                      {vendorName(p.vendorId)} {p.batch ? `· ${p.batch}` : ""}
                    </div>
                  </div>
                  <span className="text-xs px-2 py-0.5 rounded-full border border-gray-200">{p.status}</span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-sm mt-3">
                  <div>
                    <div className="text-xs text-gray-500">Planned</div>
                    <div className="font-medium">{p.plannedQty}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">Fulfilled</div>
                    <div className="font-medium">{p.fulfilledQty || 0}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">COGS</div>
                    <div className="font-medium">{idr(p.confirmed ? p.confirmedCOGS : p.cogs)}</div>
                  </div>
                </div>
                <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden mt-3">
                  <div className="h-full bg-ink" style={{ width: `${progress}%` }} />
                </div>
                <div className="flex gap-2 mt-3">
                  {!p.confirmed && (
                    <button className="btn-secondary text-xs" onClick={() => confirmPlan(p)}>
                      Confirm
                    </button>
                  )}
                  <button className="btn-secondary text-xs" onClick={() => openFulfill(p)}>
                    Update Fulfilled
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Add Production Plan">
        <form onSubmit={submitPlan} className="flex flex-col gap-3">
          <div>
            <label className="label">Article Name</label>
            <ArticleInput value={form.articleName} onChange={(v) => setForm({ ...form, articleName: v })} articles={articles} />
            {form.articleName && (
              <div className="text-xs text-gray-500 mt-1">Need to Produce (calculated): {needForArticle(form.articleName)} pcs</div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Batch</label>
              <input className="input" value={form.batch} onChange={(e) => setForm({ ...form, batch: e.target.value })} />
            </div>
            <div>
              <label className="label">Date</label>
              <input type="date" className="input" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Planned Qty</label>
              <input type="number" className="input" value={form.plannedQty} onChange={(e) => setForm({ ...form, plannedQty: e.target.value })} />
            </div>
            <div>
              <label className="label">Vendor</label>
              <select className="input" value={form.vendorId} onChange={(e) => setForm({ ...form, vendorId: e.target.value })}>
                <option value="">Pilih vendor</option>
                {vendors.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="label">COGS (kosongkan untuk pakai current article COGS)</label>
            <input type="number" className="input" value={form.cogs} onChange={(e) => setForm({ ...form, cogs: e.target.value })} />
          </div>
          <div>
            <label className="label">Note</label>
            <input className="input" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          </div>
          <button type="submit" className="btn-primary mt-2">
            Simpan
          </button>
        </form>
      </Modal>

      <Modal open={!!fulfillOpen} onClose={() => setFulfillOpen(null)} title={`Update Fulfilled - ${fulfillOpen?.articleName || ""}`}>
        <form onSubmit={submitFulfill} className="flex flex-col gap-3">
          <div>
            <label className="label">Fulfilled Qty (Planned: {fulfillOpen?.plannedQty})</label>
            <input type="number" className="input" value={fulfillQty} onChange={(e) => setFulfillQty(e.target.value)} />
          </div>
          <button type="submit" className="btn-primary mt-2">
            Simpan
          </button>
        </form>
      </Modal>
    </div>
  );
}
