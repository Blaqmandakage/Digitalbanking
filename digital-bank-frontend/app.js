// Digital Bank Frontend

const API_BASE = "https://digital-bank-kvhc.onrender.com";

const S = {
  type: localStorage.getItem("db_type"),
  token: localStorage.getItem("db_token"),
  user: (() => {
    try { return JSON.parse(localStorage.getItem("db_user") || "null"); }
    catch { return null; }
  })(),
};

const $ = (s) => document.querySelector(s);

const $$ = (s) => [...document.querySelectorAll(s)];

function toast(m, e = false, duration = 3500) {
  const t = $("#toast");

  t.textContent = m;

  t.className = "toast show" + (e ? " error" : "");

  clearTimeout(window.tt);

  window.tt = setTimeout(() => t.classList.remove("show"), duration);
}

function headers() {
  return S.token ? { Authorization: `Bearer ${S.token}` } : {};
}

function esc(v) {
  return String(v ?? "—").replace(
    /[&<>'"]/g,
    (x) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "'": "&#39;",
        '"': "&quot;",
      })[x],
  );
}

function money(v) {
  return Number.isFinite(Number(v))
    ? "₦ " +
        Number(v).toLocaleString("en-NG", {
          minimumFractionDigits: 2,
        })
    : "—";
}

async function api(path, o = {}) {
  const x = {
    ...o,
    headers: {
      ...(o.headers || {}),
    },
  };

  if (o.body && typeof o.body !== "string") {
    x.headers["Content-Type"] = "application/json";
    x.body = JSON.stringify(o.body);
  }

  const r = await fetch(API_BASE + path, x);

  let d = {};

  try {
    d = await r.json();
  } catch {}

  if (!r.ok) {
    throw Error(
      typeof d.message === "string"
        ? d.message
        : d.error?.message || d.error || `Request failed (${r.status})`,
    );
  }

  return d;
}

function modal(id, open = true) {
  $(`#${id}`)?.classList.toggle("open", open);
}

function save(type, token, user) {
  S.type = type;
  S.token = token;
  S.user = user;

  localStorage.setItem("db_type", type);
  localStorage.setItem("db_token", token);
  localStorage.setItem("db_user", JSON.stringify(user));
}

function clear() {
  S.type = S.token = null;
  S.user = null;

  localStorage.removeItem("db_type");
  localStorage.removeItem("db_token");
  localStorage.removeItem("db_user");
}

function view(id) {
  $$(".view").forEach((x) => x.classList.remove("active"));

  $(`#${id}`)?.classList.add("active");

  const on = !!S.token;

  $("#publicNav").classList.toggle("hidden", on);
  $("#sessionNav").classList.toggle("hidden", !on);

  if (on) {
    $("#sessionName").textContent =
      `${S.user?.firstName || ""} ${S.user?.lastName || ""}`.trim();
  }

  updateMobileSessionUI();
  if (!on) updateMobileNavigationState("landing");
  scrollTo(0, 0);
}

function panel(id) {
  const root = S.type === "customer" ? "#customer" : "#staff";

  $(`${root} .panel.active`)?.classList.remove("active");

  $(`#${id}`)?.classList.add("active");

  $$(`${root} .sideLink`).forEach((x) =>
    x.classList.toggle("active", x.dataset.panel === id),
  );
}

