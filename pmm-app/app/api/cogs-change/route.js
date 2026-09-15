import { NextResponse } from "next/server";
import { getRecord, updateRecord, createRecord } from "@/lib/store";
import { computeCOGSDiff } from "@/lib/calc";

// body: { articleId, newCOGS, user, note, productionPlanId? }
export async function POST(req) {
  const body = await req.json();
  const { articleId, newCOGS, user, note, productionPlanId } = body;
  if (!articleId || newCOGS == null) {
    return NextResponse.json({ error: "articleId dan newCOGS wajib diisi" }, { status: 400 });
  }
  const article = await getRecord("articles", articleId);
  if (!article) return NextResponse.json({ error: "Article tidak ditemukan" }, { status: 404 });

  const previous = article.currentCOGS || 0;
  const { diff, pct } = computeCOGSDiff(previous, newCOGS);

  const updatedArticle = await updateRecord("articles", articleId, { currentCOGS: newCOGS }, user);

  const historyEntry = await createRecord(
    "cogsHistory",
    {
      articleId,
      articleName: article.name,
      previousCOGS: previous,
      newCOGS,
      difference: diff,
      percentageDifference: pct,
      note: note || "",
      relatedProductionPlanId: productionPlanId || null,
    },
    user
  );

  return NextResponse.json({ data: { article: updatedArticle, cogsHistory: historyEntry } });
}
