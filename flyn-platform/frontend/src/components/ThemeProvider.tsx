/**
 * Theme Provider
 * ---------------
 * Manages dark/light mode using next-themes.
 * Dark mode is the default. next-themes adds "dark" or "light" class to <html>.
 * CSS: :root has dark-mode values, .light overrides them.
 */

import { ThemeProvider as NextThemesProvider } from "next-themes";

type ThemeProviderProps = React.ComponentProps<typeof NextThemesProvider>;

export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem={true}
      disableTransitionOnChange={false}
      {...props}
    >
      {children}
    </NextThemesProvider>
  );
}