function table(el, cols, rows, empty = "No records found.") {
  if (!rows?.length) {
    $(el).innerHTML = `<div class="empty">${empty}</div>`;
    return;
  }

  $(el).innerHTML = `
    <div class="tableWrap">
      <table class="table">
        <thead>
          <tr>
            ${cols.map((c) => `<th>${c.l}</th>`).join("")}
          </tr>
        </thead>

        <tbody>
          ${rows
            .map(
              (r) => `
                <tr>
                  ${cols
                    .map(
                      (c) =>
                        `<td>${c.f ? c.f(r) : esc(r[c.k])}</td>`,
                    )
                    .join("")}
                </tr>
              `,
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

async function customerDash() {
  view("customer");

  $("#cgreet").textContent = `Welcome back, ${
    S.user?.firstName || "there"
  }`;

  await Promise.allSettled([
    accounts(),
    transactions(),
    profile(),
  ]);

  syncMobileProfileHistory();
}

async function accounts() {
  try {
    const d = await api("/bank/my-accounts", {
      headers: headers(),
    });

    const a = d.data || [];

    $("#mAccounts").textContent = d.count ?? a.length;

    renderCustomerAccounts(a);

    await loadCustomerBalances(a);
  } catch (e) {
    $("#accounts").innerHTML =
      `<div class="empty">${esc(e.message)}</div>`;
  }
}

function renderCustomerAccounts(a) {
  if (!a.length) {
    $("#accounts").innerHTML =
      '<div class="empty">No bank accounts yet. Complete BVN verification and create an account.</div>';

    return;
  }

  $("#accounts").innerHTML = a
    .map(
      (r, i) => `
        <article class="accountCard">
          <div>
            <span class="eyebrow">
              BANK ACCOUNT ${i + 1}
            </span>

            <h3>
              ${esc(r.accountName)}
            </h3>

            <p class="accountNumber">
              ${esc(r.accountNumber)}
            </p>

            <small>
              ${esc(r.bankName || "Digital Bank")}
              ·
              ${esc(r.kycType || "KYC")}
            </small>
          </div>

          <div
            class="accountBalance"
            data-balance-account="${esc(r.accountNumber)}"
          >
            <span>
              Available balance
            </span>

            <strong>
              Loading…
            </strong>
          </div>
        </article>
      `,
    )
    .join("");
}

async function loadCustomerBalances(a) {
  let total = 0;
  let firstAccount = "";

  await Promise.all(
    a.map(async (r) => {
      const el = $(
        `[data-balance-account="${CSS.escape(r.accountNumber)}"] strong`,
      );
      if (!firstAccount) firstAccount = r.accountNumber || "";

      try {
        const d = await api("/bank/account-balance", {
          method: "POST",
          headers: headers(),
          body: { accountNumber: r.accountNumber },
        });

        const b =
          d.data?.balance ??
          d.data?.availableBalance ??
          d.data?.accountBalance ??
          d.data?.amount ??
          d.balance ??
          d.availableBalance ??
          d.accountBalance ??
          d.amount;

        const numericBalance = Number(b);
        if (Number.isFinite(numericBalance)) total += numericBalance;
        if (el) el.textContent = money(b);
      } catch (error) {
        console.error(`Failed to load balance for ${r.accountNumber}:`, error);
        if (el) el.textContent = "Unavailable";
      }
    }),
  );

  updateMobileBalanceHero(a.length ? total : null, firstAccount);
}

async function transactions() {
  try {
    const d = await api("/customers/transactions", {
      headers: headers(),
    });

    const list = d.data || [];

    const accountsResponse = await api("/bank/my-accounts", {
      headers: headers(),
    });

    const myAccounts = accountsResponse.data || [];

    const myAccountNumbers = new Set(
      myAccounts.map((a) => String(a.accountNumber)),
    );

    $("#mTransactions").textContent =
      d.count ?? list.length;

    renderCustomerTransactions(
      "#transactions",
      list,
      myAccountNumbers,
    );

    renderCustomerTransactions(
      "#recent",
      list.slice(0, 5),
      myAccountNumbers,
    );

    if (isMobileViewport() && $("#c-profile")?.classList.contains("active")) {
      syncMobileProfileHistory();
    }
  } catch (e) {
    $("#transactions").innerHTML =
      `<div class="empty">${esc(e.message)}</div>`;
  }
}

function renderCustomerTransactions(
  selector,
  list,
  myAccountNumbers,
) {
  if (!list.length) {
    $(selector).innerHTML =
      '<div class="empty">No transactions yet.</div>';

    return;
  }

  $(selector).innerHTML = `
    <div class="transactionList">
      ${list
        .map((r) => {
          const senderNo =
            r.senderAccount?.accountNumber || "";

          const receiverNo =
            r.receiverAccount?.accountNumber ||
            r.recipientAccountNumber ||
            "";

          const sent = myAccountNumbers.has(
            String(senderNo),
          );

          const received = myAccountNumbers.has(
            String(receiverNo),
          );

          const direction = sent
            ? "sent"
            : received
              ? "received"
              : "transaction";

          const sign = sent
            ? "-"
            : received
              ? "+"
              : "";

          const amountClass = sent
            ? "moneySent"
            : received
              ? "moneyReceived"
              : "";

          const otherName = sent
            ? (
                r.recipientName ||
                r.receiverAccount?.accountName ||
                receiverNo ||
                "Recipient"
              )
            : (
                r.senderAccount?.accountName ||
                senderNo ||
                "Sender"
              );

          const directionText = sent
            ? "Money sent"
            : received
              ? "Money received"
              : "Transfer";

          const recipientBank = sent
            ? (r.recipientBankName || r.receiverAccount?.bankName || "")
            : "";

          const transferTypeLabel =
            r.transferType === "inter_bank"
              ? "Inter-bank"
              : "Intra-bank";

          const statusClass =
            String(r.status || "").toLowerCase() ===
            "successful"
              ? "statusSuccess"
              : String(r.status || "").toLowerCase() ===
                  "pending"
                ? "statusPending"
                : "statusFailed";

          return `
            <article class="transactionItem ${direction}">
              <div class="txIcon">
                ${sent ? "↑" : received ? "↓" : "↔"}
              </div>

              <div class="txMain">
                <div class="txTitle">
                  <div>
                    <b>${esc(otherName)}</b>
                    <span>${esc(directionText)} · ${esc(transferTypeLabel)}</span>
                    ${recipientBank ? `<small class="txRecipientBank">${esc(recipientBank)}</small>` : ""}
                  </div>

                  <strong class="${amountClass}">
                    ${sign}${money(r.amount)}
                  </strong>
                </div>

                <div class="txMeta">
                  <span>
                    ${esc(r.reference || r._id || "—")}
                  </span>

                  <span class="${statusClass}">
                    ${esc(r.status || "—")}
                  </span>

                  <span>
                    ${
                      r.createdAt
                        ? new Date(
                            r.createdAt,
                          ).toLocaleString()
                        : "—"
                    }
                  </span>
                </div>
              </div>
            </article>
          `;
        })
        .join("")}
    </div>
  `;
}

async function profile() {
  try {
    const d = await api("/customers/profile", {
      headers: headers(),
    });

    const c = d.customer || {};

    S.user = {
      ...S.user,
      ...c,
    };

    localStorage.setItem(
      "db_user",
      JSON.stringify(S.user),
    );

    $("#mVerified").textContent =
      S.user.isVerified
        ? "Verified"
        : "Pending";

    $("#profile").innerHTML = `
      <p>
        <b>Name:</b>
        ${esc(c.firstName)}
        ${esc(c.lastName)}
      </p>

      <p>
        <b>Email:</b>
        ${esc(c.email)}
      </p>

      <p>
        <b>Phone:</b>
        ${esc(c.phone)}
      </p>

      <p>
        <b>Verification:</b>
        ${
          S.user.isVerified
            ? "Verified"
            : "Pending"
        }
      </p>
    `;
  } catch {}
}

function staffDash() {
  view("staff");

  const r = S.user?.role || "staff";

  $("#sgreet").textContent =
    `Welcome, ${S.user?.firstName || "staff"}`;

  $("#roleLabel").textContent =
    `${r.replace("_", " ")} DASHBOARD`;

  $("#roleMetric").textContent =
    r.replace("_", " ");

  $$(".management").forEach((x) =>
    x.classList.toggle(
      "hidden",
      !["admin", "super_admin"].includes(r),
    ),
  );

  $$(".super").forEach((x) =>
    x.classList.toggle(
      "hidden",
      r !== "super_admin",
    ),
  );

  loadCustomers();
}

async function login(form, type) {
  const body = Object.fromEntries(
    new FormData(form),
  );

  const d = await api(
    type === "customer"
      ? "/customers/login"
      : "/staff/login",
    {
      method: "POST",
      body,
    },
  );

  if (type === "customer") {
    save("customer", d.token, d.customer);
  } else {
    save(
      "staff",
      d.data.token,
      d.data.staff,
    );
  }

  modal("login", false);

  form.reset();

  toast("Login successful.", false, 1500);
  $("#toast")?.classList.add("login-success-toast");

  type === "customer"
    ? customerDash()
    : staffDash();
}

async function register() {
  const f = $("#registerForm");

  const d = await api("/customers/register", {
    method: "POST",
    body: Object.fromEntries(
      new FormData(f),
    ),
  });

  modal("register", false);

  f.reset();

  toast(
    d.message ||
      "Registration successful.",
  );

  modal("login");

  $$(".tab").forEach((x) =>
    x.classList.toggle(
      "active",
      x.dataset.type === "customer",
    ),
  );

  $("#customerLogin").classList.remove(
    "hidden",
  );

  $("#staffLogin").classList.add(
    "hidden",
  );
}

async function runForm(
  id,
  path,
  headersOn = true,
  after,
) {
  const f = $(id);

  const d = await api(path, {
    method: "POST",
    headers: headersOn ? headers() : {},
    body: Object.fromEntries(
      new FormData(f),
    ),
  });

  toast(
    d.message ||
      "Request successful.",
  );

  f.reset();

  if (after) {
    after(d);
  }
}

async function loadCustomers() {
  if (!S.token || S.type !== "staff") return;

  try {
    const d = await api(
      "/staff/customers",
      {
        headers: headers(),
      },
    );

    const customers =
      Array.isArray(d.data)
        ? d.data
        : [];

    $("#customerCount").textContent =
      d.count ?? customers.length;

    table(
      "#staffCustomers",
      [
        {
          l: "Customer",
          f: (r) => `
            <div class="person">
              <b>
                ${esc(r.firstName)}
                ${esc(r.lastName)}
              </b>

              <small>
                ${esc(r.email)}
              </small>
            </div>
          `,
        },

        {
          l: "Phone",
          k: "phone",
        },

        {
          l: "KYC",
          f: (r) =>
            r.isVerified
              ? '<span class="badge">Verified</span>'
              : '<span class="badge mutedBadge">Pending</span>',
        },

        {
          l: "Status",
          f: (r) =>
            r.isActive === false
              ? '<span class="statusDot inactive">Inactive</span>'
              : '<span class="statusDot active">Active</span>',
        },

        {
          l: "Balance",
          f: (r) => `
            <div
              class="balanceCell"
              data-balance-customer="${esc(
                r._id || r.id,
              )}"
            >
              <span class="balanceLoading">
                Loading…
              </span>

              <button
                type="button"
                class="btn tiny outline balanceBtn"
                data-customer="${esc(
                  r._id || r.id,
                )}"
              >
                View details
              </button>
            </div>
          `,
        },

        {
          l: "Actions",
          f: (r) => {
            const id = r._id || r.id;

            const currentRole =
              S.user?.role || "staff";

            if (
              currentRole !==
              "super_admin"
            ) {
              return '<span class="muted">View only</span>';
            }

            const isActive =
              r.isActive !== false;

            return `
              <div class="customerActions">

                <button
                  type="button"
                  class="btn tiny ${
                    isActive
                      ? "dangerOutline"
                      : "successOutline"
                  }"
                  data-customer-action="status"
                  data-customer-id="${esc(id)}"
                  data-active="${
                    isActive
                      ? "false"
                      : "true"
                  }"
                >
                  ${
                    isActive
                      ? "Deactivate"
                      : "Activate"
                  }
                </button>

                <button
                  type="button"
                  class="btn tiny danger"
                  data-customer-action="delete"
                  data-customer-id="${esc(id)}"
                  data-customer-name="${esc(
                    `${
                      r.firstName || ""
                    } ${
                      r.lastName || ""
                    }`.trim() ||
                      "this customer",
                  )}"
                >
                  Delete
                </button>

              </div>
            `;
          },
        },
      ],
      customers,
    );

    await Promise.all(
      customers.map(loadCustomerBalance),
    );
  } catch (e) {
    toast(e.message, true);
  }
}

async function getStaffCustomerAccounts(
  customerId,
) {
  const d = await api(
    `/staff/customers/${encodeURIComponent(
      customerId,
    )}/accounts`,
    {
      headers: headers(),
    },
  );

  return Array.isArray(d.data)
    ? d.data
    : [];
}

function extractStaffBalanceRows(response) {
  const rows = Array.isArray(response?.data)
    ? response.data
    : Array.isArray(
        response?.data?.accounts,
      )
      ? response.data.accounts
      : [];

  return rows.map((item) => ({
    account: item?.account || item,

    balance:
      item?.balance?.balance ??
      item?.balance?.availableBalance ??
      item?.balance?.accountBalance ??
      item?.balance?.amount ??
      item?.balance ??
      item?.account?.balance ??
      0,
  }));
}

async function getAccurateStaffBalances(
  customerId,
  localAccounts,
) {
  try {
    const response = await api(
      `/staff/customers/${encodeURIComponent(
        customerId,
      )}/balance`,
      {
        headers: headers(),
      },
    );

    const rows =
      extractStaffBalanceRows(response);

    if (rows.length) return rows;
  } catch (error) {
    console.warn(
      "Live staff balance unavailable; using local account balance:",
      error.message,
    );
  }

  return localAccounts.map((account) => ({
    account,
    balance: accountBalanceValue(account),
  }));
}

function accountBalanceValue(account) {
  const value =
    account?.balance?.balance ??
    account?.balance?.availableBalance ??
    account?.balance?.accountBalance ??
    account?.balance?.amount ??
    account?.balance ??
    0;

  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : 0;
}

async function loadCustomerBalance(c) {
  const id = c._id || c.id;

  const cell = $(
    `[data-balance-customer="${CSS.escape(
      String(id),
    )}"]`,
  );

  if (!cell) return;

  try {
    const accounts =
      await getStaffCustomerAccounts(id);

    if (!accounts.length) {
      cell.innerHTML = `
        <span class="muted balanceEmpty">
          No account
        </span>

        <button
          type="button"
          class="btn tiny outline balanceBtn"
          data-customer="${esc(id)}"
        >
          View details
        </button>
      `;

      return;
    }

    const balanceRows =
      await getAccurateStaffBalances(
        id,
        accounts,
      );

    const total =
      balanceRows.reduce(
        (sum, row) =>
          sum + Number(row.balance || 0),
        0,
      );

    cell.innerHTML = `
      <div class="balanceValueWrap">

        <strong
          class="tableBalance ${
            total > 0
              ? "positiveBalance"
              : "zeroBalance"
          }"
        >
          ${money(total)}
        </strong>

        <small>
          ${accounts.length} account${
            accounts.length === 1
              ? ""
              : "s"
          }
        </small>

      </div>

      <button
        type="button"
        class="btn tiny outline balanceBtn"
        data-customer="${esc(id)}"
      >
        View details
      </button>
    `;
  } catch (error) {
    console.error(
      `Failed to load balance for customer ${id}:`,
      error,
    );

    cell.innerHTML = `
      <span class="muted balanceEmpty">
        No account
      </span>

      <button
        type="button"
        class="btn tiny outline balanceBtn"
        data-customer="${esc(id)}"
      >
        View details
      </button>
    `;
  }
}

