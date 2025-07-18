export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return <html>
        <body>
            <div className="flex flex-col items-center justify-center h-screen">
                {children}
            </div>
        </body>
    </html>;
}       