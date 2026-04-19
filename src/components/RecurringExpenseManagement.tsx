import React, { useEffect, useState } from "react";
import {
  addDoc,
  collection,
  doc,
  getDocs,
  query,
  Timestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../contexts/AuthContext";

type RecurringPeriod = "daily" | "weekly" | "monthly" | "yearly";

interface RecurringExpenseManagementProps {
  onClose: () => void;
}

interface RecurringRule {
  id: string;
  amount: number;
  category: string;
  notes: string;
  period: RecurringPeriod;
  startDate: string;
  endDate?: string;
  lastGeneratedDate: string;
  createdAt?: Date;
}

const periodLabels: Record<RecurringPeriod, string> = {
  daily: "每日",
  weekly: "每週",
  monthly: "每月",
  yearly: "每年",
};

const categories = [
  "餐飲",
  "交通",
  "生活",
  "購物",
  "娛樂",
  "住支",
  "健康",
  "醫療",
  "旅遊",
  "服裝",
  "教育",
  "社交",
  "投資",
  "捐贈",
  "其他",
];

const formatDateKey = (date: Date) => {
  const normalized = new Date(date);
  normalized.setHours(0, 0, 0, 0);
  return `${normalized.getFullYear()}-${String(normalized.getMonth() + 1).padStart(2, "0")}-${String(normalized.getDate()).padStart(2, "0")}`;
};

const getLastDayOfMonth = (year: number, monthIndex: number) =>
  new Date(year, monthIndex + 1, 0).getDate();

const getNextRecurringDate = (
  from: Date,
  period: RecurringPeriod,
  anchorDateValue: string | Date,
) => {
  const baseDate = new Date(from);
  baseDate.setHours(0, 0, 0, 0);

  const anchorDate = new Date(anchorDateValue);
  anchorDate.setHours(0, 0, 0, 0);

  if (period === "daily") {
    const next = new Date(baseDate);
    next.setDate(next.getDate() + 1);
    return next;
  }

  if (period === "weekly") {
    const next = new Date(baseDate);
    next.setDate(next.getDate() + 7);
    return next;
  }

  if (period === "monthly") {
    const targetMonthIndex = baseDate.getMonth() + 1;
    const targetYear = baseDate.getFullYear() + Math.floor(targetMonthIndex / 12);
    const normalizedMonthIndex = targetMonthIndex % 12;
    const targetDay = Math.min(
      anchorDate.getDate(),
      getLastDayOfMonth(targetYear, normalizedMonthIndex),
    );
    return new Date(targetYear, normalizedMonthIndex, targetDay);
  }

  const targetYear = baseDate.getFullYear() + 1;
  const targetMonthIndex = anchorDate.getMonth();
  const targetDay = Math.min(
    anchorDate.getDate(),
    getLastDayOfMonth(targetYear, targetMonthIndex),
  );
  return new Date(targetYear, targetMonthIndex, targetDay);
};

const getPreviousRecurringDate = (
  startDateValue: string | Date,
  period: RecurringPeriod,
) => {
  const startDate = new Date(startDateValue);
  startDate.setHours(0, 0, 0, 0);

  if (period === "daily") {
    const previous = new Date(startDate);
    previous.setDate(previous.getDate() - 1);
    return previous;
  }

  if (period === "weekly") {
    const previous = new Date(startDate);
    previous.setDate(previous.getDate() - 7);
    return previous;
  }

  if (period === "monthly") {
    const targetMonthIndex = startDate.getMonth() - 1;
    const targetYear =
      startDate.getFullYear() + Math.floor(targetMonthIndex / 12);
    const normalizedMonthIndex = ((targetMonthIndex % 12) + 12) % 12;
    const targetDay = Math.min(
      startDate.getDate(),
      getLastDayOfMonth(targetYear, normalizedMonthIndex),
    );
    return new Date(targetYear, normalizedMonthIndex, targetDay);
  }

  const targetYear = startDate.getFullYear() - 1;
  const targetMonthIndex = startDate.getMonth();
  const targetDay = Math.min(
    startDate.getDate(),
    getLastDayOfMonth(targetYear, targetMonthIndex),
  );
  return new Date(targetYear, targetMonthIndex, targetDay);
};

const RecurringExpenseManagement: React.FC<RecurringExpenseManagementProps> = ({
  onClose,
}) => {
  const { currentUser } = useAuth();
  const [rules, setRules] = useState<RecurringRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>("");
  const [success, setSuccess] = useState<string>("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("其他");
  const [notes, setNotes] = useState("");
  const [period, setPeriod] = useState<RecurringPeriod>("monthly");
  const [startDate, setStartDate] = useState(() => formatDateKey(new Date()));
  const [endDate, setEndDate] = useState("");

  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<{
    amount: string; category: string; notes: string;
    period: RecurringPeriod; startDate: string; endDate: string;
    originalLastGeneratedDate: string; originalStartDate: string; originalPeriod: RecurringPeriod;
  } | null>(null);

  const loadRules = async () => {
    if (!currentUser) return;

    setLoading(true);
    setError("");

    try {
      const snapshot = await getDocs(
        query(
          collection(db, "recurringExpenses"),
          where("userId", "==", currentUser.uid),
          where("isActive", "==", true),
        ),
      );

      const nextRules = snapshot.docs
        .map((ruleDoc) => {
          const data = ruleDoc.data();
          const createdAt =
            data.createdAt && typeof data.createdAt.toDate === "function"
              ? data.createdAt.toDate()
              : undefined;

          return {
            id: ruleDoc.id,
            amount: data.amount,
            category: data.category,
            notes: data.notes || "",
            period: data.period,
            startDate: data.startDate,
            endDate: data.endDate || undefined,
            lastGeneratedDate: data.lastGeneratedDate,
            createdAt,
          } as RecurringRule;
        })
        .sort((a, b) => {
          const aTime = a.createdAt ? a.createdAt.getTime() : 0;
          const bTime = b.createdAt ? b.createdAt.getTime() : 0;
          return bTime - aTime;
        });

      // 修復因編輯 bug 導致 lastGeneratedDate 被錯誤重置的規則
      const today = formatDateKey(new Date());
      const repairPromises = nextRules.map(async (rule) => {
        const nextDue = formatDateKey(
          getNextRecurringDate(new Date(rule.lastGeneratedDate), rule.period, rule.startDate)
        );
        // 只修復「下次產生日 <= 今天但規則起始日 <= 今天」且可能已有更新紀錄的規則
        if (nextDue <= today) {
          const expSnap = await getDocs(
            query(
              collection(db, "expenses"),
              where("recurringRuleId", "==", rule.id),
              where("userId", "==", currentUser.uid),
            )
          );
          if (!expSnap.empty) {
            const dates = expSnap.docs
              .map((d) => d.data().recurringInstanceDate as string)
              .filter(Boolean)
              .sort();
            const latestDate = dates[dates.length - 1];
            if (latestDate && latestDate > rule.lastGeneratedDate) {
              await updateDoc(doc(db, "recurringExpenses", rule.id), {
                lastGeneratedDate: latestDate,
              });
              rule.lastGeneratedDate = latestDate;
            }
          }
        }
      });
      await Promise.all(repairPromises);

      setRules(nextRules);
    } catch (_error) {
      setError("載入定期費用規則失敗，請稍後再試");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRules();
  }, [currentUser]);

  const resetForm = () => {
    setAmount("");
    setCategory("其他");
    setNotes("");
    setPeriod("monthly");
    setStartDate(formatDateKey(new Date()));
    setEndDate("");
  };

  const openInlineEdit = (rule: RecurringRule) => {
    setEditingRuleId(rule.id);
    setEditValues({
      amount: String(rule.amount),
      category: rule.category,
      notes: rule.notes,
      period: rule.period,
      startDate: rule.startDate,
      endDate: rule.endDate || "",
      originalLastGeneratedDate: rule.lastGeneratedDate,
      originalStartDate: rule.startDate,
      originalPeriod: rule.period,
    });
  };

  const cancelInlineEdit = () => {
    setEditingRuleId(null);
    setEditValues(null);
  };

  const handleUpdateRule = async (e: React.FormEvent, ruleId: string) => {
    e.preventDefault();
    if (!currentUser || !editValues) return;

    const numericAmount = Number(editValues.amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      setError("請輸入正確金額");
      return;
    }
    if (!editValues.startDate) {
      setError("請選擇開始日期");
      return;
    }
    if (editValues.endDate && editValues.endDate < editValues.startDate) {
      setError("結束日期不能早於開始日期");
      return;
    }

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const startDateOrPeriodChanged =
        editValues.startDate !== editValues.originalStartDate ||
        editValues.period !== editValues.originalPeriod;
      const lastGeneratedDate = startDateOrPeriodChanged
        ? formatDateKey(getPreviousRecurringDate(editValues.startDate, editValues.period))
        : editValues.originalLastGeneratedDate;
      await updateDoc(doc(db, "recurringExpenses", ruleId), {
        amount: numericAmount,
        category: editValues.category,
        notes: editValues.notes.trim(),
        period: editValues.period,
        startDate: editValues.startDate,
        endDate: editValues.endDate || null,
        lastGeneratedDate,
        updatedAt: Timestamp.now(),
      });

      setSuccess("定期費用規則已更新");
      cancelInlineEdit();
      await loadRules();
    } catch (_error) {
      setError("更新定期費用規則失敗，請稍後再試");
    } finally {
      setSaving(false);
    }
  };

  const handleCreateRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;

    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      setError("請輸入正確金額");
      return;
    }

    if (!startDate) {
      setError("請選擇開始日期");
      return;
    }

    if (endDate && endDate < startDate) {
      setError("結束日期不能早於開始日期");
      return;
    }

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const previousOccurrence = getPreviousRecurringDate(startDate, period);

      await addDoc(collection(db, "recurringExpenses"), {
        userId: currentUser.uid,
        sourceExpenseId: null,
        amount: numericAmount,
        category,
        notes: notes.trim(),
        period,
        startDate,
        endDate: endDate || null,
        lastGeneratedDate: formatDateKey(previousOccurrence),
        isActive: true,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
        ruleSource: "manager",
      });

      setSuccess("定期費用規則已建立");
      resetForm();
      await loadRules();
    } catch (_error) {
      setError("建立定期費用規則失敗，請稍後再試");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteRule = async (ruleId: string) => {
    if (!window.confirm("確定要刪除這條定期規則嗎？這不會刪掉已產生的支出。")) {
      return;
    }

    try {
      await updateDoc(doc(db, "recurringExpenses", ruleId), {
        isActive: false,
        updatedAt: Timestamp.now(),
      });

      setRules((prev) => prev.filter((rule) => rule.id !== ruleId));
      setSuccess("定期費用規則已刪除");
    } catch (_error) {
      setError("刪除定期費用規則失敗，請稍後再試");
    }
  };

  const renderNextDueDate = (rule: RecurringRule) => {
    const nextDue = getNextRecurringDate(
      new Date(rule.lastGeneratedDate),
      rule.period,
      rule.startDate,
    );

    if (rule.endDate) {
      const endDateValue = new Date(rule.endDate);
      endDateValue.setHours(0, 0, 0, 0);
      if (nextDue > endDateValue) {
        return "已到結束日";
      }
    }

    return formatDateKey(nextDue);
  };

  return (
    <div className="p-5">
      <div className="sticky top-0 z-20 -mx-5 mb-4 flex items-start justify-between bg-white px-5 pb-4 pt-1">
        <div>
          <h2 className="text-2xl font-bold text-[#A487C3]">定期費用管理</h2>
          <p className="text-sm text-gray-500 mt-1">
            管理規則本身，不會直接新增或刪除現有支出
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="mt-1 shrink-0 text-white hover:text-white bg-[#A487C3] hover:bg-[#8A5DC8] w-8 h-8 flex items-center justify-center border border-[#F5F5F5] rounded-full shadow-sm hover:shadow-md transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-white"
        >
          <i className="fas fa-times"></i>
        </button>
      </div>

      <div className="mb-5 rounded-xl border border-[#E6DDF3] bg-[#FBF8FF] p-4">
        <p className="text-sm text-gray-700 leading-6">
          每月與每年規則會以開始日期作為基準日。若該月份沒有對應日期（例如 31 號遇到二月），系統會自動調整至該月最後一天，並在下個有該日期的月份恢復原始日期。
        </p>
      </div>

      {(error || success) && (
        <div className={`mb-4 rounded-xl px-4 py-3 text-sm ${error ? "bg-red-50 text-red-600" : "bg-green-50 text-green-600"}`}>
          {error || success}
        </div>
      )}

      <form onSubmit={handleCreateRule} className="space-y-4 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">金額</label>
            <input
              type="number"
              min="1"
              step="1"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#A487C3] focus:outline-none focus:ring-2 focus:ring-[#E6DDF3]"
              placeholder="例如 1200"
              required
            />
          </div>

          <div className="col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">類別</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#A487C3] focus:outline-none focus:ring-2 focus:ring-[#E6DDF3]"
            >
              {categories.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>

          <div className="col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">規則</label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {(["daily", "weekly", "monthly", "yearly"] as RecurringPeriod[]).map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setPeriod(item)}
                  className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                    period === item
                      ? "border-[#A487C3] bg-[#A487C3] text-white"
                      : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  {periodLabels[item]}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">開始日期</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#A487C3] focus:outline-none focus:ring-2 focus:ring-[#E6DDF3]"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">結束日期</label>
            <input
              type="date"
              min={startDate}
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#A487C3] focus:outline-none focus:ring-2 focus:ring-[#E6DDF3]"
            />
          </div>

          <div className="col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">備註</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#A487C3] focus:outline-none focus:ring-2 focus:ring-[#E6DDF3]"
              placeholder="例如房租、訂閱費、保險"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={saving}
          className="w-full rounded-xl bg-[#A487C3] px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-[#9576B7] disabled:cursor-not-allowed disabled:opacity-70"
        >
          {saving ? "建立中..." : "新增定期費用規則"}
        </button>
      </form>

      <div className="mt-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold text-gray-800">目前規則</h3>
          <button
            type="button"
            onClick={loadRules}
            className="relative flex h-9 w-9 items-center justify-center rounded-full border border-[#D8CAE9] bg-white text-transparent transition-colors hover:bg-[#F7F1FD] after:absolute after:inset-0 after:flex after:items-center after:justify-center after:text-base after:text-[#A487C3] after:content-['↻'] hover:after:text-[#8F6FB2]"
            aria-label="重新整理定期規則"
            title="重新整理"
          >
            重新整理
          </button>
        </div>

        {loading ? (
          <div className="rounded-xl border border-dashed border-gray-200 p-6 text-center text-sm text-gray-500">
            載入中...
          </div>
        ) : rules.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-200 p-6 text-center text-sm text-gray-500">
            目前沒有任何定期費用規則
          </div>
        ) : (
          <div className="space-y-3">
            {rules.map((rule) => (
              <div key={rule.id} className={`rounded-2xl border bg-white shadow-sm transition-all ${editingRuleId === rule.id ? "border-[#A487C3]" : "border-gray-100"}`}>
                {/* 顯示模式 */}
                <div className="flex items-start justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="rounded-full bg-[#F1E8FB] px-2.5 py-1 text-xs font-medium text-[#A487C3]">
                        {periodLabels[rule.period]}
                      </span>
                      <span className="text-sm font-semibold text-gray-800">{rule.category}</span>
                      <span className="text-sm text-[#E07A8D] font-semibold">NT$ {rule.amount}</span>
                    </div>
                    <p className="mt-2 text-sm text-gray-600">開始日：{rule.startDate}{!rule.endDate && " 無結束日"}</p>
                    {rule.endDate && <p className="text-sm text-gray-600">結束日：{rule.endDate}</p>}
                    <p className="mt-1 text-sm text-gray-600">
                      下次將產生：{renderNextDueDate(rule)}
                    </p>
                    {rule.notes && <p className="mt-2 text-sm text-gray-500 truncate">{rule.notes}</p>}
                  </div>

                  <div className="flex flex-col gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => editingRuleId === rule.id ? cancelInlineEdit() : openInlineEdit(rule)}
                      className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${editingRuleId === rule.id ? "bg-gray-100 text-gray-500 hover:bg-gray-200" : "bg-[#F1E8FB] text-[#A487C3] hover:bg-[#E6DDF3]"}`}
                    >
                      {editingRuleId === rule.id ? "取消" : "編輯"}
                    </button>
                    {editingRuleId !== rule.id && (
                      <button
                        type="button"
                        onClick={() => handleDeleteRule(rule.id)}
                        className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-500 transition-colors hover:bg-red-100"
                      >
                        刪除
                      </button>
                    )}
                  </div>
                </div>

                {/* 展開的 inline 編輯表單 */}
                {editingRuleId === rule.id && editValues && (
                  <form
                    onSubmit={(e) => handleUpdateRule(e, rule.id)}
                    className="border-t border-[#E6DDF3] px-4 pb-4 pt-3 space-y-3"
                  >
                    <div className="grid grid-cols-2 gap-3">
                      <div className="col-span-2">
                        <label className="block text-xs font-medium text-gray-600 mb-1">金額</label>
                        <input
                          type="number" min="1" step="1" required
                          value={editValues.amount}
                          onChange={(e) => setEditValues({ ...editValues, amount: e.target.value })}
                          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#A487C3] focus:outline-none focus:ring-2 focus:ring-[#E6DDF3]"
                        />
                      </div>
                      <div className="col-span-2">
                        <label className="block text-xs font-medium text-gray-600 mb-1">類別</label>
                        <select
                          value={editValues.category}
                          onChange={(e) => setEditValues({ ...editValues, category: e.target.value })}
                          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#A487C3] focus:outline-none focus:ring-2 focus:ring-[#E6DDF3]"
                        >
                          {categories.map((item) => <option key={item} value={item}>{item}</option>)}
                        </select>
                      </div>
                      <div className="col-span-2">
                        <label className="block text-xs font-medium text-gray-600 mb-1">規則</label>
                        <div className="grid grid-cols-4 gap-1.5">
                          {(["daily", "weekly", "monthly", "yearly"] as RecurringPeriod[]).map((item) => (
                            <button
                              key={item} type="button"
                              onClick={() => setEditValues({ ...editValues, period: item })}
                              className={`rounded-lg border px-2 py-2 text-xs font-medium transition-colors ${editValues.period === item ? "border-[#A487C3] bg-[#A487C3] text-white" : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"}`}
                            >
                              {periodLabels[item]}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">開始日期</label>
                        <input
                          type="date" required
                          value={editValues.startDate}
                          onChange={(e) => setEditValues({ ...editValues, startDate: e.target.value })}
                          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#A487C3] focus:outline-none focus:ring-2 focus:ring-[#E6DDF3]"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">結束日期</label>
                        <input
                          type="date"
                          min={editValues.startDate}
                          value={editValues.endDate}
                          onChange={(e) => setEditValues({ ...editValues, endDate: e.target.value })}
                          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#A487C3] focus:outline-none focus:ring-2 focus:ring-[#E6DDF3]"
                        />
                      </div>
                      <div className="col-span-2">
                        <label className="block text-xs font-medium text-gray-600 mb-1">備註</label>
                        <input
                          type="text"
                          value={editValues.notes}
                          onChange={(e) => setEditValues({ ...editValues, notes: e.target.value })}
                          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#A487C3] focus:outline-none focus:ring-2 focus:ring-[#E6DDF3]"
                          placeholder="例如房租、訂閱費、保險"
                        />
                      </div>
                    </div>
                    <button
                      type="submit"
                      disabled={saving}
                      className="w-full rounded-xl bg-[#A487C3] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#9576B7] disabled:opacity-70"
                    >
                      {saving ? "儲存中..." : "儲存變更"}
                    </button>
                  </form>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default RecurringExpenseManagement;