async function customerBalanceModal(
  customerId,
) {
  try {
    const accounts =
      await getStaffCustomerAccounts(
        customerId,
      );

    if (!accounts.length) {
      $("#customerBalanceTitle").textContent =
        "Customer balance";

      $("#customerBalanceList").innerHTML = `
        <div class="balanceEmptyCard">
          <div class="balanceEmptyIcon">
            ₦
          </div>

          <h3>
            No bank account linked
          </h3>

          <p>
            This customer does not currently
            have a bank account stored in the
            digital bank.
          </p>
        </div>
      `;

      modal("customerBalance");

      return;
    }

    const balanceRows =
      await getAccurateStaffBalances(
        customerId,
        accounts,
      );

    const firstAccount = accounts[0];

    const customerName =
      firstAccount.accountName ||
      "Customer balance";

    const total =
      balanceRows.reduce(
        (sum, row) =>
          sum + Number(row.balance || 0),
        0,
      );

    $("#customerBalanceTitle").textContent =
      customerName;

    $("#customerBalanceList").innerHTML = `
      <div class="balanceHeroCard">
        <div>

          <span>
            AVAILABLE BALANCE
          </span>

          <strong>
            ${money(total)}
          </strong>

          <small>
            ${accounts.length}
            linked account${
              accounts.length === 1
                ? ""
                : "s"
            }
          </small>

        </div>

        <div class="balanceHeroIcon">
          ₦
        </div>
      </div>

      <div class="balanceAccountList">

        ${balanceRows
          .map(
            (row) => `
              <article class="balanceAccountCard">

                <div>

                  <span class="eyebrow">
                    BANK ACCOUNT
                  </span>

                  <h3>
                    ${esc(
                      row.account.accountName ||
                        firstAccount.accountName ||
                        "Account",
                    )}
                  </h3>

                  <p>
                    ${esc(
                      row.account.accountNumber ||
                        "—",
                    )}
                  </p>

                </div>

                <div class="balanceAccountAmount">

                  <small>
                    Balance
                  </small>

                  <strong>
                    ${money(row.balance)}
                  </strong>

                </div>

              </article>
            `,
          )
          .join("")}

      </div>
    `;

    modal("customerBalance");
  } catch (e) {
    toast(
      e.message ||
        "Unable to load customer balance",
      true,
    );
  }
}

async function renderStaffTransaction(d) {
  const t = d.data || d;

  const sender = t.senderAccount || {};

  const receiver = t.receiverAccount || {};

  const status =
    String(t.status || "").toLowerCase();

  const statusClass =
    status === "successful"
      ? "statusSuccess"
      : status === "pending"
        ? "statusPending"
        : "statusFailed";

  $("#staffTxResult").innerHTML = `
    <article class="transactionDetails">

      <div class="transactionDetailsHead">

        <div>
          <span class="eyebrow">
            TRANSACTION DETAILS
          </span>

          <h3>
            ${esc(t.type || "Transfer")}
          </h3>
        </div>

        <span class="statusPill ${statusClass}">
          ${esc(t.status || "Unknown")}
        </span>

      </div>

      <div class="txAmountBox">

        <small>
          Transaction amount
        </small>

        <strong>
          ${money(t.amount)}
        </strong>

      </div>

      <div class="txDetailGrid">

        <div>
          <small>Reference</small>
          <b>${esc(t.reference || "—")}</b>
        </div>

        <div>
          <small>Transaction ID</small>
          <b>${esc(t._id || "—")}</b>
        </div>

        <div>
          <small>From</small>

          <b>
            ${esc(
              sender.accountName || "—",
            )}
          </b>

          <span>
            ${esc(
              sender.accountNumber || "—",
            )}
          </span>
        </div>

        <div>
          <small>To</small>

          <b>
            ${esc(
              receiver.accountName || "—",
            )}
          </b>

          <span>
            ${esc(
              receiver.accountNumber || "—",
            )}
          </span>
        </div>

        <div>
          <small>Date</small>

          <b>
            ${
              t.createdAt
                ? new Date(
                    t.createdAt,
                  ).toLocaleString()
                : "—"
            }
          </b>
        </div>

        <div>
          <small>Description</small>

          <b>
            ${esc(
              t.description || "Transfer",
            )}
          </b>
        </div>

      </div>

    </article>
  `;
}

