function readArray(key) {
  try {
    const value = JSON.parse(window.localStorage.getItem(key) ?? "[]");
    return Array.isArray(value) ? value : [];
  } catch (error) {
    console.error(`Could not read saved "${key}" data.`, error);
    return [];
  }
}

export function readLegacyLibrary() {
  try {
    if (window.localStorage.getItem("commonplace-backend-imported") === "true") {
      return { books: [], users: [], transactions: [] };
    }
  } catch (error) {
    console.error("Could not check whether the saved library was imported.", error);
  }
  return {
    books: readArray("commonplace-books"),
    users: readLegacyAccounts(),
    transactions: readArray("commonplace-transactions"),
  };
}

export function readLegacyAccounts() {
  return readArray("commonplace-users");
}
