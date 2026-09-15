"use client";
import { useEffect, useState } from "react";
import { apiList, apiPost } from "@/lib/api-client";
import { useUser } from "@/components/UserContext";
import { useToast } from "@/components/ToastContext";
import Modal from "@/components/Modal";
import EmptyState from "@/components/EmptyState";

const idr = (n) => "Rp" + Math.round(n || 0).toLocaleString("id-ID");

export default function CogsHistoryPage() {
  const { currentUser } = useUser();
  const { showToast } = useToast();
  const [articles, setArticles] = useState([]);
  const [history, setHistory] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ articleId: "", newCOGS: "", note: "" });

  const refresh = async () => {
    const [a, h] = await Promise.all([apiList("articles"), apiList("cogsHistory")]);
    setArticles(a);
    setHistory(h);
  };

  useEffect(() => {
    refresh();
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.articleId || form.newCOGS === "") return;
    try {
      await apiPost("/api/cogs-change", {
        articleId: form.articleId,
        newCOGS: Number(form.newCOGS),
        note: form.note,
        user: currentUser,
      });
      showToast("COGS diupdate");
      setOpen(false);
      setForm({ articleId: "", newCOGS: "", note: "" });
      refresh();
    } catch (err) {
      showToast(err.message, "error");
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div className="text-lg font-semibold">COGS History</div>
        <button className="btn-primary" onClick={() => setOpen(true)}>
          + Change COGS
        </button>
      </div>

      <div>
        <div className="font-medium mb-2 text-sm text-gray-600">Current Article COGS</div>
        {articles.length === 0 ? (
          <EmptyState title="Belum ada article." />
        ) : (
          <div className="overflow-x-auto card p-0">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-gray-500">
                <tr>
                  <th className="px-3 py-2">Article</th>
                  <th className="px-3 py-2 text-right">Current COGS</th>
                </tr>
              </thead>
              <tbody>
                {articles.map((a) => (
                  <tr key={a.id} className="border-t border-gray-100">
                    <td className="px-3 py-2 font-medium">{a.name}</td>
                    <td className="px-3 py-2 text-right">{idr(a.currentCOGS)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div>
        <div className="font-medium mb-2 text-sm text-gray-600">Change History</div>
        {history.length === 0 ? (
          <EmptyState title="Belum ada perubahan COGS." />
        ) : (
          <div className="overflow-x-auto card p-0">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-gray-500">
                <tr>
                  <th className="px-3 py-2">Article</th>
                  <th className="px-3 py-2 text-right">Previous</th>
                  <th className="px-3 py-2 text-right">New</th>
                  <th className="px-3 py-2 text-right">Diff</th>
                  <th className="px-3 py-2 text-right">%</th>
                  <th className="px-3 py-2">User</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.id} className="border-t border-gray-100">
                    <td className="px-3 py-2 font-medium">{h.articleName}</td>
                    <td className="px-3 py-2 text-right">{idr(h.previousCOGS)}</td>
                    <td className="px-3 py-2 text-right">{idr(h.newCOGS)}</td>
                    <td className="px-3 py-2 text-right">{idr(h.difference)}</td>
                    <td className="px-3 py-2 text-right">{Number(h.percentageDifference).toFixed(2)}%</td>
                    <td className="px-3 py-2 text-gray-500">{h.createdBy}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="Change Article COGS">
        <form onSubmit={submit} className="flex flex-col gap-3">
          <div>
            <label className="label">Article</label>
            <select className="input" value={form.articleId} onChange={(e) => setForm({ ...form, articleId: e.target.value })}>
              <option value="">Pilih article</option>
              {articles.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} (current: {idr(a.currentCOGS)})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">New COGS</label>
            <input type="number" className="input" value={form.newCOGS} onChange={(e) => setForm({ ...form, newCOGS: e.target.value })} />
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
    </div>
  );
}