async function loadStaffList() {
  try {
    const d = await api("/staff/", {
      headers: headers(),
    });

    const staff = d.data || [];

    const currentRole =
      S.user?.role || "staff";

    if (!staff.length) {
      $("#staffTable").innerHTML =
        '<div class="empty">No staff accounts found.</div>';

      return;
    }

    $("#staffTable").innerHTML = `
      <div class="tableWrap">

        <table class="table staffManagementTable">

          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Department</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>

          <tbody>

            ${staff
              .map((r) => {
                const id = r._id || r.id;

                const isSelf =
                  String(id) ===
                  String(S.user?.id || "");

                const isSuperAdmin =
                  r.role === "super_admin";

                const canManage =
                  !isSelf &&
                  !isSuperAdmin &&
                  (
                    currentRole === "super_admin" ||
                    (
                      currentRole === "admin" &&
                      r.role === "staff"
                    )
                  );

                return `
                  <tr>

                    <td>
                      <div class="person">

                        <b>
                          ${esc(r.firstName)}
                          ${esc(r.lastName)}
                        </b>

                        <small>
                          ${esc(r.phone || "")}
                        </small>

                      </div>
                    </td>

                    <td>
                      ${esc(r.email)}
                    </td>

                    <td>
                      <span class="badge ${
                        r.role === "admin"
                          ? "gold"
                          : ""
                      }">
                        ${esc(r.role)}
                      </span>
                    </td>

                    <td>
                      ${esc(
                        r.department || "—",
                      )}
                    </td>

                    <td>
                      <span
                        class="statusDot ${
                          r.isActive
                            ? "active"
                            : "inactive"
                        }"
                      >
                        ${
                          r.isActive
                            ? "Active"
                            : "Inactive"
                        }
                      </span>
                    </td>

                    <td>

                      ${
                        canManage
                          ? `
                            <div class="staffActions">

                              <button
                                class="btn tiny ${
                                  r.isActive
                                    ? "dangerOutline"
                                    : "successOutline"
                                }"
                                data-staff-action="status"
                                data-staff-id="${esc(id)}"
                                data-active="${
                                  r.isActive
                                    ? "false"
                                    : "true"
                                }"
                              >
                                ${
                                  r.isActive
                                    ? "Deactivate"
                                    : "Activate"
                                }
                              </button>

                              <button
                                class="btn tiny danger"
                                data-staff-action="delete"
                                data-staff-id="${esc(id)}"
                                data-staff-name="${esc(
                                  `${r.firstName} ${r.lastName}`,
                                )}"
                              >
                                Delete
                              </button>

                            </div>
                          `
                          : '<span class="muted">Protected</span>'
                      }

                    </td>

                  </tr>
                `;
              })
              .join("")}

          </tbody>

        </table>

      </div>
    `;
  } catch (e) {
    toast(e.message, true);
  }
}

async function changeStaffStatus(
  staffId,
  isActive,
) {
  const d = await api(
    `/staff/${encodeURIComponent(
      staffId,
    )}/status`,
    {
      method: "PATCH",
      headers: headers(),
      body: { isActive },
    },
  );

  toast(
    d.message ||
      "Staff status updated.",
  );

  await loadStaffList();
}

async function deleteStaffAccount(
  staffId,
  staffName,
) {
  const confirmed = window.confirm(
    `Delete ${staffName}? This will permanently remove the staff account and prevent future login.`,
  );

  if (!confirmed) return;

  const d = await api(
    `/staff/${encodeURIComponent(
      staffId,
    )}`,
    {
      method: "DELETE",
      headers: headers(),
    },
  );

  toast(
    d.message ||
      "Staff deleted successfully.",
  );

  await loadStaffList();
}

async function changeCustomerStatus(
  customerId,
  isActive,
) {
  if (
    (S.user?.role || "staff") !==
    "super_admin"
  ) {
    throw new Error(
      "Only the super admin can change customer status",
    );
  }

  const d = await api(
    `/staff/customers/${encodeURIComponent(
      customerId,
    )}/status`,
    {
      method: "PATCH",
      headers: headers(),
      body: { isActive },
    },
  );

  toast(
    d.message ||
      `Customer ${
        isActive
          ? "activated"
          : "deactivated"
      } successfully.`,
  );

  await loadCustomers();
}

async function deleteCustomerAccount(
  customerId,
  customerName,
) {
  if (
    (S.user?.role || "staff") !==
    "super_admin"
  ) {
    throw new Error(
      "Only the super admin can delete customers",
    );
  }

  const confirmed = window.confirm(
    `Delete ${customerName}?\n\nThis permanently removes the customer from the digital bank and their locally stored account records. This action cannot be undone.`,
  );

  if (!confirmed) return;

  const d = await api(
    `/staff/customers/${encodeURIComponent(
      customerId,
    )}`,
    {
      method: "DELETE",
      headers: headers(),
    },
  );

  toast(
    d.message ||
      "Customer deleted successfully.",
  );

  await loadCustomers();
}

async function loadAllStaffTransactions() {
  const container =
    $("#adminTransactions");

  if (!container) return;

  container.innerHTML =
    '<div class="loadingState">Loading transaction activity…</div>';

  try {
    const customersResponse =
      await api("/staff/customers", {
        headers: headers(),
      });

    const customers =
      customersResponse.data || [];

    const results = await Promise.all(
      customers.map(async (customer) => {
        try {
          const d = await api(
            `/staff/customers/${encodeURIComponent(
              customer._id || customer.id,
            )}/transactions`,
            {
              headers: headers(),
            },
          );

          return d.data || [];
        } catch {
          return [];
        }
      }),
    );

    const map = new Map();

    results.flat().forEach((t) => {
      const key = String(
        t._id || t.reference || "",
      );

      if (key && !map.has(key)) {
        map.set(key, t);
      }
    });

    const transactions =
      [...map.values()].sort(
        (a, b) =>
          new Date(
            b.createdAt || 0,
          ) -
          new Date(
            a.createdAt || 0,
          ),
      );

    renderAdminTransactions(transactions);
  } catch (e) {
    container.innerHTML =
      `<div class="empty">${esc(
        e.message,
      )}</div>`;
  }
}

