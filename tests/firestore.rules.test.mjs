// Firestore 安全規則測試
//
// 執行：npm run test:rules
// 需要 Java（模擬器）。專案 ID 用 demo- 開頭，模擬器會完全離線，不會連到正式資料庫。
//
// 測試分兩類：
//   「功能」：App 目前實際會做的讀寫，規則收緊後必須仍然可以
//   「攻擊」：其他使用者或未登入者，必須被擋下

import { test, before, beforeEach, after } from 'node:test';
import { readFileSync } from 'node:fs';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} from '@firebase/rules-unit-testing';
import {
  doc,
  getDoc,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  collection,
  query,
  where,
  getDocs,
  runTransaction,
} from 'firebase/firestore';

const ALICE = 'alice';
const BOB = 'bob';

let env;

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-accounting-book',
    firestore: {
      rules: readFileSync(process.env.RULES_FILE || 'firestore.rules', 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  });
});

after(async () => {
  await env?.cleanup();
});

// 每個測試前重建一份乾淨的資料：Alice 在每個個人 collection 各有一筆
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    for (const col of ['incomes', 'loans', 'recurringExpenses', 'recurringIncomes', 'expenses']) {
      await setDoc(doc(db, col, 'alice-1'), { userId: ALICE, amount: 100, notes: '私人備註' });
    }
    await setDoc(doc(db, 'expenses', 'bob-1'), { userId: BOB, amount: 50 });
    await setDoc(doc(db, 'budgets', ALICE), { monthly: 30000 });
    await setDoc(doc(db, 'categories', 'alice-cat'), { userId: ALICE, name: '寵物' });
    await setDoc(doc(db, 'categories', 'default-cat'), { userId: 'default', name: '餐飲' });
    await setDoc(doc(db, 'users', ALICE), { nickname: 'Alice' });
  });
});

const as = (uid) => env.authenticatedContext(uid).firestore();
const anon = () => env.unauthenticatedContext().firestore();

const PERSONAL = ['incomes', 'loans', 'recurringExpenses', 'recurringIncomes'];

// ─────────────────────────── 功能：必須仍然可以 ───────────────────────────

for (const col of PERSONAL) {
  test(`功能｜${col}：本人可以新增、讀取、修改、刪除`, async () => {
    const db = as(ALICE);
    const ref = await assertSucceeds(addDoc(collection(db, col), { userId: ALICE, amount: 1 }));
    await assertSucceeds(getDoc(ref));
    await assertSucceeds(updateDoc(ref, { amount: 2 })); // 部分更新，userId 不變
    await assertSucceeds(deleteDoc(ref));
  });

  test(`功能｜${col}：本人可以用 userId == 自己 查詢`, async () => {
    const q = query(collection(as(ALICE), col), where('userId', '==', ALICE));
    await assertSucceeds(getDocs(q));
  });
}

test('功能｜定期收入補產：交易中先讀一筆還不存在的文件，再建立', async () => {
  const db = as(ALICE);
  const ref = doc(db, 'incomes', 'recurring_rule1_2026-11-10');
  await assertSucceeds(
    runTransaction(db, async (tx) => {
      const existing = await tx.get(ref);
      if (!existing.exists()) tx.set(ref, { userId: ALICE, amount: 30000 });
    }),
  );
});

test('功能｜定期支出補產：交易中先讀一筆還不存在的文件，再建立', async () => {
  const db = as(ALICE);
  const ref = doc(db, 'expenses', 'recurring_rule1_2026-11-10');
  await assertSucceeds(
    runTransaction(db, async (tx) => {
      const existing = await tx.get(ref);
      if (!existing.exists()) tx.set(ref, { userId: ALICE, amount: 199 });
    }),
  );
});

test('功能｜預算：本人可以讀寫 budgets/{自己的 uid}', async () => {
  const ref = doc(as(ALICE), 'budgets', ALICE);
  await assertSucceeds(getDoc(ref));
  await assertSucceeds(setDoc(ref, { monthly: 25000 }));
});

test("功能｜類別：可以查 userId in [自己, 'default']", async () => {
  const q = query(collection(as(ALICE), 'categories'), where('userId', 'in', [ALICE, 'default']));
  await assertSucceeds(getDocs(q));
});

