import { useEffect, useRef, useMemo } from 'react';

export function useDebouncedCallback<T extends (...args: any[]) => any>(
  callback: T,
  delay: number
) {
  const callbackRef = useRef(callback);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const argsRef = useRef<Parameters<T> | null>(null);

  // Keep callback ref up to date
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  // Create the debounced function
  const debounced = useMemo(() => {
    const func = (...args: Parameters<T>) => {
      // Store the latest arguments
      argsRef.current = args;

      // Clear any existing timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      // Schedule the new call
      timeoutRef.current = setTimeout(() => {
        if (argsRef.current) {
          callbackRef.current(...argsRef.current);
        }
        timeoutRef.current = null;
        argsRef.current = null;
      }, delay);
    };

    // Add cancel method
    func.cancel = () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
        argsRef.current = null;
      }
    };

    // Add flush method
    func.flush = () => {
      if (timeoutRef.current && argsRef.current) {
        clearTimeout(timeoutRef.current);
        callbackRef.current(...argsRef.current);
        timeoutRef.current = null;
        argsRef.current = null;
      }
    };

    return func;
  }, [delay]);

  return debounced;
}