function renderAdminTransactions(list) {
  const container =
    $("#adminTransactions");

  if (!list.length) {
    container.innerHTML =
      '<div class="empty">No transaction activity found.</div>';

    return;
  }

  container.innerHTML = `
    <div class="transactionList">

      ${list
        .map((t) => {
          const status =
            String(
              t.status || "",
            ).toLowerCase();

          const statusClass =
            status === "successful"
              ? "statusSuccess"
              : status === "pending"
                ? "statusPending"
                : "statusFailed";

          const amount =
            money(t.amount);

          return `
            <article class="adminTxRow">

              <div class="adminTxPeople">

                <div class="adminTxPerson senderPerson">

                  <span class="eyebrow">
                    SENDER
                  </span>

                  <b>
                    ${esc(
                      t.senderAccount
                        ?.accountName ||
                        "Unknown sender",
                    )}
                  </b>

                  <small>
                    ${esc(
                      t.senderAccount
                        ?.accountNumber ||
                        "—",
                    )}
                  </small>

                  <strong class="moneySent">
                    -${amount}
                  </strong>

                </div>

                <div class="adminArrow">
                  →
                </div>

                <div class="adminTxPerson receiverPerson">

                  <span class="eyebrow">
                    RECEIVER
                  </span>

                  <b>
                    ${esc(
                      t.receiverAccount
                        ?.accountName ||
                        "Unknown receiver",
                    )}
                  </b>

                  <small>
                    ${esc(
                      t.receiverAccount
                        ?.accountNumber ||
                        "—",
                    )}
                  </small>

                  <strong class="moneyReceived">
                    +${amount}
                  </strong>

                </div>

              </div>

              <div class="adminTxMeta">

                <span class="${statusClass}">
                  ${esc(t.status || "—")}
                </span>

                <span>
                  ${esc(
                    t.reference ||
                      t._id ||
                      "—",
                  )}
                </span>

                <small>
                  ${
                    t.createdAt
                      ? new Date(
                          t.createdAt,
                        ).toLocaleString()
                      : "—"
                  }
                </small>

              </div>

            </article>
          `;
        })
        .join("")}

    </div>
  `;
}


/* =========================================================
   MOBILE UI HELPERS
   Presentation/navigation only; existing API behavior stays intact.
   ========================================================= */
let pendingTransfer = null;

function isMobileViewport() {
  return !!window.matchMedia && window.matchMedia("(max-width: 700px)").matches;
}

function syncMobileProfileHistory() {
  if (!isMobileViewport() || S.type !== "customer") return;

  const profileEl = $("#profile");
  const transactionsEl = $("#transactions");
  if (!profileEl || !transactionsEl) return;

  profileEl.innerHTML = `
    <div class="title">
      <h2>Transaction History</h2>
      <button
        class="btn outline small"
        type="button"
        data-mobile-history-refresh
      >
        Refresh
      </button>
    </div>
    ${transactionsEl.innerHTML}
  `;
}

function mobileMenuItems() {
  if (S.type === "staff") {
    const role = S.user?.role || "staff";
    const items = [
      ["s-overview", "⌂", "Dashboard"],
      ["s-customers", "♙", "Customers"],
      ["s-tx", "⌕", "Transactions"],
    ];
    if (["admin", "super_admin"].includes(role)) items.push(["s-staff", "⚙", "Staff management"]);
    if (role === "super_admin") items.push(["s-admin-tx", "▣", "All transactions"]);
    return items;
  }
  return [
    ["c-overview", "⌂", "Dashboard"],
    ["c-accounts", "▣", "Accounts"],
    ["c-transfer", "↑", "Transfer"],
    ["c-transactions", "↔", "Transactions"],
    ["c-profile", "●", "Profile"],
    ["c-identity", "✓", "BVN / NIN"],
    ["c-enquiry", "⌕", "Name enquiry"],
    ["c-balance", "₦", "Balance"],
  ];
}

function renderMobileNavigation() {
  const drawer = $("#mobileDrawerNav");
  const bottom = $("#mobileBottomNav");
  if (!drawer || !bottom) return;

  if (!S.token) {
    drawer.innerHTML = `
      <button type="button" data-mobile-modal="login"><span>→</span><span>Sign in</span></button>
      <button type="button" data-mobile-modal="register"><span>+</span><span>Create account</span></button>
      <button type="button" data-mobile-public="features"><span>◈</span><span>Features</span></button>
      <button type="button" data-mobile-public="security"><span>✓</span><span>Security</span></button>
    `;
    bottom.innerHTML = `
      <button class="mobileBottomItem active" type="button" data-mobile-public="landing"><span>⌂</span><span>Home</span></button>
      <button class="mobileBottomItem" type="button" data-mobile-modal="register"><span>+</span><span>Sign up</span></button>
      <button class="mobileBottomItem" type="button" data-mobile-modal="login"><span>→</span><span>Sign in</span></button>
    `;
    return;
  }

  drawer.innerHTML = mobileMenuItems().map(([id, icon, label]) =>
    `<button type="button" data-mobile-panel="${esc(id)}"><span>${icon}</span><span>${esc(label)}</span></button>`
  ).join("");

  const bottomIds = S.type === "staff"
    ? [["s-overview", "⌂", "Home"], ["s-customers", "♙", "Customers"], ["s-tx", "↔", "Activity"], ["s-staff", "⚙", "Staff"]]
    : [["c-overview", "⌂", "Home"], ["c-accounts", "▣", "Accounts"], ["c-transfer", "↑", "Transfer"], ["c-transactions", "↔", "Activity"], ["c-profile", "●", "Profile"]];

  bottom.innerHTML = bottomIds.map(([id, icon, label]) =>
    `<button class="mobileBottomItem" type="button" data-mobile-panel="${esc(id)}"><span>${icon}</span><span>${esc(label)}</span></button>`
  ).join("");

  if (S.type === "staff" && !["admin", "super_admin"].includes(S.user?.role || "staff")) {
    bottom.querySelector('[data-mobile-panel="s-staff"]')?.remove();
  }
}

function updateMobileNavigationState(panelId) {
  $$("[data-mobile-panel]").forEach((b) =>
    b.classList.toggle("active", b.dataset.mobilePanel === panelId)
  );
}

function openMobileMenu() {
  if (!S.token && !$("#mobileDrawerNav")?.children.length) renderMobileNavigation();
  $("#mobileDrawer")?.classList.add("open");
  $("#mobileBackdrop")?.classList.add("open");
  $("#mobileDrawer")?.setAttribute("aria-hidden", "false");
  $("#mobileBackdrop")?.setAttribute("aria-hidden", "false");
  $("#mobileMenuButton")?.setAttribute("aria-expanded", "true");
  document.body.classList.add("mobileMenuOpen");
}

function closeMobileMenu() {
  $("#mobileDrawer")?.classList.remove("open");
  $("#mobileBackdrop")?.classList.remove("open");
  $("#mobileDrawer")?.setAttribute("aria-hidden", "true");
  $("#mobileBackdrop")?.setAttribute("aria-hidden", "true");
  $("#mobileMenuButton")?.setAttribute("aria-expanded", "false");
  document.body.classList.remove("mobileMenuOpen");
}

function syncMobileTheme() {
  const dark = document.body.classList.contains("dark");
  if ($("#mobileThemeState")) $("#mobileThemeState").textContent = dark ? "On" : "Off";
}

function updateMobileSessionUI() {
  renderMobileNavigation();
  if ($("#mobileDrawerUser")) {
    const name = `${S.user?.firstName || ""} ${S.user?.lastName || ""}`.trim();
    $("#mobileDrawerUser").textContent = name || (S.type === "staff" ? "Staff portal" : "Welcome");
  }
  $("#mobileProfileButton")?.setAttribute("aria-label", S.token ? "Open profile" : "Open sign in menu");

  const authAction = $("#mobileLogoutButton");
  const authActionIcon = $("#mobileAuthActionIcon");
  const authActionLabel = $("#mobileAuthActionLabel");
  if (authAction && authActionIcon && authActionLabel) {
    authAction.classList.toggle("logoutItem", !!S.token);
    authActionIcon.textContent = S.token ? "↪" : "→";
    authActionLabel.textContent = S.token ? "Logout" : "Sign in";
  }

  syncMobileTheme();
}

async function mobileNavigate(panelId) {
  if (!S.token) return;
  panel(panelId);
  updateMobileNavigationState(panelId);
  closeMobileMenu();
  if (panelId === "s-customers") await loadCustomers();
  if (panelId === "s-staff") await loadStaffList();
  if (panelId === "s-admin-tx") await loadAllStaffTransactions();
  if (panelId === "c-transactions") await transactions();
  if (panelId === "c-accounts") await accounts();
  if (panelId === "c-profile") {
    await transactions();
    syncMobileProfileHistory();
  }
}

