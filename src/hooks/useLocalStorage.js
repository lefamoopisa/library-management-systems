import { useEffect, useState } from "react";

export function useLocalStorage(key, initialValue) {
  const [value, setValue] = useState(() => {
    try {
      const savedValue = window.localStorage.getItem(key);
      return savedValue === null ? initialValue : JSON.parse(savedValue);
    } catch (error) {
      console.error(`Could not read "${key}" from local storage.`, error);
      return initialValue;
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      console.error(`Could not save "${key}" to local storage.`, error);
    }
  }, [key, value]);

  return [value, setValue];
}
