// Utility per combinare classi Tailwind in modo sicuro.
// clsx unisce le classi, tailwind-merge risolve i conflitti (es. p-2 + p-4 → solo p-4).
// Usata da tutti i componenti shadcn e dai nostri componenti custom.
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