function mobileProfile() {
  if (S.type === "customer") mobileNavigate("c-profile");
  else mobileNavigate("s-overview");
}

let mobileBalanceAmount = null;
let mobileBalanceAccount = "";
let mobileBalanceVisible = false;

function maskAccountNumber(value) {
  const raw = String(value || "").replace(/\s+/g, "");
  if (!raw) return "Account ••••";
  return `Account ••••${raw.slice(-4)}`;
}

function updateMobileBalanceHero(amount, accountNumber) {
  const value = $("#mobileBalanceValue");
  const account = $("#mobileBalanceAccount");
  if (!value || !account) return;
  mobileBalanceAmount = Number.isFinite(Number(amount)) ? Number(amount) : null;
  mobileBalanceAccount = accountNumber || mobileBalanceAccount;
  value.textContent = mobileBalanceVisible && mobileBalanceAmount !== null ? money(mobileBalanceAmount) : "₦ ••••••";
  value.dataset.visible = mobileBalanceVisible ? "true" : "false";
  account.textContent = maskAccountNumber(mobileBalanceAccount);
}

function toggleMobileBalance() {
  mobileBalanceVisible = !mobileBalanceVisible;
  const value = $("#mobileBalanceValue");
  if (value) value.textContent = mobileBalanceVisible && mobileBalanceAmount !== null ? money(mobileBalanceAmount) : "₦ ••••••";
  $("#mobileBalanceToggle")?.setAttribute("aria-label", mobileBalanceVisible ? "Hide balance" : "Show balance");
}

async function startTransferConfirmation(form) {
  const data = Object.fromEntries(new FormData(form));
  const amount = Number(data.amount);
  const transferType = data.transferType || "intra_bank";

  if (!data.from || !data.to || !Number.isFinite(amount) || amount <= 0) {
    toast("Enter a valid transfer amount and account details", true);
    return;
  }

  if (transferType === "inter_bank" && !data.recipientBankCode) {
    toast("Enter the recipient bank code", true);
    return;
  }

  const submitButton = form.querySelector("button[type=submit]");
  if (submitButton) submitButton.disabled = true;

  try {
    let recipientName = data.recipientName || "";

    // Verify the recipient before showing the final confirmation.
    // The backend handles the NIBSS token internally.
    const enquiry = await api("/bank/name-enquiry", {
      method: "POST",
      headers: headers(),
      body: { accountNo: data.to },
    });

    const raw = enquiry?.data ?? enquiry;
    const payload =
      raw?.data && typeof raw.data === "object" && !Array.isArray(raw.data)
        ? raw.data
        : raw;

    recipientName =
      payload?.accountName ||
      payload?.accountNameEnquiry ||
      payload?.name ||
      payload?.account?.accountName ||
      recipientName;

    if (!recipientName) {
      toast("Unable to verify the recipient account", true);
      return;
    }

    data.recipientName = recipientName;

    pendingTransfer = { form, data };

    const typeLabel =
      transferType === "inter_bank" ? "Inter-bank" : "Within Digital Bank";

    const bankLabel =
      transferType === "inter_bank"
        ? (data.recipientBankName || `Bank code ${data.recipientBankCode}`)
        : "Digital Bank";

    $("#confirmTransferType").textContent = typeLabel;
    $("#confirmRecipient").textContent = recipientName;
    $("#confirmBank").textContent = bankLabel;
    $("#confirmAccount").textContent = data.to;
    $("#confirmAmount").textContent = money(amount);
    $("#confirmFee").textContent = money(0);
    $("#confirmTotal").textContent = money(amount);

    modal("transferConfirm", true);
  } catch (e) {
    toast(e.message || "Unable to verify the recipient", true);
  } finally {
    if (submitButton) submitButton.disabled = false;
  }
}

async function completeConfirmedTransfer() {
  if (!pendingTransfer) return;
  const button = $("#transferConfirmButton");
  if (button) button.disabled = true;
  try {
    const d = await api("/bank/transfer", {
      method: "POST",
      headers: headers(),
      body: pendingTransfer.data,
    });
    pendingTransfer.form.reset();
    syncTransferTypeFields();
    modal("transferConfirm", false);
    $("#transferResult")?.classList.remove("hidden");
    if ($("#transferResult")) {
      const transferType =
        d.data?.transferType === "inter_bank" ? "Inter-bank" : "Intra-bank";
      const recipient = d.data?.recipient?.accountName || pendingTransfer.data.recipientName || "—";
      $("#transferResult").innerHTML =
        `<b>${esc(d.message || "Transfer successful")}</b><br>` +
        `Type: ${esc(transferType)}<br>` +
        `Recipient: ${esc(recipient)}<br>` +
        `Reference: ${esc(d.data?.transaction?.reference || d.data?.nibss?.transactionId || "—")}`;
    }
    toast(d.message || "Transfer successful.");
    pendingTransfer = null;
    await transactions();
  } catch (e) {
    toast(e.message || "Transfer failed. Please try again.", true);
  } finally {
    if (button) button.disabled = false;
  }
}

function syncTransferTypeFields() {
  const select = $("#transferType");
  const fields = $("#interBankFields");
  const code = $("#recipientBankCode");
  const name = $("#recipientBankName");
  if (!select || !fields) return;

  const interBank = select.value === "inter_bank";
  fields.classList.toggle("hidden", !interBank);

  if (code) {
    code.required = interBank;
    if (!interBank) code.value = "";
  }
  if (name && !interBank) name.value = "";
}

async function validateStoredSession() {
  if (!S.token || !["customer", "staff"].includes(S.type)) {
    clear();
    return false;
  }
  try {
    if (S.type === "customer") {
      const d = await api("/customers/profile", { headers: headers() });
      S.user = { ...S.user, ...(d.customer || {}) };
      localStorage.setItem("db_user", JSON.stringify(S.user));
      return true;
    }
    // Staff has no dedicated profile endpoint in the existing API.
    // This existing protected endpoint is used only to validate the session.
    await api("/staff/customers", { headers: headers() });
    return true;
  } catch (e) {
    clear();
    return false;
  }
}

