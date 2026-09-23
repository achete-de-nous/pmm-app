"use client";
import { useEffect, useState } from "react";
import { apiList, apiCreate, apiCalc } from "@/lib/api-client";
import { useUser } from "@/components/UserContext";
import { useToast } from "@/components/ToastContext";
import ArticleInput from "@/components/ArticleInput";
import Modal from "@/components/Modal";
import EmptyState from "@/components/EmptyState";

async function ensureArticle(articles, name, user) {
  const found = articles.find((a) => a.name.toLowerCase() === name.toLowerCase());
  if (found) return found;
  return apiCreate("articles", { name, currentCOGS: 0 }, user);
}

export default function SalesPage() {
  const { currentUser } = useUser();
  const { showToast } = useToast();
  const [articles, setArticles] = useState([]);
  const [sales, setSales] = useState([]);
  const [summary, setSummary] = useState([]);
  const [salesOpen, setSalesOpen] = useState(false);
  const [balanceOpen, setBalanceOpen] = useState(false);

  const [salesForm, setSalesForm] = useState({ week: "", startDate: "", endDate: "", articleName: "", salesQty: "", note: "" });
  const [balanceForm, setBalanceForm] = useState({ articleName: "", qty: "", location: "Warehouse", date: "", note: "" });

  const refresh = async () => {
    const [a, s, sum] = await Promise.all([apiList("articles"), apiList("weeklySales"), apiCalc("stock-summary")]);
    setArticles(a);
    setSales(s);
    setSummary(sum);
  };

  useEffect(() => {
    refresh();
  }, []);

  const submitSales = async (e) => {
    e.preventDefault();
    if (!salesForm.articleName || !salesForm.salesQty) return;
    try {
      await ensureArticle(articles, salesForm.articleName, currentUser);
      await apiCreate(
        "weeklySales",
        {
          week: salesForm.week,
          startDate: salesForm.startDate,
          endDate: salesForm.endDate,
          articleName: salesForm.articleName,
          salesQty: Number(salesForm.salesQty),
          note: salesForm.note,
        },
        currentUser
      );
      showToast("Weekly sales disimpan");
      setSalesOpen(false);
      setSalesForm({ week: "", startDate: "", endDate: "", articleName: "", salesQty: "", note: "" });
      refresh();
    } catch (err) {
      showToast(err.message, "error");
    }
  };

  const submitBalance = async (e) => {
    e.preventDefault();
    if (!balanceForm.articleName || !balanceForm.qty) return;
    try {
      await ensureArticle(articles, balanceForm.articleName, currentUser);
      await apiCreate(
        "finishedInitialBalances",
        {
          articleName: balanceForm.articleName,
          qty: Number(balanceForm.qty),
          location: balanceForm.location,
          date: balanceForm.date,
          note: balanceForm.note,
        },
        currentUser
      );
      showToast("Initial balance disimpan");
      setBalanceOpen(false);
      setBalanceForm({ articleName: "", qty: "", location: "Warehouse", date: "", note: "" });
      refresh();
    } catch (err) {
      showToast(err.message, "error");
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div className="text-lg font-semibold">Weekly Sales</div>
        <div className="flex gap-2">
          <button className="btn-secondary" onClick={() => setBalanceOpen(true)}>
            + Initial Balance
          </button>
          <button className="btn-primary" onClick={() => setSalesOpen(true)}>
            + Weekly Sales
          </button>
        </div>
      </div>

      <div>
        <div className="font-medium mb-2 text-sm text-gray-600">Need to Produce Summary</div>
        {summary.length === 0 ? (
          <EmptyState title="Belum ada article yet." hint="Tambahkan weekly sales atau initial balance untuk memulai." />
        ) : (
          <div className="overflow-x-auto card p-0">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-gray-500">
                <tr>
                  <th className="px-3 py-2">Article</th>
                  <th className="px-3 py-2 text-right">Initial</th>
                  <th className="px-3 py-2 text-right">Fulfilled</th>
                  <th className="px-3 py-2 text-right">Sales</th>
                  <th className="px-3 py-2 text-right">Available</th>
                  <th className="px-3 py-2 text-right">Need to Produce</th>
                </tr>
              </thead>
              <tbody>
                {summary.map((r) => (
                  <tr key={r.articleName} className="border-t border-gray-100">
                    <td className="px-3 py-2 font-medium">{r.articleName}</td>
                    <td className="px-3 py-2 text-right">{r.initialBalance}</td>
                    <td className="px-3 py-2 text-right">{r.totalFulfilled}</td>
                    <td className="px-3 py-2 text-right">{r.totalSales}</td>
                    <td className="px-3 py-2 text-right">{r.availableStock}</td>
                    <td className="px-3 py-2 text-right font-semibold">{r.needToProduce}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div>
        <div className="font-medium mb-2 text-sm text-gray-600">Sales History</div>
        {sales.length === 0 ? (
          <EmptyState title="No weekly sales yet." />
        ) : (
          <div className="overflow-x-auto card p-0">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-gray-500">
                <tr>
                  <th className="px-3 py-2">Week</th>
                  <th className="px-3 py-2">Article</th>
                  <th className="px-3 py-2 text-right">Qty</th>
                  <th className="px-3 py-2">User</th>
                </tr>
              </thead>
              <tbody>
                {sales.map((s) => (
                  <tr key={s.id} className="border-t border-gray-100">
                    <td className="px-3 py-2">{s.week || "-"}</td>
                    <td className="px-3 py-2">{s.articleName}</td>
                    <td className="px-3 py-2 text-right">{s.salesQty}</td>
                    <td className="px-3 py-2 text-gray-500">{s.createdBy}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal open={salesOpen} onClose={() => setSalesOpen(false)} title="Add Weekly Sales">
        <form onSubmit={submitSales} className="flex flex-col gap-3">
          <div>
            <label className="label">Week (e.g. Week 1 - Sep 2026)</label>
            <input className="input" value={salesForm.week} onChange={(e) => setSalesForm({ ...salesForm, week: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Start Date</label>
              <input type="date" className="input" value={salesForm.startDate} onChange={(e) => setSalesForm({ ...salesForm, startDate: e.target.value })} />
            </div>
            <div>
              <label className="label">End Date</label>
              <input type="date" className="input" value={salesForm.endDate} onChange={(e) => setSalesForm({ ...salesForm, endDate: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="label">Article Name</label>
            <ArticleInput value={salesForm.articleName} onChange={(v) => setSalesForm({ ...salesForm, articleName: v })} articles={articles} />
          </div>
          <div>
            <label className="label">Sales Qty</label>
            <input type="number" className="input" value={salesForm.salesQty} onChange={(e) => setSalesForm({ ...salesForm, salesQty: e.target.value })} />
          </div>
          <div>
            <label className="label">Note</label>
            <input className="input" value={salesForm.note} onChange={(e) => setSalesForm({ ...salesForm, note: e.target.value })} />
          </div>
          <button type="submit" className="btn-primary mt-2">
            Simpan
          </button>
        </form>
      </Modal>

      <Modal open={balanceOpen} onClose={() => setBalanceOpen(false)} title="Add Initial Finished Product Balance">
        <form onSubmit={submitBalance} className="flex flex-col gap-3">
          <div>
            <label className="label">Article Name</label>
            <ArticleInput value={balanceForm.articleName} onChange={(v) => setBalanceForm({ ...balanceForm, articleName: v })} articles={articles} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Qty</label>
              <input type="number" className="input" value={balanceForm.qty} onChange={(e) => setBalanceForm({ ...balanceForm, qty: e.target.value })} />
            </div>
            <div>
              <label className="label">Date</label>
              <input type="date" className="input" value={balanceForm.date} onChange={(e) => setBalanceForm({ ...balanceForm, date: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="label">Location</label>
            <input className="input" value={balanceForm.location} onChange={(e) => setBalanceForm({ ...balanceForm, location: e.target.value })} />
          </div>
          <div>
            <label className="label">Note</label>
            <input className="input" value={balanceForm.note} onChange={(e) => setBalanceForm({ ...balanceForm, note: e.target.value })} />
          </div>
          <button type="submit" className="btn-primary mt-2">
            Simpan
          </button>
        </form>
      </Modal>
    </div>
  );
}
