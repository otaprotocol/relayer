import "./globals.css"

import { ThemeProvider as NextThemesProvider } from "next-themes"

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return <html>
        <body>
            <NextThemesProvider
                attribute="class"
                defaultTheme="system"
                enableSystem
                disableTransitionOnChange
            >
                {children}
            </NextThemesProvider>
        </body>
    </html>;
}       