function wire() {
  const on = (id, event, handler) => {
    const el = $(id);

    if (el) {
      el[event] = handler;
    }
  };


  on("#mobileMenuButton", "onclick", () => {
    $("#mobileDrawer")?.classList.contains("open") ? closeMobileMenu() : openMobileMenu();
  });
  on("#mobileCloseButton", "onclick", closeMobileMenu);
  on("#mobileBackdrop", "onclick", closeMobileMenu);
  on("#mobileBalanceToggle", "onclick", toggleMobileBalance);
  on("#mobileProfileButton", "onclick", () => {
    if (S.token) mobileProfile();
    else openMobileMenu();
  });
  on("#mobileThemeButton", "onclick", () => {
    toggleTheme();
    syncMobileTheme();
  });
  on("#mobileLogoutButton", "onclick", () => {
    if (!S.token) {
      closeMobileMenu();
      modal("login");
      return;
    }

    clear();
    closeMobileMenu();
    view("landing");
    toast("Logged out.");
  });
  on("#mobileDrawerNav", "onclick", (e) => {
    const panelButton = e.target.closest("[data-mobile-panel]");
    if (panelButton) mobileNavigate(panelButton.dataset.mobilePanel);
    const modalButton = e.target.closest("[data-mobile-modal]");
    if (modalButton) { closeMobileMenu(); modal(modalButton.dataset.mobileModal); }
    const publicButton = e.target.closest("[data-mobile-public]");
    if (publicButton) { closeMobileMenu(); view("landing"); document.getElementById(publicButton.dataset.mobilePublic)?.scrollIntoView({behavior:"smooth"}); }
  });
  on("#mobileBottomNav", "onclick", (e) => {
    const b = e.target.closest("[data-mobile-panel]");
    if (b) mobileNavigate(b.dataset.mobilePanel);
    const m = e.target.closest("[data-mobile-modal]");
    if (m) modal(m.dataset.mobileModal);
    const pub = e.target.closest("[data-mobile-public]");
    if (pub) { view("landing"); document.getElementById(pub.dataset.mobilePublic)?.scrollIntoView({behavior:"smooth"}); }
  });
  on("#profile", "onclick", async (e) => {
    const refresh = e.target.closest("[data-mobile-history-refresh]");
    if (!refresh || !isMobileViewport()) return;
    refresh.disabled = true;
    try {
      await transactions();
    } catch (error) {
      toast(error.message || "Unable to refresh transaction history", true);
    } finally {
      refresh.disabled = false;
    }
  });
  on("#transferConfirmButton", "onclick", completeConfirmedTransfer);
  on("#transferCancelButton", "onclick", () => { pendingTransfer = null; modal("transferConfirm", false); });
  on("#transferConfirmClose", "onclick", () => { pendingTransfer = null; modal("transferConfirm", false); });

  $$("[data-modal]").forEach(
    (x) =>
      (x.onclick = () =>
        modal(x.dataset.modal)),
  );

  $$(".close,.backdrop").forEach(
    (x) =>
      (x.onclick = () =>
        $$(".modal.open").forEach(
          (m) => modal(m.id, false),
        )),
  );

  $$(".tab").forEach(
    (x) =>
      (x.onclick = () => {
        $$(".tab").forEach(
          (t) =>
            t.classList.remove(
              "active",
            ),
        );

        x.classList.add("active");

        $("#customerLogin")?.classList.toggle(
          "hidden",
          x.dataset.type !== "customer",
        );

        $("#staffLogin")?.classList.toggle(
          "hidden",
          x.dataset.type !== "staff",
        );
      }),
  );

  $$(".sideLink").forEach((x) => {
    x.onclick = async () => {
      const target =
        x.dataset.panel;

      panel(target);

      try {
        if (
          target === "s-customers"
        ) {
          await loadCustomers();
        }

        if (target === "s-tx") {
          $("#staffTxResult")
            ?.classList.add("hidden");
        }

        if (
          target === "s-staff"
        ) {
          await loadStaffList();
        }

        if (
          target === "s-admin-tx"
        ) {
          await loadAllStaffTransactions();
        }
      } catch (e) {
        toast(e.message, true);
      }
    };
  });

  $$("[data-go]").forEach(
    (x) =>
      (x.onclick = () =>
        panel(x.dataset.go)),
  );

  on(
    "#customerLogin",
    "onsubmit",
    (e) => {
      e.preventDefault();

      login(
        e.currentTarget,
        "customer",
      ).catch((e) =>
        toast(e.message, true),
      );
    },
  );

  on(
    "#staffLogin",
    "onsubmit",
    (e) => {
      e.preventDefault();

      login(
        e.currentTarget,
        "staff",
      ).catch((e) =>
        toast(e.message, true),
      );
    },
  );

  on(
    "#registerForm",
    "onsubmit",
    (e) => {
      e.preventDefault();

      register().catch((e) =>
        toast(e.message, true),
      );
    },
  );

  on(
    "#insertBvn",
    "onsubmit",
    (e) => {
      e.preventDefault();

      runForm(
        "#insertBvn",
        "/bank/insert-bvn",
        true,
      ).catch((e) =>
        toast(e.message, true),
      );
    },
  );

  on(
    "#validateBvn",
    "onsubmit",
    (e) => {
      e.preventDefault();

      runForm(
        "#validateBvn",
        "/bank/validate-bvn",
        true,
        () => {
          if ($("#mVerified")) {
            $("#mVerified").textContent =
              "Verified";
          }
        },
      ).catch((e) =>
        toast(e.message, true),
      );
    },
  );

  on(
    "#validateNin",
    "onsubmit",
    (e) => {
      e.preventDefault();

      runForm(
        "#validateNin",
        "/bank/validate-nin",
        true,
      ).catch((e) =>
        toast(e.message, true),
      );
    },
  );

  on(
    "#accountForm",
    "onsubmit",
    async (e) => {
      e.preventDefault();

      const form =
        e.currentTarget;

      const button =
        form.querySelector(
          "button[type=submit]",
        );

      if (button) {
        button.disabled = true;
      }

      try {
        const d = await api(
          "/bank/account",
          {
            method: "POST",
            headers: headers(),
            body: Object.fromEntries(
              new FormData(form),
            ),
          },
        );

        toast(
          d.message ||
            "Account created successfully.",
        );

        form.reset();

        modal("account", false);

        panel("c-accounts");

        await accounts();
      } catch (x) {
        toast(
          x.message ||
            "Failed to create account",
          true,
        );
      } finally {
        if (button) {
          button.disabled = false;
        }
      }
    },
  );

  on(
    "#staffTxForm",
    "onsubmit",
    async (e) => {
      e.preventDefault();

      const form =
        e.currentTarget;

      const formData =
        Object.fromEntries(
          new FormData(form),
        );

      const transactionId =
        String(
          formData.transactionId || "",
        ).trim();

      const result =
        $("#staffTxResult");

      const button =
        form.querySelector(
          "button[type=submit]",
        );

      if (!transactionId) {
        toast(
          "Enter a transaction ID or reference",
          true,
        );

        return;
      }

      if (result) {
        result.classList.remove(
          "hidden",
        );

        result.innerHTML =
          '<div class="loadingState">Finding transaction…</div>';
      }

      if (button) {
        button.disabled = true;
      }

      try {
        const d = await api(
          `/staff/transactions/${encodeURIComponent(
            transactionId,
          )}`,
          {
            method: "GET",
            headers: headers(),
          },
        );

        await renderStaffTransaction(d);

        if (result) {
          result.classList.remove(
            "hidden",
          );
        }
      } catch (error) {
        if (result) {
          result.classList.remove(
            "hidden",
          );

          result.innerHTML = `
            <article class="enquiryErrorCard">

              <div class="enquiryIcon error">
                !
              </div>

              <div class="enquiryContent">

                <div class="enquiryTop">

                  <span class="eyebrow">
                    TRANSACTION LOOKUP
                  </span>

                  <span class="statusPill statusFailed">
                    NOT FOUND
                  </span>

                </div>

                <div class="enquiryMain">

                  <h3>
                    Transaction not found
                  </h3>

                  <p class="enquiryErrorText">
                    ${esc(
                      error.message ||
                        "No transaction matched that ID or reference.",
                    )}
                  </p>

                  <p class="enquiryNote">
                    Check the transaction ID or reference and try again.
                  </p>

                </div>

              </div>

            </article>
          `;
        }
      } finally {
        if (button) {
          button.disabled = false;
        }
      }
    },
  );

  on(
    "#transferForm",
    "onsubmit",
    (e) => {
      e.preventDefault();
      startTransferConfirmation(e.currentTarget);
    },
  );

  on(
    "#transferType",
    "onchange",
    syncTransferTypeFields,
  );

  syncTransferTypeFields();

  on(
    "#enquiryForm",
    "onsubmit",
    async (e) => {
      e.preventDefault();

      const formData =
        Object.fromEntries(
          new FormData(e.currentTarget),
        );

      const result =
        $("#enquiryResult");

      const button =
        e.currentTarget.querySelector(
          "button[type=submit]",
        );

      if (result) {
        result.classList.remove(
          "hidden",
        );

        result.innerHTML =
          '<div class="loadingState">Checking account details…</div>';
      }

      if (button) {
        button.disabled = true;
      }

      try {
        const d = await api(
          "/bank/name-enquiry",
          {
            method: "POST",
            headers: headers(),
            body: formData,
          },
        );

        const raw =
          d?.data ?? d;

        const payload =
          raw?.data &&
          typeof raw.data === "object" &&
          !Array.isArray(raw.data)
            ? raw.data
            : raw;

        const accountNumber =
          payload?.accountNumber ||
          payload?.accountNo ||
          formData.accountNo ||
          "—";

        const accountName =
          payload?.accountName ||
          payload?.accountHolderName ||
          payload?.name ||
          "Account name unavailable";

        const bankName =
          payload?.bankName ||
          payload?.bank ||
          "Digital Bank";

        if (result) {
          result.innerHTML = `
            <article class="enquiryCard enquirySuccessCard">

              <div class="enquiryIcon success">
                ✓
              </div>

              <div class="enquiryContent">

                <div class="enquiryTop">

                  <div>

                    <span class="eyebrow">
                      ACCOUNT VERIFIED
                    </span>

                    <h3>
                      Recipient found
                    </h3>

                  </div>

                  <span class="statusPill statusSuccess">
                    Verified
                  </span>

                </div>

                <div class="enquiryMain">

                  <small>
                    ACCOUNT HOLDER
                  </small>

                  <strong>
                    ${esc(accountName)}
                  </strong>

                </div>

                <div class="enquiryGrid">

                  <div>
                    <small>
                      Account number
                    </small>

                    <b>
                      ${esc(accountNumber)}
                    </b>
                  </div>

                  <div>
                    <small>
                      Bank
                    </small>

                    <b>
                      ${esc(bankName)}
                    </b>
                  </div>

                </div>

                <div class="enquiryNote successNote">

                  <span>
                    ✓
                  </span>

                  <p>
                    Confirm that this recipient name is correct before sending money.
                  </p>

                </div>

              </div>

            </article>
          `;
        }
      } catch (x) {
        if (result) {
          result.innerHTML = `
            <article class="enquiryCard enquiryErrorCard">

              <div class="enquiryIcon error">
                !
              </div>

              <div class="enquiryContent">

                <div class="enquiryTop">

                  <div>
                    <span class="eyebrow">
                      ACCOUNT LOOKUP
                    </span>

                    <h3>
                      Account not found
                    </h3>
                  </div>

                  <span class="statusPill statusFailed">
                    Failed
                  </span>

                </div>

                <p class="enquiryErrorText">
                  ${esc(
                    x.message ||
                      "Unable to find this account.",
                  )}
                </p>

                <div class="enquiryNote">

                  <span>
                    i
                  </span>

                  <p>
                    Check the 10-digit account number and try again.
                  </p>

                </div>

              </div>

            </article>
          `;
        }
      } finally {
        if (button) {
          button.disabled = false;
        }
      }
    },
  );

  on(
    "#createStaff",
    "onsubmit",
    (e) => {
      e.preventDefault();

      runForm(
        "#createStaff",
        "/staff/register",
        true,
        () => panel("s-staff"),
      ).catch((e) =>
        toast(e.message, true),
      );
    },
  );

  on(
    "#createAdmin",
    "onsubmit",
    (e) => {
      e.preventDefault();

      runForm(
        "#createAdmin",
        "/staff/admins",
        true,
      ).catch((e) =>
        toast(e.message, true),
      );
    },
  );

  /*
    ==========================================
    STAFF CUSTOMER CLICK HANDLER

    Handles:
    - Activate customer
    - Deactivate customer
    - Delete customer
    - View balance details

    IMPORTANT:
    There must only be ONE onclick handler
    for #staffCustomers.
    ==========================================
  */

  on(
    "#staffCustomers",
    "onclick",
    async (e) => {

      const actionButton =
        e.target.closest(
          "[data-customer-action]",
        );

      /*
        CUSTOMER ACTIONS
        Activate / Deactivate / Delete
      */

      if (
        actionButton &&
        e.currentTarget.contains(
          actionButton,
        )
      ) {
        e.preventDefault();

        e.stopPropagation();

        const action =
          actionButton.dataset
            .customerAction;

        const customerId =
          String(
            actionButton.dataset
              .customerId || "",
          ).trim();

        if (!customerId) {
          toast(
            "Customer ID is missing",
            true,
          );

          return;
        }

        if (actionButton.disabled) {
          return;
        }

        actionButton.disabled = true;

        try {
          if (action === "status") {
            await changeCustomerStatus(
              customerId,
              actionButton.dataset
                .active === "true",
            );
          } else if (
            action === "delete"
          ) {
            await deleteCustomerAccount(
              customerId,
              actionButton.dataset
                .customerName ||
                "this customer",
            );
          }
        } catch (error) {
          toast(
            error.message ||
              "Customer action failed",
            true,
          );
        } finally {
          actionButton.disabled = false;
        }

        return;
      }

      /*
        CUSTOMER BALANCE DETAILS
      */

      const balanceButton =
        e.target.closest(
          "[data-customer]",
        );

      if (
        balanceButton &&
        e.currentTarget.contains(
          balanceButton,
        )
      ) {
        e.preventDefault();

        e.stopPropagation();

        const customerId =
          String(
            balanceButton.dataset
              .customer || "",
          ).trim();

        if (!customerId) {
          toast(
            "Customer ID is missing",
            true,
          );

          return;
        }

        try {
          await customerBalanceModal(
            customerId,
          );
        } catch (error) {
          toast(
            error.message ||
              "Unable to load customer balance",
            true,
          );
        }
      }
    },
  );

  on(
    "#staffTable",
    "onclick",
    async (e) => {
      const button =
        e.target.closest(
          "[data-staff-action]",
        );

      if (!button) return;

      const action =
        button.dataset.staffAction;

      const staffId =
        button.dataset.staffId;

      try {
        if (
          action === "status"
        ) {
          await changeStaffStatus(
            staffId,
            button.dataset.active ===
              "true",
          );
        }

        if (
          action === "delete"
        ) {
          await deleteStaffAccount(
            staffId,
            button.dataset.staffName ||
              "this staff account",
          );
        }
      } catch (x) {
        toast(
          x.message,
          true,
        );
      }
    },
  );

  on(
    "#loadAdminTransactions",
    "onclick",
    loadAllStaffTransactions,
  );

  on(
    "#cRefresh",
    "onclick",
    () => customerDash(),
  );

  on(
    "#txRefresh",
    "onclick",
    () => transactions(),
  );

  on(
    "#sRefresh",
    "onclick",
    () => staffDash(),
  );

  on(
    "#logout",
    "onclick",
    () => {
      clear();

      view("landing");

      toast("Logged out.");
    },
  );

  on(
    "#theme",
    "onclick",
    toggleTheme,
  );

  on(
    "#theme2",
    "onclick",
    toggleTheme,
  );
}

function toggleTheme() {
  document.body.classList.toggle(
    "dark",
  );

  localStorage.setItem(
    "db_theme",
    document.body.classList.contains(
      "dark",
    )
      ? "dark"
      : "light",
  );
}

async function init() {
  if (localStorage.getItem("db_theme") === "dark") {
    document.body.classList.add("dark");
  }

  // Always render the public entry point first. Protected dashboards are
  // only shown after the existing session has been validated.
  view("landing");
  wire();
  renderMobileNavigation();
  syncMobileTheme();

  if (!S.token) return;

  const valid = await validateStoredSession();
  if (!valid) {
    view("landing");
    return;
  }

  if (S.type === "customer") {
    await customerDash();
  } else {
    staffDash();
  }
}

init();