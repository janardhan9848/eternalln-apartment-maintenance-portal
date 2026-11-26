
// const API_BASE_URL =
//   import.meta.env.VITE_API_BASE_URL || "http://localhost:4000/api";

// // Common function to communicate with backend
// async function request(endpoint, options = {}) {
//   const token = sessionStorage.getItem("apartment_portal_token");

//   const response = await fetch(`${API_BASE_URL}${endpoint}`, {
//     ...options,
//     headers: {
//       "Content-Type": "application/json",
//       ...(token ? { Authorization: `Bearer ${token}` } : {}),
//       ...options.headers
//     }
//   });

//   let result;

//   try {
//     result = await response.json();
//   } catch {
//     throw new Error("Invalid response from server");
//   }

//   if (!response.ok) {
//     throw new Error(result.message || "Request failed");
//   }

//   return result;
// }

// // Complete API services
// export const api = {

//   // AUTHENTICATION
//   login: (data) =>
//     request("/auth/login", {
//       method: "POST",
//       body: JSON.stringify(data)
//     }),

//   setAuthToken: (token) =>
//     sessionStorage.setItem("apartment_portal_token", token),

//   clearAuthToken: () =>
//     sessionStorage.removeItem("apartment_portal_token"),

//   // FLATS
//   getFlats: () =>
//     request("/flats"),

//   // RESIDENTS
//   getResidents: () =>
//     request("/residents"),

//   addResident: (data) =>
//     request("/residents", {
//       method: "POST",
//       body: JSON.stringify(data)
//     }),

//   deleteResident: (id) =>
//     request(`/residents/${encodeURIComponent(id)}`, {
//       method: "DELETE"
//     }),

//   // MAINTENANCE BILLS
//   getBills: () =>
//     request("/bills"),

//   generateBills: (month) =>
//     request("/bills/generate", {
//       method: "POST",
//       body: JSON.stringify({ month })
//     }),

//   // PAYMENTS
//   getPayments: ({ flatNumber, currentMonth = false } = {}) => {
//     const params = new URLSearchParams();

//     if (flatNumber) params.set("flat", flatNumber);
//     if (currentMonth) params.set("currentMonth", "true");

//     const query = params.toString();

//     return request(`/payments${query ? `?${query}` : ""}`);
//   },

//   addPayment: (data) =>
//     request("/payments", {
//       method: "POST",
//       body: JSON.stringify(data)
//     }),

//   submitPayment: (data) =>
//     request("/payments/submit", {
//       method: "POST",
//       body: JSON.stringify(data)
//     }),

//   updatePayment: (id, data) =>
//     request(`/payments/${encodeURIComponent(id)}`, {
//       method: "PATCH",
//       body: JSON.stringify(data)
//     }),

//   // RESIDENT BILL DETAILS
//   getResidentBills: (flatNumber) =>
//     request(`/resident/${encodeURIComponent(flatNumber)}/bills`),

//   // ADMIN PAYMENT VERIFICATION
//   verifyPayment: (id) =>
//     request(`/payments/${id}/verify`, {
//       method: "PATCH"
//     }),

//   // ADMIN PAYMENT REJECTION
//   rejectPayment: (id) =>
//     request(`/payments/${id}/reject`, {
//       method: "PATCH"
//     }),

//   // EXPENSES
//   getExpenses: () =>
//     request("/expenses"),

//   addExpense: (data) =>
//     request("/expenses", {
//       method: "POST",
//       body: JSON.stringify(data)
//     }),

//   updateExpense: (id, data) =>
//     request(`/expenses/${encodeURIComponent(id)}`, {
//       method: "PATCH",
//       body: JSON.stringify(data)
//     }),

//   deleteExpense: (id) =>
//     request(`/expenses/${encodeURIComponent(id)}`, {
//       method: "DELETE"
//     }),

//   // STAFF
//   getStaff: () =>
//     request("/staff"),

//   getStaffPayments: () =>
//     request("/staff/payments"),

//   // STAFF SALARY
//   recordSalary: (month) =>
//     request("/staff/payments", {
//       method: "POST",
//       body: JSON.stringify({ month })
//     }),

//   // REPORTS
//   getReports: () =>
//     request("/reports")
// };

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:4000/api";

const TOKEN_KEY = "apartment_portal_token";

async function request(endpoint, options = {}) {
  const token = sessionStorage.getItem(TOKEN_KEY);

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers
    }
  });

  let result;

  try {
    result = await response.json();
  } catch {
    throw new Error("Invalid response from server");
  }

  if (!response.ok) {
    if (response.status === 401) {
      sessionStorage.removeItem(TOKEN_KEY);
    }
    throw new Error(result.message || "Request failed");
  }

  return result;
}

export const api = {
  login: async (data) => {
    const result = await request("/auth/login", {
      method: "POST",
      body: JSON.stringify(data)
    });

    if (result.token) {
      sessionStorage.setItem(TOKEN_KEY, result.token);
    }

    return result;
  },

  clearAuthToken: () => {
    sessionStorage.removeItem(TOKEN_KEY);
  },

  getFlats: () => request("/flats"),

  getResidents: () => request("/residents"),

  addResident: (data) =>
    request("/residents", {
      method: "POST",
      body: JSON.stringify(data)
    }),

  deleteResident: (id) =>
    request(`/residents/${encodeURIComponent(id)}`, {
      method: "DELETE"
    }),

  getBills: () => request("/bills"),

  generateBills: (month) =>
    request("/bills/generate", {
      method: "POST",
      body: JSON.stringify({ month })
    }),

  getPayments: ({ flatNumber, currentMonth = false } = {}) => {
    const params = new URLSearchParams();

    if (flatNumber) params.set("flat", flatNumber);
    if (currentMonth) params.set("currentMonth", "true");

    const query = params.toString();
    return request(`/payments${query ? `?${query}` : ""}`);
  },

  addPayment: (data) =>
    request("/payments", {
      method: "POST",
      body: JSON.stringify(data)
    }),

  submitPayment: (data) =>
    request("/payments/submit", {
      method: "POST",
      body: JSON.stringify(data)
    }),

  updatePayment: (id, data) =>
    request(`/payments/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(data)
    }),

  getResidentBills: (flatNumber) =>
    request(`/resident/${encodeURIComponent(flatNumber)}/bills`),

  verifyPayment: (id) =>
    request(`/payments/${encodeURIComponent(id)}/verify`, {
      method: "PATCH"
    }),

  rejectPayment: (id) =>
    request(`/payments/${encodeURIComponent(id)}/reject`, {
      method: "PATCH"
    }),

  getExpenses: () => request("/expenses"),

  addExpense: (data) =>
    request("/expenses", {
      method: "POST",
      body: JSON.stringify(data)
    }),

  updateExpense: (id, data) =>
    request(`/expenses/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(data)
    }),

  deleteExpense: (id) =>
    request(`/expenses/${encodeURIComponent(id)}`, {
      method: "DELETE"
    }),

  getStaff: () => request("/staff"),

  getStaffPayments: () => request("/staff/payments"),

  recordSalary: (month) =>
    request("/staff/payments", {
      method: "POST",
      body: JSON.stringify({ month })
    }),

  getReports: () => request("/reports")
};