test('功能｜支出：本人可以新增、修改、刪除', async () => {
  const db = as(ALICE);
  const ref = await assertSucceeds(addDoc(collection(db, 'expenses'), { userId: ALICE, amount: 80 }));
  await assertSucceeds(updateDoc(ref, { amount: 90 }));
  await assertSucceeds(deleteDoc(ref));
});

test('功能｜排行榜：仍可讀取成員的支出（userId in [...]）', async () => {
  const q = query(collection(as(ALICE), 'expenses'), where('userId', 'in', [ALICE, BOB]));
  await assertSucceeds(getDocs(q));
});

test('功能｜社交：登入者仍可讀其他使用者的 users 文件、送好友邀請', async () => {
  const db = as(BOB);
  await assertSucceeds(getDoc(doc(db, 'users', ALICE)));
  await assertSucceeds(addDoc(collection(db, 'friendRequests'), { from: { userId: BOB }, to: ALICE }));
});

// ─────────────────────────── 攻擊：必須被擋下 ───────────────────────────

for (const col of PERSONAL) {
  test(`攻擊｜${col}：別人不能讀取我的文件`, async () => {
    await assertFails(getDoc(doc(as(BOB), col, 'alice-1')));
  });

  test(`攻擊｜${col}：別人不能查詢 userId == 我`, async () => {
    const q = query(collection(as(BOB), col), where('userId', '==', ALICE));
    await assertFails(getDocs(q));
  });

  test(`攻擊｜${col}：別人不能不加條件列出整個 collection`, async () => {
    await assertFails(getDocs(collection(as(BOB), col)));
  });

  test(`攻擊｜${col}：別人不能修改或刪除我的文件`, async () => {
    const ref = doc(as(BOB), col, 'alice-1');
    await assertFails(updateDoc(ref, { amount: 0 }));
    await assertFails(deleteDoc(ref));
  });

  test(`攻擊｜${col}：不能用別人的 userId 建立文件`, async () => {
    await assertFails(addDoc(collection(as(BOB), col), { userId: ALICE, amount: 1 }));
  });

  test(`攻擊｜${col}：不能把自己的文件 userId 改成別人`, async () => {
    await assertFails(updateDoc(doc(as(ALICE), col, 'alice-1'), { userId: BOB }));
  });
}

test('攻擊｜支出：別人不能修改或刪除我的支出', async () => {
  const ref = doc(as(BOB), 'expenses', 'alice-1');
  await assertFails(updateDoc(ref, { amount: 0 }));
  await assertFails(deleteDoc(ref));
});

test('攻擊｜支出：不能用別人的 userId 建立支出', async () => {
  await assertFails(addDoc(collection(as(BOB), 'expenses'), { userId: ALICE, amount: 999999 }));
});

test('攻擊｜支出：不能把自己的支出轉給別人', async () => {
  await assertFails(updateDoc(doc(as(ALICE), 'expenses', 'alice-1'), { userId: BOB }));
});

test('攻擊｜預算：別人不能讀寫我的預算', async () => {
  const ref = doc(as(BOB), 'budgets', ALICE);
  await assertFails(getDoc(ref));
  await assertFails(setDoc(ref, { monthly: 0 }));
});

test('攻擊｜類別：別人不能讀我的自訂類別，也不能建立 default 類別', async () => {
  await assertFails(getDoc(doc(as(BOB), 'categories', 'alice-cat')));
  await assertFails(addDoc(collection(as(BOB), 'categories'), { userId: 'default', name: '惡意' }));
});

test('攻擊｜未登入：什麼都讀不到、寫不進', async () => {
  const db = anon();
  for (const col of [...PERSONAL, 'expenses', 'users', 'expenseGroups']) {
    await assertFails(getDoc(doc(db, col, 'alice-1')));
    await assertFails(addDoc(collection(db, col), { userId: ALICE }));
  }
  await assertFails(getDoc(doc(db, 'budgets', ALICE)));
});

test('攻擊｜沒有列在規則裡的 collection 一律拒絕（不再有全域萬用規則）', async () => {
  const db = as(ALICE);
  await assertFails(getDoc(doc(db, 'anythingElse', 'x')));
  await assertFails(setDoc(doc(db, 'anythingElse', 'x'), { a: 1 }));
});
